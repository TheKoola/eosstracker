#!/usr/bin/python3
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2023 Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################

import os
import math
from math import radians, cos, sin, asin, sqrt
import time
import datetime
import psycopg2 as pg
import sys
import numpy as np
from scipy.integrate import *
from scipy.interpolate import *
from scipy.optimize import *
from gps import *
import multiprocessing as mp
from inspect import getframeinfo, stack
import logging
from logging.handlers import QueueHandler, QueueListener
from dataclasses import dataclass, field

#import local configuration items
import habconfig



##################################################
# GPSPoller Class
##################################################
@dataclass
class GPSPoller(object): 
#    def __init__(self, dbConnectionString = None, stopevent = None, position = None):

    # The database connection string
    dbstring: str = habconfig.dbConnectionString

    # Placeholder for multiprocessing event from run() function
    stopevent: mp.Event = mp.Event()

    # this is the multiprocess dictionary that we regularly update with our position info 
    position: dict = None

    # The database connection object
    dbconn: pg.extensions.connection = None

    # This is the timezone string for when connecting to the database
    timezone: str = 'America/Denver'

    # This is the actual, GPS JSON file that the web frontend reads to get status.
    GPSStatusFile: str = "/eosstracker/www/gpsstatus.json"

    # This is a temp file that we write too first.  Then we'll rename this to the actual GPS JSON file.
    GPSStatusTempFile: str = "/eosstracker/www/gpsstatus.json.tmp"

    # the logging queue
    loggingqueue: mp.Queue = None

    # The hostname of where the GPSD instance lives
    # by default this is set to blank or the localhost.
    gpshost: str = "localhost"

    # default logging level
    logginglevel: int = logging.INFO

    # the GPS status dictionary
    gpsstatus: dict = field(default_factory=dict)


    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(self.logginglevel)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)


        # Set the gpshost value to all lower case
        self.gpshost = self.gpshost.lower()

        # gpshost value supplied is set localhost if blank or "local"
        if self.gpshost == "" or self.gpshost == "local":
            self.gpshost = "localhost"

        # Create our gpsstats object with nothing in it 
        if len(self.gpsstatus) == 0:
            self.gpsstatus = self.newGPSStatus()


    ################################
    # destructor
    def __del__(self):
        self.logger.debug("__del__: calling close()")
        self.close()


    ################################
    # Function for closing DB connection
    def close(self):
        try:

            self.clearGPSStatus()
            self.logger.debug("GPS status: {}".format(self.gpsstatus))

            # Save the GPS stats to the JSON status file
            self.savePosition()

            if self.dbconn:
                if not self.dbconn.closed:
                    self.logger.debug("Closing database connection")
                    self.dbconn.close()
                else:
                    self.logger.debug("Database connection was already closed")
            else:
                self.logger.debug("Database connection not created.")
        except pg.DatabaseError as error:
            self.logger.error(f"Database error: {error}")


    ################################
    # Set the database connection string
    ################################
    def setDBConnection(self, dbstring = None):

        # Set the database connection 
        if dbstring:
            self.logger.debug("Setting databse connection string to: %s" % dbstring)
            self.dbstring = dbstring


    ################################
    # Function for connecting to the database
    ################################
    def _connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            self.logger.debug("Database connection string not set.")
            return False

        try:

            # If not already connected to the database, then try to connect
            if not self.dbconn:
                self.logger.debug("Connecting to the database: %s" % self.dbstring)

                # Connect to the database
                self.dbconn = pg.connect (self.dbstring)

                # Set autocommit to on
                self.dbconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.close()
            self.logger.error("Database error: {error}")
            return False


    ##################################################
    # Save GPS status to JSON file
    # ...saves the GPS data (JSON) to a status file that the web frontend reads
    ##################################################
    def _saveGPSStatus(self, gs: dict = None)->None:

        gpsstats = self.gpsstatus
        if gs:
            gpsstats = gs

        # Open the temporary file and save our contents to that first.
        with open(self.GPSStatusTempFile, "w") as f:
            f.write(json.dumps(gpsstats))

        # Now rename our temporary file to the actual GPS JSON status file.  Doing this prevents the web page from getting "half a status" update
        # because our GPS JSON file was being written to.
        if os.path.isfile(self.GPSStatusTempFile):
            os.rename(self.GPSStatusTempFile, self.GPSStatusFile)


    ##################################################
    # update the shared (between processes) dictionary
    # ...other processes read this shared object to get the latest position
    ##################################################
    def _updatePosition(self, gs: dict = None)->None:

        gpsstats = self.gpsstatus
        if gs:
            gpsstats = gs

        # if we've got a valid position object then update that with this new gps info
        if self.position is not None:
            self.position["gpsdata"] = gpsstats


    ##################################################
    # update our position for downstream consumers
    # ...basically a wrapper for the other updates functions
    ##################################################
    def savePosition(self, gs: dict = None)->None:

        gpsstats = self.gpsstatus
        if gs:
            gpsstats = gs

        self.logger.debug(f"GPS status: {gpsstats=}")

        # Save the GPS stats to the JSON status file
        self._saveGPSStatus(gpsstats)
        self._updatePosition(gpsstats)


    #####################################
    # create a new, blank, GPS Status dictionary
    #####################################
    def newGPSStatus(self, errmessage: str = None)->dict:

        # default GPS status object
        gpsstats = { "utc_time" : "n/a", 
                     "mode" : int(0), 
                     "host" : self.gpshost,
                     "status" : "no device", 
                     "devicepath" : "n/a",
                     "lat" : float(0.0), 
                     "lon" : float(0.0), 
                     "satellites" : [], 
                     "bearing" : float(0.0), 
                     "speed_mph" : float(0.0), 
                     "altitude" : float(0.0),
                     "error" : errmessage if errmessage else "n/a"
                    }

        return gpsstats


    #####################################
    # Clear the GPS Status
    #####################################
    def clearGPSStatus(self)->None:

        self.gpsstatus = self.newGPSStatus()


    #####################################
    # create a datetime string
    # ...we do this because some GPS's dont return the correct year 
    #####################################
    def createDateString(self, gpstime: str = None)->str:

        # Current system datetime                
        utc_datetime = datetime.datetime.now(datetime.timezone.utc)

        if not gpstime:
            return utc_datetime.isoformat(timespec='seconds') + 'Z'

        try:
            # convert the incoming datetime string to a datetime object
            gpsdatetime = datetime.datetime.strptime(gpstime, '%Y-%m-%dT%H:%M:%S.%fZ')

            # make sure the year is correct.  If not, then just return the system's datetime
            if gpsdatetime.year == utc_datetime.year:
                return gpsdatetime.isoformat(timespec='seconds') + 'Z'

        except ValueError:
            pass

        # there was an error of some kind so just use the system's datetime instead
        return utc_datetime.isoformat(timespec='seconds') + 'Z'


    #####################################
    # GPS activation...loops waiting on the GPS to be activated 
    # ...assumes we already have a connection to GPSD, we're just waiting on a GPS device to be found/activiated
    #####################################
    def gpsActivation(self, gpsd: gps = None, retrylimit: int = 100)->bool:

        if not gpsd:
            return False

        # initialization
        gpsDeviceFound = False
        loopcounter = 0
        report = {'class' : None}
        gpspath = "n/a"

        # retry delays in seconds
        gpsd_timeout = 0.5
        short_delay = 1
        long_delay = 5


        #########
        # GPS device activation loop...
        #
        # Loop until GPSD reports that a GPS device has been activated or the retry limit is reached
        #########
        while gpsDeviceFound == False and not self.stopevent.is_set() and loopcounter < retrylimit:

            # Get latest status from GPSD
            try: 

                # check if there is any data available from GPSD. 
                available = gpsd.waiting(timeout = gpsd_timeout)

                # was data available?
                if available:
                    self.logger.debug(f"Reading from gpsd...")
                    report = next(gpsd)

                    # Sanity check
                    if 'class' not in report:
                        report['class'] = None

                    # If GPSD is reporting a DEVICE or DEVICES event then look at that to see if a GPS device was actually "activated"
                    if report['class'] == "DEVICE":
                        if "path" in report and "activated" in report:
                            if report["activated"]:
                                gpsDeviceFound = True
                                if "path" in report:
                                    gpspath = report["path"]
                                else:
                                    gpspath = "n/a"
                    elif report['class'] == "DEVICES":
                        gpspath = ""
                        for gpsdev in report["devices"]:
                            if "path" in gpsdev and "activated" in gpsdev:
                                if gpsdev["activated"]:
                                    gpsDeviceFound = True
                                    if "path" in gpsdev:
                                        gpspath = gpspath + gpsdev["path"] + " "

                    # no device was found, update the status as such
                    if gpsDeviceFound == False:
                        self.logger.debug(f"Activation loop {loopcounter=}, {self.gpsstatus=}")

                        # set the gpsstatus dictionary
                        self.clearGPSStatus()
                        self.gpsstatus['mode'] = int(report["mode"]) if "mode" in report else 0
                        self.gpsstatus['error'] = "Waiting on device to become ready"

                        # Save the status of the GPS(s)
                        self.savePosition()

                else:
                    self.logger.debug(f"No data was available from GPSD.")

            except Exception as error:

                # Set this to false
                gpsDeviceFound = False
                self.logger.debug(f"Unable to connect to GPSD running on {self.gpshost}:  {error}")

                # Break out of this loop
                break

            # throttle the loop speed
            if loopcounter < 10:
                # Wait short amount of time so the loop isn't spinning at warp speed
                self.stopevent.wait(short_delay)

            else:
                # Wait a little longer if we've already been looping for a while
                self.stopevent.wait(long_delay)


            # increment the device activation loop counter
            loopcounter += 1

        #########
        # End of device activation loop...
        #########

         
        # if a device was activated by GPSD, then save the current status 
        if gpsDeviceFound:

            datetime_record = self.createDateString(gpsd.utc)

            self.clearGPSStatus()
            self.gpsstatus['utc_time'] = str(datetime_record) if datetime_record else "n/a"
            self.gpsstatus['mode'] = int(report["mode"]) if "mode" in report else 0
            self.gpsstatus["status"] = "waiting on device"
            self.gpsstatus['error'] = "n/a"
            self.gpsstatus["devicepath"] = str(gpspath)

            self.logger.debug("GPS activated: {}".format(self.gpsstatus))

            # Save the status of the GPS(s)
            self.savePosition()


        # return boolean on if a device was found or not
        return gpsDeviceFound



    ##################################################
    # connect to GPSD
    ##################################################
    def connectToGPSD(self, retrydelay: int = 5, retrylimit: int = 0)->gps:

        # initialization
        loopcounter = 0
        retrylimit = retrylimit if retrylimit > 0 else 2178310
        gpsd = None

        # Unlike with other processes we want to continuously try and connect to GPSD to get our position (okay...every few secs),
        # however, we need to throttle the error/connection messages that are logged if we're continually looping trying to connect.
        # Long story short, we try to connect every few seconds, but as the try count increases, throttle the logging output.  We 
        # do that by only logging reconnection attempts for specific attempt #'s (i.e. the loop counter)
        #
        # list of try counts for which we'll actually log an error/retry message for (based off of fib series)
        trycounts = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181, 6765, 10946, 17711, 28657, 46368, 75025, 121393, 196418, 317811, 514229, 832040, 1346269, 2178309]

        # lambda function to check if we should log a retry message or not
        displaylogmsg = lambda c : True if c in trycounts else False

        # Primary loop.  We loop forever until connected to GPSD or the stopevent is triggered (from somewhere else in the application)
        while not gpsd and not self.stopevent.is_set() and loopcounter < retrylimit:

            # Connect to the GPSD daemon
            try:
                if displaylogmsg(loopcounter):
                    self.logger.info(f"Attempting to connect to GPSD running on {self.gpshost}") 

                # attempt a connection to GPSD
                gpsd = gps(mode=WATCH_ENABLE, host = self.gpshost)

                self.logger.debug(f"Connected to gpsd: {gpsd=}")

                # zero out the retry counter
                loopcounter = 0

            except Exception as error:

                if displaylogmsg(loopcounter):
                    self.logger.error(f"Unable to connect to GPSD on {self.gpshost} {loopcounter=}:  {error}")

                # Update the GPS status
                self.gpsstatus['error'] = str(error)
                self.savePosition()

                # increment the retry counter
                loopcounter += 1

                # Wait for a few seconds, then continue
                self.stopevent.wait(retrydelay)


        return gpsd



    ##################################################
    # Connect to the database.  This will loop until connected or the retry limit is reached.
    ##################################################
    def connectToDatabase(self, retrydelay: int = 5, retrylimit: int = 100)->bool:

        # initialization
        loopcounter = 0
        dbconnection = False

        # loop until connected to the database or the retry limit is reached
        while not self.stopevent.is_set() and loopcounter < retrylimit:
            dbconnection = self._connectToDatabase()

            # if connected, the break out of this loop
            if dbconnection:
                break

            loopcounter += 1
            self.stopevent.wait(retrydelay)

        # return status
        return dbconnection
        

    ##################################################
    # The run loop
    ##################################################
    def run(self):

        # main steps:
        #     1) clear GPS status info both to JSON file and the shared mem object
        #     2) connect to GPSD
        #     3) wait for GPSD to advertise that it's connected to a GPS device (i.e. device activation)
        #     4) connect to the backend postgresql database
        #     5) poll for position updates from the GPS (will run forever unless something happens)
        #     6) close stuff down
        #     7) go back to step 1 and repeat
        #
        # Primary loop for handling GPS connections and polling.  Loop forever until the application signals to stop.
        while not self.stopevent.is_set():

            # Blank out the GPS status
            self.clearGPSStatus()
            self.savePosition()

            # Connect to the GPSD daemon.  This will block until connected..
            gpsd = self.connectToGPSD(retrydelay = 5)

            # sanity check
            # if unable to connect to GPSD, then restart this main loop
            if not gpsd:
                continue

            ########################
            # if here, then the connection to GPSD was successful
            ########################
            self.logger.info(f"Connection to GPSD on {self.gpshost} successful.  Now waiting on device...")

            # Wait for GPSD to activate the device.  This will block while waiting on GPSD to report a device is attached or the retry limit is reached
            gpsDeviceFound = self.gpsActivation(gpsd = gpsd, retrylimit = 100)

            # sanity check
            # if no device was found, then restart this main loop
            if not gpsDeviceFound:
                continue


            ########################
            # if here, then the a GPS device was found/activated
            ########################

            # if the connection to the database is unsuccessful, then restart this main loop
            if not self.connectToDatabase(retrydelay = 5, retrylimit = 10):
                # can't connect to the DB, so we close the GPSD connection and restart this loop
                self.logger.error(f"Unable to connect to the database.")
                gpsd.close()
                continue

            ########################
            # if here, then...
            #     - GPSD connection successful
            #     - GPSD reports device activiated
            #     - database connection was successful
            ########################
            self.logger.info(f"Connection to GPS on {self.gpshost} established.  Device={self.gpsstatus['devicepath']}")

            # poll for position updates.  This will run forever unless something bad happens or the application signals to end.
            self.pollGPS(gpsd = gpsd)

            # Close GPSD connection.
            self.logger.debug(f"Closing gpsd: {gpsd=}")
            gpsd.close()

        ##########
        # End of primary loop
        #
        # This process is now ending so we start shutdown tasks
        ###########

        # Close GPSD connection if it's still open.
        if gpsd is not None:
            gpsd.close()

        # Blank out the GPS status json file and memory objects
        self.clearGPSStatus() 
        self.savePosition()

        # Close the database connection
        self.close()
        self.logger.info("GPS poller ended.")



    ##################################################
    # create the satellites list from the output of GPSD
    ##################################################
    def createSatellites(self, gpsreport: dict = None)->list:

        if gpsreport is None:
            return []

        # For any position report we want to update the JSON GPS status file (read by the web home page), regardless
        # if we saved our position in the database or not.
        mysats = []
        mysats_sorted = []

        if 'satellites' in gpsreport:
        
            # Create a list of the satellites and their particulars
            for sat in gpsreport['satellites']:
                mysats.append({ "prn": str(sat.PRN), "elevation" : str(sat.el), "azimuth" : str(sat.az), "snr" : str(sat.ss), "used" : str(sat.used) })

            # If the satellite list is populated, then sort it so that satellites used for a position fix are listed first.
            if len(gpsreport['satellites']) > 0:
                mysats_sorted = sorted(mysats, key=lambda k: k['used'], reverse=True)

        return mysats_sorted



    ##################################################
    # the primary GPS polling function.  This will run forever unless something bad happens or the application signals to end
    ##################################################
    def pollGPS(self, gpsd: gps = None)->None:

        # sanity check
        if not gpsd:
            return

        # Create a new database cursor to be used for queries and inserts and such
        try:
            gpscur = self.dbconn.cursor()

        # If a database error occured, print the error, close connections, and return
        except pg.DatabaseError as error:
            self.logger.error(f"Database error: {error}")
            gpsd.close()
            self.close()
            return 

        # Loop initialization params...
        prevlat = 0
        prevlon = 0
        timeprev = ""
        last_insert_time = datetime.datetime.now(datetime.timezone.utc)
        lastmode = 0
        gpsd_timeout = 0.5
        tiny_delay = 0.5
        short_delay = 1
        long_delay = 5
        report = {'class': None}
        satellites = []

        ##########
        # Position reporting loop...
        # This is the main GPS position polling loop.  Once a device has been activated and is reporting positions, stay in this loop.
        ##########
        while not self.stopevent.is_set():

            try: 

                # check if there is any data available from GPSD. 
                available = gpsd.waiting(timeout = gpsd_timeout)

                if available:
                    self.logger.debug(f"Reading from gpsd...")
                    report = next(gpsd)
                else:
                    self.logger.debug(f"No data was available from GPSD.")

                    # set the report to "None"
                    #report['class'] = None

                    # wait a little before trying again
                    self.stopevent.wait(tiny_delay)


            except Exception as error:

                # Set this to false 
                gpsDeviceFound = False
                self.logger.error(f"Error getting status from GPSD running on {self.gpshost}:  {error}")

                # Break out of this loop as we're no longer connected to GPSD (or something bad has happened)
                break

            # the time string we'll use for the GPS stats object
            datetime_record = self.createDateString(gpsd.utc)

            # get the GPS mode.  Being careful to convert to int
            gpsmode = 0
            try:
                gpsmode = int(report["mode"]) if "mode" in report else 0

            except ValueError:
                gpsmode = 0


            # If GPSD provided a Time-Position-Velocity report we process that...
            if report['class'] == 'TPV':

                # Get the GPS device path (if reported)
                if "device" in report:
                    gpspath = report["device"]
                else:
                    gpspath = "n/a"

                # If the device is reporting that it has a 3D fix, then we want to grab our position.
                # 3D Fix
                if gpsmode == 3:

                    if lastmode != gpsmode:
                        self.logger.info(f"3D GPS fix acquired: {gpsd.fix.latitude}, {gpsd.fix.longitude} @ {round(gpsd.fix.altitude * 3.2808399, 0)}ft")
                    lastmode = gpsmode

                    # calculate the elapsed time between the last database position insert.  If it's been longer than some minimum interval then we want to add 
                    # a new row to the database regardless if our position has moved or not.
                    elapsed_time = datetime.datetime.now(datetime.timezone.utc) - last_insert_time

                    # If our position has changed by .0001 of a lat/lon degree, then we consider it significant enough to add a row to the database
                    if (round(gpsd.fix.latitude,4) != prevlat or round(gpsd.fix.longitude,4) != prevlon) or elapsed_time.total_seconds() > 7200:

                        self.logger.debug(f"GPS timezone: {self.timezone}")

                        # columns for the gpsposition table (for reference)
                        #-------------+--------------------------+-----------+----------+---------
                        # tm          | timestamp with time zone |           | not null |
                        # speed_mph   | numeric                  |           |          |
                        # bearing     | numeric                  |           |          |
                        # altitude_ft | numeric                  |           |          |
                        # location2d  | geometry(Point,4326)     |           |          |
                        # location3d  | geometry(PointZ,4326)    |           |

                        # SQL statement
                        sql = """insert into
                            gpsposition (tm, speed_mph, bearing, altitude_ft, location2d, location3d) values (
                                (%s::timestamp at time zone 'UTC')::timestamp with time zone at time zone %s,
                                %s::numeric,
                                %s::numeric,
                                %s::numeric,
                                ST_GeometryFromText('POINT(%s %s)', 4326),
                                ST_GeometryFromText('POINTZ(%s %s %s)', 4326)
                            );"""

                        # The time of the last GPS position fix
                        thetime = datetime_record

                        # If our position is non-zero and altitude is > 0 then proceed with the database insert
                        if gpsd.fix.latitude != 0 and gpsd.fix.longitude != 0 and gpsd.fix.altitude >= 0:

                            # Only insert this record into the database if we've not already had an update for this GPS position
                            if thetime != timeprev:
                                try:
                                    gpscur.execute(sql, [
                                        thetime,
                                        self.timezone,
                                        round(gpsd.fix.speed * 2.236936, 1),
                                        gpsd.fix.track,
                                        round(gpsd.fix.altitude * 3.2808399, 0),
                                        gpsd.fix.longitude,
                                        gpsd.fix.latitude,
                                        gpsd.fix.longitude,
                                        gpsd.fix.latitude,
                                        gpsd.fix.altitude
                                    ])

                                    # Commit the transaction to PostgreSQL
                                    self.dbconn.commit()

                                    # Set the previous time to this time
                                    timeprev = thetime

                                    # Save this position for the next iteration of the loop
                                    prevlat = round(gpsd.fix.latitude,4)
                                    prevlon = round(gpsd.fix.longitude,4)

                                    # log the time of this database insert
                                    last_insert_time = datetime.datetime.now(datetime.timezone.utc)
                       
                                # If a database error occured, print the error, the set the variable so that this loop ends.
                                except pg.DatabaseError as error:
                                    self.logger.error(f"Database error: {error}")

                                    # Something bad happened to the database connection.  Break out of this loop.
                                    break


                    # update the gpsstatus dictionary
                    try:
                        self.gpsstatus = { "utc_time" : str(datetime_record),
                                     "mode" : int(gpsd.fix.mode),
                                     "host" : self.gpshost,
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : float(round(gpsd.fix.latitude, 6)),
                                     "lon" : float(round(gpsd.fix.longitude, 6)),
                                     "satellites" : satellites,
                                     "bearing" : float(round(gpsd.fix.track, 0)),
                                     "speed_mph" : float(round(gpsd.fix.speed * 2.236936, 1)),
                                     "altitude" : float(round(gpsd.fix.altitude * 3.2808399, 0)),
                                     "error" : "n/a"
                                   }
                    except ValueError as error:
                        self.logger.debug(f"Error converting value: {error}")

                        # something happened with converting a value. we blank the GPS status, and continue on... 
                        self.clearGPSStatus()


                    self.logger.debug(f"GPS status: {self.gpsstatus}")

                    # Save the GPS stats
                    self.savePosition()


                # For a 2D Fix still report lat/lon/altitude if available, but don't insert a row into the database.
                # 2D Fix
                elif gpsmode == 2:
                    mysats = []
                    mysats_sorted = []

                    if lastmode != gpsmode:
                        self.logger.info(f"2D GPS fix acquired")
                    lastmode = gpsmode

                    # update the gpsstatus dictionary
                    try:
                        self.gpsstatus = { "utc_time" : str(datetime_record),
                                     "mode" : int(gpsd.fix.mode),
                                     "host" : self.gpshost,
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : float(round(gpsd.fix.latitude, 6)),
                                     "lon" : float(round(gpsd.fix.longitude, 6)),
                                     "satellites" : satellites,
                                     "bearing" : float(round(gpsd.fix.track, 0)),
                                     "speed_mph" : float(round(gpsd.fix.speed * 2.236936, 1)),
                                     "altitude" : float(round(gpsd.fix.altitude * 3.2808399, 0)),
                                     "error" : "n/a"
                                       }
                    except ValueError as error:
                        self.logger.debug(f"Error converting value: {error}")

                        # something happened with converting a value. we blank the GPS status, and continue on... 
                        self.clearGPSStatus()

                    self.logger.debug(f"GPS status: {self.gpsstatus}")

                    # Save the GPS stats
                    self.savePosition()

                # for all other Fix status (ex. no data and No Fix)
                else:

                    if lastmode != gpsmode:
                        self.logger.info(f"No GPS fix.")
                    lastmode = gpsmode

                    # Our GPS stats object
                    self.clearGPSStatus()
                    self.gpsstatus['utc_time'] = str(datetime_record)
                    self.gpsstatus['mode'] = int(gpsd.fix.mode) if gpsd.fix.mode else 0
                    self.gpsstatus["status"] = "acquiring fix"
                    self.gpsstatus['satellites'] = satellites
                    self.gpsstatus['devicepath'] = str(gpspath)

                    self.logger.debug(f"GPS status: {self.gpsstatus}")

                    # Save the GPS stats
                    self.savePosition()

            # For a DEVICE report from GPSD, check the status of the device, was it activated or deactivated?
            elif report['class'] == "DEVICE":

                # Get the GPS device path (if reported)
                if "path" in report:
                    gpspath = report["path"]
                else:
                    gpspath = "n/a"

                self.logger.debug(f"DEVICE:  {report['path']}, {report['activated']}, {self.gpsstatus['devicepath']}")

                # check if a device was deactivated and if it was the device we were using
                if 'activated' in report:
                    if report['activated'] == 0 or report['activated'] == "0":

                        # a device was just deactivated...was it our device?
                        if 'path' in report:
                            if report['path'] == self.gpsstatus['devicepath']:

                                # it was our device that was deactivated, so log that and then break out of this loop
                                self.logger.error(f"Lost connection to GPS device, {self.gpsstatus['devicepath']}")

                                # Our GPS stats object
                                self.clearGPSStatus()
                                self.gpsstatus['utc_time'] = str(datetime_record)
                                self.gpsstatus['devicepath'] = str(gpspath)
                                self.gpsstatus["status"] = "no device"
                                self.gpsstatus["error"] = "lost connection to device"

                                # Save the GPS stats
                                self.savePosition()
                                break

            elif report['class'] == 'SKY':

                # for SKY reports look to get the list of satellites used
                if "satellites" in report:
                    satellites = self.createSatellites(gpsreport = report)
                    self.logger.debug(f"{satellites=}")

            else:
                # ignore all other report types
                pass


        self.logger.debug(f"position polling loop ending")


