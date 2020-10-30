#!/usr/bin/python
  
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, Jeff Deaton (N6BA)
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



##################################################
# GpsPoller process
##################################################
def GpsPoller(e):
    gpsconn = None
    try:

        # Primary loop for handling GPS polling.
        while not e.is_set():

            # Connect to the GPSD daemon
            gpsd = gps(mode=WATCH_ENABLE)

            # Loop initialization params...
            gpspath = "n/a"
            gpsDeviceFound = False

            #########
            # GPS device activation loop...
            #
            # Loop until GPSD reports that a GPS device has been activated
            #########
            while gpsDeviceFound == False and not e.is_set():
                # Get latest status from GPSD
                try: 
                    report = gpsd.next()
                except Exception as error:

                    # Set this to false so the inner loop will end
                    gpsDeviceFound = False

                print report

                # If GPSD is reporting a DEVICE or DEVICES event then look at that to see if a GPS device was actually "activated"
                if report['class'] == "DEVICE":
                    print "Checking DEVICE"
                    if "path" in report and "activated" in report:
                        print "Activated is: ", report["activated"]
                        if report["activated"]:
                            print "Activated was TRUE"
                            gpsDeviceFound = True
                            if "path" in report:
                                gpspath = report["path"]
                            else:
                                gpspath = "n/a"
                        else:
                            print "Activated was FALSE"

                elif report['class'] == "DEVICES":
                    print "Checking DEVICES"
                    gpspath = ""
                    for gpsdev in report["devices"]:
                        if "path" in gpsdev and "activated" in gpsdev:
                            print "Activated is: ", gpsdev["activated"]
                            if gpsdev["activated"]:
                                print "Activated was TRUE"
                                gpsDeviceFound = True
                                if "path" in gpsdev:
                                    gpspath = gpspath + gpsdev["path"] + " "
                        else:
                            print "Activated was TRUE"

                if gpsDeviceFound == False:
                    print "no device found"
                    gpsstats = { "utc_time" : str(gpsd.utc if gpsd.utc else datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'),
                                 "mode" : str(report["mode"] if "mode" in report else "0"),
                                 "status" : "no device",
                                 "devicepath" : "n/a",
                                 "lat" : "n/a",
                                 "lon" : "n/a",
                                 "satellites" : [],
                                 "speed_mph" : "n/a",
                                 "altitude" : "n/a"
                                   }
            #########
            # End of device activation loop...
            #########



            # A GPS device has been activated...update the GPS JSON status file
            gpsstats = { "utc_time" : str(gpsd.utc if gpsd.utc else datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'),
                         "mode" : str(report["mode"] if "mode" in report else "0"),
                         "status" : "waiting on device",
                         "devicepath" : str(gpspath),
                         "lat" : "n/a",
                         "lon" : "n/a",
                         "satellites" : [],
                         "speed_mph" : "n/a",
                         "altitude" : "n/a"
                           }
            print gpsstats



            # Loop initialization params...
            prevlat = 0
            prevlon = 0
            timeprev = ""

            ##########
            # Position reporting loop...
            #
            # This is the main GPS loop.  Once a device has been activated and is reporting positions, stay in this loop.
            ##########
            while gpsDeviceFound == True and not e.is_set():
                try: 
                    report = gpsd.next()
                except Exception as error:

                    # Set this to false so the inner loop will end
                    gpsDeviceFound = False

                # Get the GPS device path (if reported)
                if "device" in report:
                    gpspath = report["device"]
                else:
                    gpspath = "n/a"



                # If GPSD provided a Time-Position-Velocity report we process that...
                if report['class'] == 'TPV':

                    print report

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
                            thetime = gpsd.utc

                            # If our position is non-zero and altitude is > 0 then proceed with the database insert
                            if gpsd.fix.latitude != 0 and gpsd.fix.longitude != 0 and gpsd.fix.altitude >= 0:

                                # Only insert this record into the database if we've not already had an update for this GPS position
                                if thetime != timeprev:
                                    print "What would have been inserted into the DB:  ", [
                                        thetime,
                                        round(gpsd.fix.speed * 2.236936, 0),
                                        gpsd.fix.track,
                                        round(gpsd.fix.altitude * 3.2808399, 0),
                                        gpsd.fix.longitude,
                                        gpsd.fix.latitude,
                                        gpsd.fix.longitude,
                                        gpsd.fix.latitude,
                                        gpsd.fix.altitude
                                    ]

                                    # Set the previous time to this time
                                    timeprev = thetime

                                    # Save this position for the next iteration of the loop
                                    prevlat = round(gpsd.fix.latitude,4)
                                    prevlon = round(gpsd.fix.longitude,4)
                       

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
                        gpsstats = { "utc_time" : str(gpsd.utc),
                                     "mode" : str(gpsd.fix.mode),
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : str(round(gpsd.fix.latitude, 6)),
                                     "lon" : str(round(gpsd.fix.longitude, 6)),
                                     "satellites" : mysats_sorted,
                                     "speed_mph" : str(round(gpsd.fix.speed * 2.236936, 0)),
                                     "altitude" : str(round(gpsd.fix.altitude * 3.2808399, 0))
                                   }

                        # Save the GPS stats to the JSON status file


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
                        gpsstats = { "utc_time" : str(gpsd.utc),
                                     "mode" : str(gpsd.fix.mode),
                                     "status" : "normal",
                                     "devicepath" : str(gpspath),
                                     "lat" : str(round(gpsd.fix.latitude, 6)),
                                     "lon" : str(round(gpsd.fix.longitude, 6)),
                                     "satellites" : mysats_sorted,
                                     "speed_mph" : str(round(gpsd.fix.speed * 2.236936, 0)),
                                     "altitude" : str(round(gpsd.fix.altitude * 3.2808399, 0))
                                       }


                    # for all other Fix status (ex. no data and No Fix)
                    else:
                        # Our GPS stats object
                        gpsstats = { "utc_time" : str(gpsd.utc if gpsd.utc else datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'),
                                 "mode" : str(gpsd.fix.mode if gpsd.fix.mode else "0"),
                                 "status" : "acquiring fix",
                                 "devicepath" : str(gpspath),
                                 "lat" : "n/a",
                                 "lon" : "n/a",
                                 "satellites" : [],
                                 "speed_mph" : "n/a",
                                 "altitude" : "n/a"
                                   }


                # For a DEVICE report from GPSD, check the status of the device, was it activated or deactivated?
                elif report['class'] == "DEVICE":

                    # If a DEVICE event has occured, abort this inner loop and restart 
                    gpsDeviceFound = False

                # For a DEVICES report from GPSD, check the status of the device, was it activated or deactivated?
                elif report["class"] == "DEVICES":

                    # If a DEVICE event has occured, abort this inner loop and restart 
                    gpsDeviceFound = False

                print gpsstats

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
                     "speed_mph" : 0, 
                     "altitude" : 0 
                    }


        try: 
            # Close the database connection
            gpsconn.close()

        except pg.DatabaseError as error:
            print error

        print "GPS poller ended."

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
                     "speed_mph" : 0, 
                     "altitude" : 0 
                    }

        print "GPS poller caught event and has ended."


    finally:
        # Close GPSD connection if it's still open...shouldn't be, but just in case.
        if gpsd is not None:
            gpsd.close()

        # Close the database connection if it's still open...shouldn't be, but just in case.
        if gpsconn is not None:
            gpsconn.close()



def main():
    stopevent = mp.Event()

    GpsPoller(stopevent)


if __name__ == '__main__':
    main()
