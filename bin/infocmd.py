##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020,2021 Jeff Deaton (N6BA)
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
from inspect import getframeinfo, stack
import json
import hashlib

#import local configuration items
import habconfig 
import kiss
import queries


#####################################
## Set this to "True" to have debugging text output when running
debug = False
#####################################


#####################################
# Function for printing out debug info
def debugmsg(message):
    if debug:
        caller = getframeinfo(stack()[1][0])
        print "%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message)
        sys.stdout.flush()



#####################################
# The infoCmd Class
# 
#    class PredictorBase:
#        def __init__(self):
#        def __del__(self):
#        def getInfoCmd(self):
#####################################
class infoCmd(object):

    ################################
    # constructor
    def __init__(self, my_callsign, dbConnectionString = None, timezone = 'America/Denver', dw_channel = 0, viapath="WIDE1-1,WIDE2-1"):


        # The database connection string
        self.dbstring = dbConnectionString

        # The callsign
        self.callsign = my_callsign.upper()

        # The database connection object
        self.dbconn = None
        self.dbconn = pg.extensions.connection

        # Timezone
        self.timezone = timezone

        # Timeout value
        self.timeout = 260

        # The KISS object
        self.direwolf = kiss.txKISS(my_callsign.upper(), port=8001, channel = dw_channel, via=viapath)


        debugmsg("infoCmd constructor")
        debugmsg("Using viapath: %s" % viapath)


    #####################################
    # Function to use to determine distance between two points
    def distance(self, lat1, lon1, lat2, lon2):
        lon1 = math.radians(lon1)
        lon2 = math.radians(lon2)
        lat1 = math.radians(lat1)
        lat2 = math.radians(lat2)

        # Haversine formula
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        #r = 6371 # Radius of earth in kilometers. Use 3956 for miles
        r = 3956 # Radius of earth in kilometers. Use 3956 for miles

        return float(c * r)


    ################################
    # destructor
    def __del__(self):
        try:
            if not self.dbconn.closed:
                debugmsg("infoCmd destructor:  closing database connection.")
                self.dbconn.close()
        except pg.DatabaseError as error:
            debugmsg(error)


    ################################
    # Function for connecting to the database
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            return False

        try:

            # If not already connected to the database, then try to connect
            if self.dbconn != None:
                if self.dbconn.closed:
                    debugmsg("Connecting to the database: %s" % self.dbstring)
                    self.dbconn = pg.connect (self.dbstring)
                    self.dbconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.dbconn.close()
            debugmsg(error)
            return False



    ################################
    # This is the main function for determing what sort of information string should be returned
    def processInfoCmd(self):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return 0

        if self.dbconn.closed:
            return 0

        # get list of active flightids/callsign combo records
        # columns:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
        flightids = queries.getFlights(self.dbconn)

        l = []
        #for l in [self.packets(flightids), self.surface_winds(flightids), self.landing_coords(flightids)]:
        for l in [self.landing_coords(flightids)]:
            if len(l) > 0:
                for str in l:
                    if str is not None and str != "":

                        # Transmit this via direwolf
                        debugmsg("Transmitting: %s" % str)
                        self.direwolf.transmit(str)


    ################################
    # This will query the database looking the latest landing prediction location 
    #
    def landing_coords(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # database cursor
        wxcur = self.dbconn.cursor()

        # Information string
        infoStrings = []

        if debug:
            for r in flightrecords:
                debugmsg("landing_coords:  " + r[0] + " :: " + r[1])
                
        # Loop through the list of beacons
        for rec in flightrecords:

            # this is the flightid
            fid = rec[0]

            # callsign
            callsign = rec[1]

            debugmsg("============ infocmd landing_coords processing: %s : %s ==========" % (fid, callsign))

            try: 
                # Get the latest landing prediction for the flight/beacon.  Only look back 20mins and we exclude early cutdown predictions.
                lastlandingprediction_sql = """
                    select 
                        l.tm as thetime,
                        st_y(l.location2d) as lat,
                        st_x(l.location2d) as lon,
                        round(ttl) as ttl,
                        round(coef_a, 9) as coef,
                        l.thetype

                    from
                        landingpredictions l

                    where 
                        l.flightid = %s
                        and l.callsign = %s
                        and l.tm > (now() - interval '00:20:00')
                        and l.tm > now()::date
                        and l.thetype in ('predicted', 'wind_adjusted', 'translated')

                    order by
                        l.tm desc 
                    
                    limit 1
                    ;
                """

                # Execute the query to get the most recent landing prediction for this callsign
                wxcur.execute(lastlandingprediction_sql, [ fid, callsign ])
                rows = wxcur.fetchall()
                debugmsg("landing prediction for " + callsign + ": " + str(len(rows)))

                # Check if there are any packets available for this callsign
                packets = queries.getLatestPackets(self.dbconn, callsign, self.timezone, 20)
                debugmsg("# of packets(" + callsign + "): " + str(len(packets)))

                minutes_elapsed = -1

                if len(packets) > 0:

                    # Get the amount of time that's elapsed since the last packet we heard
                    minutes_elapsed = packets[-1][7]

                    debugmsg("minutes_elapsed:  " + str(minutes_elapsed))

                    # If there was a landing prediction available then we compare the TTL to the amount of
                    # time elapsed since the last packet heard
                    if len(rows) > 0:
                        if rows[0][3]:
                            t = float(rows[0][3]) / 60.0
                            
                            debugmsg("ttl: " + str(t))
                            # If more time has elapsed than the TTL was indicating, plus a little buffer (ex. 5mins), then 
                            # chances are the flight is already on the ground.
                            if minutes_elapsed > t + 5:
                                debugmsg("Skipping " + callsign + " as too much time has elapsed")
                                continue
                    else: 
                        debugmsg("No recent landing predictions available for " + callsign)
                        continue
                else:
                    # no packets were returned so we shouldn't construct an infostring for this callsign
                    continue


                # If we're here, then there are recent packets from this callsign that we've heard and there's still
                # time left in the flight before it touched down.
                #
                # Loop through the rows returned creating an APRS object packet for the landing prediction
                debugmsg("Processing records for:  " + callsign)
                for r in rows:
                    #infoString = "{{{{z{}|L|{:.6f},{:.6f}".format(callsign, r[1], r[2])

                    # pad with spaces, the callsign to 9 characters 
                    call = self.callsign
                    if "-" in self.callsign:
                        call,ssid = self.callsign.split("-")

                    # compute the md5 hash of the beacon and user's callsigns, but save only the last four hex digits.  This will become a unique string to identify the object.
                    hash_this = callsign.upper() + self.callsign.upper()
                    md5hash = hashlib.md5(hash_this).hexdigest()[-4:]

                    objectname = callsign.split("-")[0][0:4] + "." + md5hash.upper()
                    objectname = objectname + " "*(9 - len(objectname))

                    # timestamp
                    ts = datetime.datetime.now()
                    timestring = ts.strftime("%H%M%S")

                    # convert the latitude to degrees, decimal-minutes
                    degrees = int(r[1])
                    minutes = (r[1] - degrees) * 60
                    lat = "{:02d}{:05.2f}{}".format(abs(degrees), abs(minutes), "N" if r[1] >= 0 else "S")

                    # convert the longitude to degrees, decimal-minutes
                    degrees = int(r[2])
                    minutes = (r[2] - degrees) * 60
                    lon = "{:02d}{:05.2f}{}".format(abs(degrees), abs(minutes), "E" if r[2] >= 0 else "W")

                    # Create the flight descent coefficient string
                    coef_string = ""
                    if r[4] and (r[5] == "predicted" or r[5] == "wind_adjusted"):
                        coef_string = " coef:" + str(r[4])

                        # Add the number of packets used for the landing prediction to the end of the coef string.
                        # This isn't the "exact" number of packets used in the prediction algo, but it's close
                        # and is a good indicator of the accuracy of the prediction.
                        if len(packets) > 0:
                            coef_string += "," + str(len(packets))

                    # create a string for the TTL value
                    ttl_string = ""
                    if r[3]:
                        ttl = float(r[3]) / 60.0

                        # Adjust the time to live (TTL) based on how much time has elapsed since we last heard a packet
                        if minutes_elapsed > -1:
                            ttl = (0 if ttl - minutes_elapsed < 0 else ttl - minutes_elapsed)

                        # If the time to live is 0, then just report that the flight is on the ground IF it's been 5mins past the original TTL value (i.e. a small time buffer).
                        if int(ttl) == 0 and ttl < minutes_elapsed + 5:
                            ttl_string = "On the ground."
                            coef_string = ""
                        else:
                            ttl_string = "TTL: " + str(int(ttl)) + ("min" if int(ttl) == 1 else "mins")

                    objectPacket = ";" + objectname + "*" + timestring + "h" + lat + "\\" + lon + "<000/000" + "Predicted landing for " + callsign + ". " + ttl_string + coef_string + " (from " + self.callsign + ")"
                    infoStrings.append(objectPacket)

            except pg.DatabaseError as error:
                infocur.close()
                self.dbconn.close()
                debugmsg(error)

        # Close the database connection
        #debugmsg("Closing database connections...")
        #self.dbconn.close()
        return infoStrings


    ################################
    # This returns a string that contains the surface wind data
    def surface_winds(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # Information string
        infoStrings = []

        # Loop through the list of beacons
        for rec in flightrecords:

            # this is the flightid
            fid = rec[0]

            # callsign
            callsign = rec[1]

            debugmsg("============ infocmd surface winds processing: %s : %s ==========" % (fid, callsign))

            # Get the surface winds near the landing area
            winds, valid = queries.getSurfaceWinds(self.dbconn, fid)

            if valid:
                infoString = "{{{{z{}|W|{:.8f},{:.8f}".format(fid, winds[0], winds[1])
                infoStrings.append(infoString)
       
        # Close the database connection
        #debugmsg("Closing database connections...")
        #self.dbconn.close()
        return infoStrings


    ################################
    # This returns a string that contains the telemetry from the first few APRS packets for the callsign
    def packets(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # Database cursor
        infocur = self.dbconn.cursor()

        # Information string
        infoStrings = []

        try:

            # Loop through the list of beacons 
            for rec in flightrecords:
            
                # this is the flightid
                fid = rec[0]

                # callsign
                callsign = rec[1]

                debugmsg("============ infocmd packets processing: %s : %s ==========" % (fid, callsign))

                # launchsite particulars
                launchsite = { 
                        "flightid" : str(fid), 
                        "name" : str(rec[2]),
                        "lat" : float(rec[3]),
                        "lon" : float(rec[4]),
                        "elevation" : float(rec[5])
                        }


                # Get a list of the latest packets for this callsign
                # latestpackets columns:  
                #    altitude, 
                #    altitude_change_rate, 
                #    latitude_change_rate, 
                #    longitude_change_rate, 
                #    elapsed_mins
                latestpackets = queries.getLatestPackets(self.dbconn, callsign, self.timezone, 20)
                debugmsg("latestpackets.shape: %s" % str(latestpackets.shape))

                # Have there been any packets heard from this callsign yet? 
                if latestpackets.shape[0] > 0:
                    debugmsg("latestpackets[0]:  %s, %f, %f, %f" % (latestpackets[0,0], 
                        latestpackets[0,1],
                        latestpackets[0,2],
                        latestpackets[0,3]
                        ))
                    debugmsg("latestpackets[-1]:  %s, %f, %f, %f" % (latestpackets[-1,0], 
                        latestpackets[-1,1],
                        latestpackets[-1,2],
                        latestpackets[-1,3]
                        ))
                # ...if no packets heard, then return.
                else:
                    debugmsg("No packets heard from this callsign: %s" % callsign)
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # Timestamp of the last packet we've heard from the flight
                elapsed_mins = latestpackets[-1, 3]
                debugmsg("Elapsed time since last packet[%s:%s]: %d mins" %(fid, callsign, elapsed_mins))

                # If amount of elapsed time since the last packet from the flight is greater than our timeout value, then we abort and exit.
                # No sense in creating a prediction for a flight that is over.
                if elapsed_mins > self.timeout:
                    debugmsg("Elapsed time (%d mins) greater than timeout (%d mins), not creating infocmd." %(elapsed_mins, self.timeout))
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue


                # slice (aka list) of just the altitude columns
                altitudes = latestpackets[0:, 1]

                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
               
                # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
                ascent_portion = np.array(latestpackets[0:(idx+1), 0:], dtype='f')
                descent_portion = np.array(latestpackets[idx:, 0:], dtype='f')
                debugmsg("ascent_portion.shape: %s" % str(ascent_portion.shape))
                debugmsg("descent_portion.shape: %s" % str(descent_portion.shape))

                # Loop through the ascent rates heard thus far until we find a value where the ascent rate (ft/s) is > 5ft/s.  This eliminates
                # those early packets from the beacons prior to actual launch...we don't want those.
                loop_limit = ascent_portion.shape[0] - 1
                loop_counter = 0
                if ascent_portion.shape[0] > 0:
                    while ascent_portion[loop_counter, 1] < 5 and loop_counter < loop_limit:
                        loop_counter += 1
                
                if loop_counter > 0:
                    # We trim off those packets from the beginning of the flight that don't matter.  Only want to keep those packets from just before
                    # the balloon is launched (aka the altitude starts to rise).  If this flight has yet to start ascending, then this array will only have 
                    # one two packets.
                    ascent_portion = ascent_portion[(loop_counter-1):,0:]

                    # This sets the first packet for our ascent_rates array to have the same altitude, latitude, and longitude change rates.
                    # reference:  columns:  altitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
                    ascent_portion[0,1] = ascent_portion[1,1]
                    ascent_portion[0,2] = ascent_portion[1,2]
                    ascent_portion[0,3] = ascent_portion[1,3]

                k = 1
                for lim in [6, 12, 18]:
                    infocmd = "{{{{z{}|A{:d}".format(callsign, k)
                    i = 0
                    for row in ascent_portion[lim-6:lim,]:
                        if row[0] < 20000:
                            # infopacket format:  altitude, altitude_rate, latitude_rate, longitude_rate
                            infopacket = "{:.0f},{:.2f},{:.6f},{:.6f}".format(round(row[0]), round(row[1],2), round(row[2], 6), round(row[3], 6))
                            infocmd = infocmd + "|" + infopacket
                            i += 1
                    if i  > 0:
                        infoStrings.append(infocmd)

                    k += 1

                debugmsg("============ end infocmd processing:   %s : %s ==========" % (fid, callsign))


        except pg.DatabaseError as error:
            infocur.close()
            self.dbconn.close()
        except (KeyboardInterrupt, SystemExit):
            infocur.close()
            self.dbconn.close()

        # Close the database connection
        #debugmsg("Closing database connections...")
        infocur.close()
        #self.dbconn.close()

        # Return the information string
        return infoStrings

    ################################
    #END processInfoCmd()
    ################################



##################################################
# runInfoCmd process
##################################################
def runInfoCmd(schedule, e, config):
    try:

        # Create a new LandingPredictor object
        debugmsg("Starting infocmd process.")
        debugmsg("callsign: %s, dw_channel: %d" % (config["callsign"] + "-" + config["ssid"], config["xmit_channel"]))
        if config["includeeoss"] == "true" and config["eoss_string"] != "":
            via = config["eoss_string"] + ",WIDE1-1,WIDE2-1"
        else:
            via = "WIDE1-1,WIDE2-1"

        infocmd = infoCmd(config["callsign"] + "-" + config["ssid"], habconfig.dbConnectionString, timezone = config["timezone"], dw_channel = int(config["xmit_channel"]), viapath = via)

        # run the infocmd processor function continuously, every "schedule" seconds.
        e.wait(10)
        while not e.is_set():
            infocmd.processInfoCmd()
            e.wait(schedule)

    except (KeyboardInterrupt, SystemExit): 
        print "infoCmd ended"
        pass