##################################################
# runGPSPoller process
##################################################
def runGPSPoller(config, logginglevel: int = logging.INFO):
    try:
        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logginglevel)
        logger.propagate = False

        # Create a new GPSPoller object
        logger.info("Starting GPS poller process.")
        g = GPSPoller(stopevent = config["stopevent"], position = config["position"], loggingqueue = config["loggingqueue"], gpshost = config["gpshost"], timezone = config["timezone"], logginglevel = logginglevel)

        # Start the poller
        g.run()

    except (KeyboardInterrupt, SystemExit):
        logger.debug(f"runGPSPoller caught keyboardinterrupt")
        config["stopevent"].set()
        g.close()



##################################################
# for debugging purposes
##################################################
if __name__ == "__main__":

    # the logging level we want to use for debugging
    logginglevel = logging.DEBUG

    # setup logging
    logger = logging.getLogger(__name__)
    logger.propagate = False
    logger.setLevel(logginglevel)
    formatstr = "%(asctime)s - %(levelname)s - %(module)s - %(message)s"
    formatter = logging.Formatter(formatstr)

    # logging output to the console (i.e. stdout, stderr) 
    ch = logging.StreamHandler(stream=sys.stdout)
    ch.setLevel(logginglevel)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # setup a queue that will be used the other sub-processes to send their logging to this process
    loggingqueue = mp.Queue()

    # Now create the QueueListener handler that will ingest logs from other processes
    qlistener = QueueListener(loggingqueue, ch)
    qlistener.start()

    # Create a manager object
    manager = mp.Manager()

    gpshost = ""
    if len(sys.argv) > 1:
        gpshost = sys.argv[1]

    conf = {
            "loggingqueue" : loggingqueue,
            "stopevent": mp.Event(),
            "gpshost" : gpshost,
            "timezone": "America/Denver",
            "position": manager.dict()
            }

    runGPSPoller(conf, logginglevel = logginglevel)
    qlistener.stop()

