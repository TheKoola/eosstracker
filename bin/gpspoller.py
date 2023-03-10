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

#import local configuration items
import habconfig


#####################################
## Set this to "True" to have debugging text output when running
debug = False
#####################################


#####################################
# Function for printing out debug info
def debugmsg(message):
    if debug:
        caller = getframeinfo(stack()[1][0])
        print("%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message))
        sys.stdout.flush()

##################################################
# GPSPoller Class
##################################################

class GPSPoller(object): 
    def __init__(self, dbConnectionString = None, stopevent = None):

        # The database connection string
        self.dbstring = habconfig.dbConnectionString
        if dbConnectionString:
            self.dbstring = str(dbConnectionString)

        # Placeholder for multiprocessing event from run() function
        if stopevent:
            self.stopevent = stopevent
        else:
            self.stopevent = mp.Event()

        # The database connection object
        self.dbconn = None

        # The database connection retry limit.
        self.connectionRetryLimit = 99

        # This is the actual, GPS JSON file that the web frontend reads to get status.
        self.GPSStatusFile = "/eosstracker/www/gpsstatus.json"

        # This is a temp file that we write too first.  Then we'll rename this to the actual GPS JSON file.
        self.GPSStatusTempFile = "/eosstracker/www/gpsstatus.json.tmp"


    ################################
    # destructor
    def __del__(self):
        debugmsg("__del__: calling close()")
        self.close()


    ################################
    # Function for closing DB connection
    def close(self):
        try:

            if self.dbconn:
                if not self.dbconn.closed:
                    debugmsg("Closing database connection")
                    self.dbconn.close()
                else:
                    debugmsg("Database connection was already closed")
            else:
                debugmsg("Database connection not created.")
        except pg.DatabaseError as error:
            print(error)


    ################################
    # Set the database connection string
    def setDBConnection(self, dbstring = None):

        # Set the database connection 
        if dbstring:
            debugmsg("Setting databse connection string to: %s" % dbstring)
            self.dbstring = dbstring


    ################################
    # Function for connecting to the database
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            debugmsg("Database connection string not set.")
            return False

        try:

            # If not already connected to the database, then try to connect
            if not self.dbconn:
                debugmsg("Connecting to the database: %s" % self.dbstring)

                # Connect to the database
                self.dbconn = pg.connect (self.dbstring)

                # Set autocommit to on
                self.dbconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.close()
            print(error)
            return False


    ##################################################
    # Save GPS status to JSON file
    def _saveGPSStatus(self, gpsstatus):

        # Open the temporary file and save our contents to that first.
        with open(self.GPSStatusTempFile, "w") as f:
            f.write(json.dumps(gpsstatus))

        # Now rename our temporary file to the actual GPS JSON status file.  Doing this prevents the web page from getting "half a status" update
        # because our GPS JSON file was being written to.
        if os.path.isfile(self.GPSStatusTempFile):
            os.rename(self.GPSStatusTempFile, self.GPSStatusFile)


    ##################################################
    # The run loop
    def run(self):
        try:

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

                        debugmsg("activation loop: {}".format(gpsstats))

                        # Save the status of the GPS(s) to the status file
                        self._saveGPSStatus(gpsstats)

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

                debugmsg("GPS activated: {}".format(gpsstats))

                # Save the status of the GPS(s) to the status file
                self._saveGPSStatus(gpsstats)

                # Loop initialization params...
                prevlat = 0
                prevlon = 0
                timeprev = ""

                ##########
                # Position reporting loop...
                #
                # This is the main GPS loop.  Once a device has been activated and is reporting positions, stay in this loop.
                ##########
                while gpsDeviceFound == True and not self.stopevent.is_set():
                    try: 
                        debugmsg("GETTING GPS REPORT")
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

                            # If our position has changed by .0001 of a lat/lon degree, then we consider it significant enough to add a row to the database
                            if round(gpsd.fix.latitude,4) != prevlat or round(gpsd.fix.longitude,4) != prevlon:

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
                               
                                        # If a database error occured, print the error, the set the variable so that this loop ends.
                                        except pg.DatabaseError as error:
                                            print(error)

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

                            debugmsg("GPS status: {}".format(gpsstats))

                            # Save the GPS stats to the JSON status file
                            self._saveGPSStatus(gpsstats)


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

                            debugmsg("GPS status: {}".format(gpsstats))

                            # Save the GPS stats to the JSON status file
                            self._saveGPSStatus(gpsstats)

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

                            debugmsg("GPS status: {}".format(gpsstats))

                            # Save the GPS stats to the JSON status file
                            self._saveGPSStatus(gpsstats)

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

            debugmsg("GPS status: {}".format(gpsstats))

            # Save the GPS stats to the JSON status file
            self._saveGPSStatus(gpsstats)

            try: 
                # Close the database connection
                self.close()

            except pg.DatabaseError as error:
                print(error)
                self.close()

            print("GPS poller ended.")

        except (KeyboardInterrupt, SystemExit):

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

            debugmsg("GPS status: {}".format(gpsstats))

            # Save the GPS stats to the JSON status file
            self._saveGPSStatus(gpsstats)

            # Close the database connection
            self.close()
            print("GPS poller caught event and has ended.")


        finally:
            # Close GPSD connection if it's still open...shouldn't be, but just in case.
            if gpsd is not None:
                gpsd.close()

            # Close the database connection if it's still open...shouldn't be, but just in case.
            self.close()


##################################################
# runGPSPoller process
##################################################
def runGPSPoller(e):
    try:

        # Create a new GPSPoller object
        debugmsg("Starting GPS poller process.")
        g = GPSPoller(stopevent = e)

        debugmsg("Running GPSPoller.run()...")
        g.run()

    except (KeyboardInterrupt, SystemExit):
        g.close()
        print("GPSPoller ended")


if __name__ == "__main__":
    runGPSPoller(mp.Event())
