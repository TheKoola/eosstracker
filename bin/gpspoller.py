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
from logging.handlers import QueueHandler
from dataclasses import dataclass

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

    # The database connection retry limit.
    connectionRetryLimit: int = 99

    # This is the actual, GPS JSON file that the web frontend reads to get status.
    GPSStatusFile: str = "/eosstracker/www/gpsstatus.json"

    # This is a temp file that we write too first.  Then we'll rename this to the actual GPS JSON file.
    GPSStatusTempFile: str = "/eosstracker/www/gpsstatus.json.tmp"

    # the logging queue
    loggingqueue: mp.Queue = None

    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)


    ################################
    # destructor
    def __del__(self):
        self.logger.debug("__del__: calling close()")
        self.close()


    ################################
    # Function for closing DB connection
    def close(self):
        try:

            # Our GPS stats object
            gpsstats = { "utc_time" : "n/a", 
                         "mode" : "0", 
                         "status" : "no device", 
                         "devicepath" : "",
                         "lat" : "n/a", 
                         "lon" : "n/a", 
                         "satellites" : [], 
                         "bearing" : 0, 
                         "speed_mph" : 0, 
                         "altitude" : 0 
                        }

            self.logger.debug("GPS status: {}".format(gpsstats))

            # Save the GPS stats to the JSON status file
            self._saveGPSStatus(gpsstats)
            self.updatePosition(gpsstats)

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
    def setDBConnection(self, dbstring = None):

        # Set the database connection 
        if dbstring:
            self.logger.debug("Setting databse connection string to: %s" % dbstring)
            self.dbstring = dbstring


    ################################
    # Function for connecting to the database
    def connectToDatabase(self, dbstring = None):
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
    ##################################################
    def _saveGPSStatus(self, gpsstatus):

        # Open the temporary file and save our contents to that first.
        with open(self.GPSStatusTempFile, "w") as f:
            f.write(json.dumps(gpsstatus))

        # Now rename our temporary file to the actual GPS JSON status file.  Doing this prevents the web page from getting "half a status" update
        # because our GPS JSON file was being written to.
        if os.path.isfile(self.GPSStatusTempFile):
            os.rename(self.GPSStatusTempFile, self.GPSStatusFile)


    ##################################################
    # update our position
    ##################################################
    def updatePosition(self, gpsdata):

        # if we've got a valid position object then update that with this new gps info
        if self.position is not None:
            self.position["gpsdata"] = gpsdata


    ##################################################
    # The run loop
    ##################################################
    def run(self):

        # Current system datetime                
        datetime_record = datetime.datetime.utcnow().isoformat() + 'Z'

        # Primary loop for handling GPS polling.
        while not self.stopevent.is_set():

            # Connect to the GPSD daemon
            gpsd = gps(mode=WATCH_ENABLE)

            # Connect to PostgreSQL
            dbconnect_trycount = 0
            while not self.connectToDatabase() and not self.stopevent.is_set() and dbconnect_trycount < self.connectionRetryLimit :
                dbconnect_trycount += 1
                e.wait(5)

            # If we're over the connection retry limit, then break out of this loop as we're unable to connect to the database
            if dbconnect_trycount >= self.connectionRetryLimit:
                break

            # Create a new databse cursor to be used for queries and inserts and such
            gpscur = self.dbconn.cursor()

            # Loop initialization params...
            gpspath = "n/a"
            gpsDeviceFound = False

            #########
            # GPS device activation loop...
            #
            # Loop until GPSD reports that a GPS device has been activated
            #########
            while gpsDeviceFound == False and not self.stopevent.is_set():
                # Get latest status from GPSD
                try: 
                    report = next(gpsd)
                except Exception as error:

                    # Set this to false so the inner loop will end
                    gpsDeviceFound = False

                # Current system datetime                
                utc_datetime = datetime.datetime.utcnow()

                # If a date was returned from the GPS, compare that to the system UTC date
                if gpsd.utc:
                    try:
                        gpsdatetime = datetime.datetime.strptime(gpsd.utc, '%Y-%m-%dT%H:%M:%S.%fZ')
                    except ValueError:
                        gpsdatetime = datetime.datetime.utcnow()

                    if gpsdatetime.year == utc_datetime.year:
                        datetime_record = gpsdatetime.isoformat() + 'Z'
                    else:
                        datetime_record = utc_datetime.isoformat() + 'Z'

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
                if gpsDeviceFound == False:
                    gpsstats = { "utc_time" : str(datetime_record),
                                 "mode" : str(report["mode"] if "mode" in report else "0"),
                                 "status" : "no device",
                                 "devicepath" : "n/a",
                                 "lat" : "n/a",
                                 "lon" : "n/a",
                                 "satellites" : [],
                                 "bearing" : "n/a", 
                                 "speed_mph" : "n/a",
                                 "altitude" : "n/a"
                                   }

                    self.logger.debug("activation loop: {}".format(gpsstats))

                    # Save the status of the GPS(s) to the status file
                    self._saveGPSStatus(gpsstats)
                    self.updatePosition(gpsstats)

            #########
            # End of device activation loop...
            #########



            # A GPS device has been activated...update the GPS JSON status file
            gpsstats = { "utc_time" : str(datetime_record),
                         "mode" : str(report["mode"] if "mode" in report else "0"),
                         "status" : "waiting on device",
                         "devicepath" : str(gpspath),
                         "lat" : "n/a",
                         "lon" : "n/a",
                         "satellites" : [],
                         "bearing" : "n/a", 
                         "speed_mph" : "n/a",
                         "altitude" : "n/a"
                           }

            self.logger.debug("GPS activated: {}".format(gpsstats))

            # Save the status of the GPS(s) to the status file
            self._saveGPSStatus(gpsstats)
            self.updatePosition(gpsstats)

            # Loop initialization params...
            prevlat = 0
            prevlon = 0
            timeprev = ""
            last_insert_time = datetime.datetime.utcnow()

            ##########
            # Position reporting loop...
            #
            # This is the main GPS loop.  Once a device has been activated and is reporting positions, stay in this loop.
            ##########
            while gpsDeviceFound == True and not self.stopevent.is_set():
                try: 
                    self.logger.debug("GETTING GPS REPORT")
                    report = next(gpsd)
                except Exception as error:

                    # Set this to false so the inner loop will end
                    gpsDeviceFound = False

                # Get the GPS device path (if reported)
                if "device" in report:
                    gpspath = report["device"]
                else:
                    gpspath = "n/a"

                # Current system datetime                
                utc_datetime = datetime.datetime.utcnow()

                # If a date was returned from the GPS, compare that to the system UTC date
                if gpsd.utc:
                    try:
                        gpsdatetime = datetime.datetime.strptime(gpsd.utc, '%Y-%m-%dT%H:%M:%S.%fZ')
                    except ValueError:
                        gpsdatetime = datetime.datetime.utcnow()

                    if gpsdatetime.year == utc_datetime.year:
                        datetime_record = gpsdatetime.isoformat() + 'Z'
                    else:
                        datetime_record = utc_datetime.isoformat() + 'Z'

                # If GPSD provided a Time-Position-Velocity report we process that...
                if report['class'] == 'TPV':

                    # If the device is reporting that it has a 3D fix, then we want to grab our position.
                    # 3D Fix
                    if report["mode"] == 3:

                        # calculate the elapsed time between the last database position insert.  If it's been longer than 15mins then we want to add 
                        # a new row to the database regardless if our position has moved or not.
                        elapsed_time = datetime.datetime.utcnow() - last_insert_time

                        # If our position has changed by .0001 of a lat/lon degree, then we consider it significant enough to add a row to the database
                        if (round(gpsd.fix.latitude,4) != prevlat or round(gpsd.fix.longitude,4) != prevlon) or elapsed_time.total_seconds() > 1500:

                            # SQL statement
                            sql = """insert into
                                gpsposition values (
                                    (%s::timestamp at time zone 'UTC')::timestamp with time zone at time zone 'America/Denver',
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
                                        last_insert_time = datetime.datetime.utcnow()
                           
                                    # If a database error occured, print the error, the set the variable so that this loop ends.
                                    except pg.DatabaseError as error:
                                        self.logger.error("Database error: {error}")

                                        # Set this so that we restart our primary/outer loop and re-connect to the database
                                        gpsDeviceFound = False


                        # For any position report we want to update the JSON GPS status file (read by the web home page), regardless
                        # if we saved our position in the database or not.
                        mysats = []
                        mysats_sorted = []
                        mymode = ""

                        # Create a list of the satellites and their particulars
                        for sat in gpsd.satellites:
                            mysats.append({ "prn": str(sat.PRN), "elevation" : str(sat.elevation), "azimuth" : str(sat.azimuth), "snr" : str(sat.ss), "used" : str(sat.used) })

                        # If the satellite list is populated, then sort it so that satellites used for a position fix are listed first.
                        if len(gpsd.satellites) > 0:
                            mysats_sorted = sorted(mysats, key=lambda k: k['used'], reverse=True)

                        # Our GPS stats object
                        gpsstats = { "utc_time" : str(datetime_record),
                                     "mode" : str(gpsd.fix.mode),
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : str(round(gpsd.fix.latitude, 6)),
                                     "lon" : str(round(gpsd.fix.longitude, 6)),
                                     "satellites" : mysats_sorted,
                                     "bearing" : str(round(gpsd.fix.track, 0)),
                                     "speed_mph" : str(round(gpsd.fix.speed * 2.236936, 1)),
                                     "altitude" : str(round(gpsd.fix.altitude * 3.2808399, 0))
                                   }

                        self.logger.debug("GPS status: {}".format(gpsstats))

                        # Save the GPS stats to the JSON status file
                        self._saveGPSStatus(gpsstats)
                        self.updatePosition(gpsstats)


                    # For a 2D Fix still report lat/lon/altitude if available.
                    # 2D Fix
                    elif report["mode"] == 2:
                        mysats = []
                        mysats_sorted = []
                        mymode = ""

                        # For any position report we want to update the JSON GPS status file (read by the web home page), regardless
                        # if we saved our position in the database or not.
                        for sat in gpsd.satellites:
                            mysats.append({ "prn": str(sat.PRN), "elevation" : str(sat.elevation), "azimuth" : str(sat.azimuth), "snr" : str(sat.ss), "used" : str(sat.used) })

                        # If the satellite list is populated, then sort it so that satellites used for a position fix are listed first.
                        if len(gpsd.satellites) > 0:
                            mysats_sorted = sorted(mysats, key=lambda k: k['used'], reverse=True)


                        # Our GPS stats object
                        gpsstats = { "utc_time" : str(datetime_record),
                                     "mode" : str(gpsd.fix.mode),
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : str(round(gpsd.fix.latitude, 6)),
                                     "lon" : str(round(gpsd.fix.longitude, 6)),
                                     "satellites" : mysats_sorted,
                                     "bearing" : str(round(gpsd.fix.track, 0)),
                                     "speed_mph" : str(round(gpsd.fix.speed * 2.236936, 1)),
                                     "altitude" : str(round(gpsd.fix.altitude * 3.2808399, 0))
                                       }

                        self.logger.debug("GPS status: {}".format(gpsstats))

                        # Save the GPS stats to the JSON status file
                        self._saveGPSStatus(gpsstats)
                        self.updatePosition(gpsstats)

                    # for all other Fix status (ex. no data and No Fix)
                    else:
                        # Our GPS stats object
                        gpsstats = { "utc_time" : str(datetime_record),
                                 "mode" : str(gpsd.fix.mode if gpsd.fix.mode else "0"),
                                 "status" : "acquiring fix",
                                 "devicepath" : str(gpspath),
                                 "lat" : "n/a",
                                 "lon" : "n/a",
                                 "satellites" : [],
                                 "bearing" : "n/a", 
                                 "speed_mph" : "n/a",
                                 "altitude" : "n/a"
                                   }

                        self.logger.debug("GPS status: {}".format(gpsstats))

                        # Save the GPS stats to the JSON status file
                        self._saveGPSStatus(gpsstats)
                        self.updatePosition(gpsstats)

                # For a DEVICE report from GPSD, check the status of the device, was it activated or deactivated?
                elif report['class'] == "DEVICE":

                    # If a DEVICE event has occured, abort this inner loop and restart 
                    gpsDeviceFound = False

                # For a DEVICES report from GPSD, check the status of the device, was it activated or deactivated?
                elif report["class"] == "DEVICES":

                    # If a DEVICE event has occured, abort this inner loop and restart 
                    gpsDeviceFound = False

            # Close GPSD connection.
            gpsd.close()

        ##########
        # End of primary loop
        #
        # This process is now ending so we start shutdown tasks
        ###########

        # Close GPSD connection.
        if gpsd is not None:
            gpsd.close()

        # Our GPS stats object
        gpsstats = { "utc_time" : "n/a", 
                     "mode" : "0", 
                     "status" : "no device", 
                     "devicepath" : "",
                     "lat" : "n/a", 
                     "lon" : "n/a", 
                     "satellites" : [], 
                     "bearing" : 0, 
                     "speed_mph" : 0, 
                     "altitude" : 0 
                    }

        self.logger.debug("GPS status: {}".format(gpsstats))

        # Save the GPS stats to the JSON status file
        self._saveGPSStatus(gpsstats)
        self.updatePosition(gpsstats)

        # Close the database connection
        self.close()
        self.logger.info("GPS poller ended.")


##################################################
# runGPSPoller process
##################################################
def runGPSPoller(config):
    try:
        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logging.INFO)
        logger.propagate = False

        # Create a new GPSPoller object
        logger.info("Starting GPS poller process.")
        g = GPSPoller(stopevent = config["stopevent"], position = config["position"], loggingqueue = config["loggingqueue"])

        # Start the poller
        g.run()

    except (KeyboardInterrupt, SystemExit):
        logger.debug(f"runGPSPoller caught keyboardinterrupt")
        config["stopevent"].set()
        g.close()
    finally:
        logger.info("GPSPoller ended")


if __name__ == "__main__":
    runGPSPoller(mp.Event())
