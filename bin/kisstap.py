##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020, Jeff Deaton (N6BA)
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

import multiprocessing as mp
import subprocess as sb
import time
import datetime 
import psycopg2 as pg
import aprslib
import logging
import threading as th
import socket
import sys
import signal
import random
from inspect import getframeinfo, stack
import string

#import local configuration items
import habconfig 
import kiss

#logging.basicConfig(level=0)


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
# base class for connecting to APRS-IS systems
#####################################
class kissTap(object):
    def __init__(self, connectionRetryLimit = None, timezone = None, dbConnectionString = None, stopevent = None, freqmap = None):
        # The database connection string
        self.dbstring = habconfig.dbConnectionString
        if dbConnectionString:
            self.dbstring = str(dbConnectionString)

        # The database connection object
        self.kissconn = None

        # The timezone
        self.timezone = 'America\Denver'
        if timezone:
            self.timezone = str(timezone)

        # the connection attempt limit and timeout per try
        self.timeout = 5
        self.long_timeout = 30

        # by default, the connectionRetryLimit is set to None, which will cause the run() function to loop forever.
        self.connectionRetryLimit = None
        if connectionRetryLimit:
            self.connectionRetryLimit = connectionRetryLimit

        # Placeholder for multiprocessing event from run() function
        if stopevent:
            self.stopevent = stopevent
        else:
            self.stopevent = mp.Event()

        # Last time a packet was ingested/handled. 
        self.ts = datetime.datetime.now()

        # Default channel-to-frequency map
        if freqmap:
            self.freqmap = freqmap
        else:
            self.freqmap = [ [0, 144390000] ]

        debugmsg("kissTap Instance Created:")
        debugmsg("    dbstring:       %s" % self.dbstring)
        debugmsg("    timezone:       %s" % self.timezone)
        debugmsg("    timeout:        %s" % self.timeout)
        debugmsg("    long_timeout:   %s" % self.long_timeout)



    ################################
    # 
    # This function will save the channel to frequency map
    def setFreqMap(self, fmap):
        self.freqmap = fmap


    ################################
    # 
    # This function will block until the connection try limit is reached or the stopevent is triggered
    def run(self):

        try:

            # Check the database connection
            if not self.connectToDatabase():
                return

            # set the connection retry loop limit
            if self.connectionRetryLimit:
                trylimit = self.connectionRetryLimit
            else:
                trylimit = 999999999

            debugmsg("Connection retry loop limit set to: %s" % trylimit)

            # Create a KISS object
            k = kiss.KISS(stopevent = self.stopevent)

            # This will attempt a connection multiples times (ie. the following while loop), waiting self.timemout seconds in between tries.
            trycount = 0
            while trycount < trylimit and not self.stopevent.is_set():

                    # wait before trying to connect, but if the number or attempts grows larger, slow down...
                    if trycount > 18:
                        debugmsg("Waiting for %d seconds" % self.long_timeout)
                        self.stopevent.wait(self.long_timeout)
                    elif trycount > 0:
                        debugmsg("Waiting for %d seconds" % self.timeout)
                        self.stopevent.wait(self.timeout)

                    debugmsg("Running KISS read function....")

                    # Update the last timestamp
                    self.ts = datetime.datetime.now()

                    # The read function runs forever...
                    if not k.read(self.writeToDatabase):
                        debugmsg("Kiss read function returned FALSE.  Exiting...")
                        self.close()
                        return False

                    debugmsg("Kiss read function returned.")

                    # Increment trycount each time through the loop
                    trycount += 1

            print "Ending KISS-tap process."
            self.close()

        except (KeyboardInterrupt, SystemExit) as err:
            debugmsg("Caught interrupt event, exiting run() function:  {}".format(err))
            self.close()



    ################################
    # destructor
    def __del__(self):
        debugmsg("__del__: calling close()")
        self.close()


    ################################
    # Function for closing all connections
    def close(self):
        try:

            if self.kissconn:
                if not self.kissconn.closed:
                    debugmsg("closing database connection")
                    self.kissconn.close()
                else:
                    debugmsg("Databse connection was already closed")
            else:
                debugmsg("Database connection not created.")
        except pg.DatabaseError as error:
            print error


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
            if not self.kissconn:
                debugmsg("Connecting to the database: %s" % self.dbstring)

                # Connect to the database
                self.kissconn = pg.connect (self.dbstring)

                # Set autocommit to on
                self.kissconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.close()
            print error
            return False



    ################################
    # Function to query the database for latest GPS position and return an object containing alt, lat, lon.
    def getGPSPosition(self):
        # We want to determine our last known position (from the GPS) 
        gps_sql = """select 
            tm::timestamp without time zone as time, 
            round(speed_mph) as speed_mph, 
            bearing, 
            round(altitude_ft) as altitude_ft, 
            round(cast(ST_Y(location2d) as numeric), 6) as latitude, 
            round(cast(ST_X(location2d) as numeric), 6) as longitude 
           
            from 
            gpsposition 
          
            order by 
            tm desc 
            limit 1;"""


        gpsposition = {
                "altitude" : 0.0,
                "latitude" : 0.0,
                "longitude" : 0.0,
                "isvalid" : False
                }
        try:

            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return gpsposition

            # Execute the SQL statment and get all rows returned
            gpscur = self.kissconn.cursor()
            gpscur.execute(gps_sql)
            gpsrows = gpscur.fetchall()
            gpscur.close()

            # There should only be one row returned from the above query, but just in case we loop through each row saving our 
            # last altitude, latitude, and longitude
            if len(gpsrows) > 0:
                for gpsrow in gpsrows:
                    my_alt = round(float(gpsrow[3]) / 100.0) * 100.0 - 50.0
                    my_lat = gpsrow[4]
                    my_lon = gpsrow[5]

                gpsposition = {
                        "altitude" : float(my_alt),
                        "latitude" : float(my_lat),
                        "longitude" : float(my_lon),
                        "isvalid" : True
                        }

                debugmsg("GPS position: %f, %f, %f, isvalid: %d" % (gpsposition["altitude"], gpsposition["latitude"], gpsposition["longitude"], gpsposition["isvalid"]))

            return gpsposition

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            gpscur.close()
            self.close()
            print error
            return gpsposition


    ##################################################
    # Write an incoming packet to the database
    def writeToDatabase(self, x, channel = 0):

        # If packet is None then just return
        if not x:
            debugmsg("writeToDatabase: packet is None.")
            return

        try:

            debugmsg("writeToDatabase.  x (%s): %s, channel: %d" % (type(x), x, channel))

            # Create a database cursor
            tapcur = self.kissconn.cursor()

            # Update the watchdog timer
            self.ts = datetime.datetime.now()

            # The source (i.e. we're listening to packets from Direwolf's KISS port)
            source = "direwolf"

            # Determine the frequency (ex. 144390000, 145645000, etc.) from the channel
            frequency = [i[1] for i in self.freqmap if i[0] == channel]
            if len(frequency) > 0:
                frequency = frequency[0]
            else:
                frequency = -1

            # Parse the raw APRS packet
            packet = aprslib.parse(x)

            # The list of key names from the APRS packet structure (parsed above) that we're insterested in for inserting this packet into the database (down below).
            keys = ["object_name", "comment", "latitude", "longitude", "altitude", "course", "symbol", "symbol_table", "speed"]

            # Set those field values to NULL if this packet does not include them....this allows us to insert a NULL value for this database field later down below. 
            for a in keys:
                if a not in packet:
                    packet[a] = ""

            # Decipher the APRS symbol...
            # The usual stuff about if the symbol type for an APRS packet starts with a / or a \, then we need to choose the appropriate symbol table, etc..
            # ...basically getting the symbol returned from packet parsing (up above) consolidated down to just to characters as prep to inserting into the DB.
            if packet["symbol_table"] != "/" and packet["symbol_table"] != "":
                packet["symbol"] = packet["symbol_table"] + packet["symbol"]  
            elif packet["symbol_table"] == "/":
                packet["symbol"] = "/" + packet["symbol"]

            # For those values within the packet that are numeric, we set them to zero instead of NULL if this packet does not include them.
            for a in ["speed", "course", "altitude"]:
                if packet[a] == "":
                    packet[a] = 0

            # We want to split off the information part of the APRS packet for the following reasons:
            #    1.  So we can upload just that part of the packet into the database
            #    2.  Get the packet type (i.e. message, location, status, telemetry, mic-e, etc.)
            #    3.  Break this out so we can compute an MD5 hash for determining packet uniqueness (downstream functionality)
            #
            # Split this the packet at the ":"
            ppart = packet["raw"].partition(":")
            if ppart[2] != "":
                ptype = ppart[2][0]
                info = ppart[2][0:] 

                # Make sure the info part is a string
                if type(info) is bytes:
                    info = info.decode("UTF-8", "ignore")

                # remvove nul chars from info
                info = info.replace(chr(0x00), '')

            else:
                ptype = ""
                info = ""

            # The raw packet...but with any NUL characters removed.
            raw = packet["raw"].replace(chr(0x00), '').strip()

            # For those APRS packets that have an "object name" (presumably for an APRS "object") then we set the "from" field to the "object name".
            # ...even though the object packet was likely transmitted from a different callsign/station, sitting the from field to this object name
            # makes for niceness downstream when displaying APRS items on the map.
            if packet["object_name"] != "":
                packet["from"] = packet["object_name"]


            debugmsg("checking if a posit packet...")
            # If the packet includes a location (some packets do not) then we form our SQL insert statement differently
            if packet["latitude"] == "" or packet["longitude"] == "":
                # SQL insert statement for packets that DO NOT contain a location (i.e. lat/lon)
                sql = """insert into packets (tm, source, channel, frequency, callsign, symbol, speed_mph, bearing, altitude, comment, location2d, location3d, raw, ptype, hash) values (
                    now()::timestamp with time zone, 
                    %s,
                    %s::numeric,
                    %s::numeric,
                    %s, 
                    %s, 
                    round((%s::numeric) * 0.6213712), 
                    %s::numeric, 
                    round((%s::numeric) * 3.28084), 
                    %s, 
                    NULL, 
                    NULL, 
                    %s, 
                    %s, 
                    md5(%s)
                );"""

                # Execute the SQL statement
                debugmsg("Packet SQL: " + sql % (
                    source,
                    channel,
                    frequency,
                    packet["from"], 
                    packet["symbol"], 
                    packet["speed"], 
                    packet["course"], 
                    packet["altitude"], 
                    packet["comment"], 
                    raw, 
                    ptype, 
                    info)
                    )
                tapcur.execute(sql, [
                    source,
                    channel,
                    frequency,
                    packet["from"].strip(), 
                    packet["symbol"].strip(), 
                    packet["speed"],
                    packet["course"],
                    packet["altitude"],
                    packet["comment"].strip(), 
                    raw, 
                    ptype.strip(), 
                    info.strip()
                ])

            else:
                # SQL insert statement for packets that DO contain a location (i.e. lat/lon)
                sql = """insert into packets (tm, source, channel, frequency, callsign, symbol, speed_mph, bearing, altitude, comment, location2d, location3d, raw, ptype, hash) values (
                    now()::timestamp with time zone, 
                    %s,
                    %s::numeric,
                    %s::numeric,
                    %s, 
                    %s, 
                    round((%s::numeric) * 0.6213712), 
                    %s::numeric, 
                    round((%s::numeric) * 3.28084), 
                    %s, 
                    ST_GeometryFromText('POINT(%s %s)', 4326), 
                    ST_GeometryFromText('POINTZ(%s %s %s)', 4326), 
                    %s, 
                    %s, 
                    md5(%s)
                );"""

                # Execute the SQL statement
                debugmsg("Packet SQL: " + sql % (
                    source,
                    channel,
                    frequency,
                    packet["from"], 
                    packet["symbol"], 
                    packet["speed"], 
                    packet["course"], 
                    packet["altitude"], 
                    packet["comment"], 
                    packet["longitude"], 
                    packet["latitude"], 
                    packet["longitude"], 
                    packet["latitude"], 
                    packet["altitude"], 
                    raw,
                    ptype,
                    info)
                    )
                tapcur.execute(sql, [
                    source,
                    channel,
                    frequency,
                    packet["from"].strip(), 
                    packet["symbol"].strip(), 
                    packet["speed"],
                    packet["course"],
                    packet["altitude"],
                    packet["comment"].strip(), 
                    packet["longitude"],
                    packet["latitude"],
                    packet["longitude"],
                    packet["latitude"],
                    packet["altitude"],
                    raw,
                    ptype.strip(),
                    info.strip()
                ])

            # Commit the insert to the database
            self.kissconn.commit()

            # Close the database cursor
            tapcur.close()

             

        except (ValueError, UnicodeEncodeError) as error:
            #ts = datetime.datetime.now()
            #thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
            #print thetime, "Skipping DB insert for packet(", x, "):  ", error
            #sys.stdout.flush()
            pass

        except pg.DatabaseError as error:
            ts = datetime.datetime.now()
            thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
            print thetime, "Database error with packet(", x, "):  ", error
            tapcur.close()
            self.close()

        except (aprslib.ParseError, aprslib.UnknownFormat) as exp:
            # We can't parse the packet, but we can still add it to the database, just without the usual location/altitude/speed/etc. parameters.

            # Remove any NUL characters in the packet
            x = x.replace(chr(0x00), '')

            # If this is s bytes string, then convert it to UTF-8
            if type(x) is bytes:
                x = x.decode("UTF-8", "ignore").strip()

            # Find the ">" character and get the length of the packet string
            s = x.find(">")
            l = len(x)

            callsign = None
            if s > 0 and l > s:
                # The callsign
                callsign = x[0:s].strip()

            # Get the packet type
            s = x.find(":")

            ptype = None
            info = None
            if s >= 0 and l > s+2:
                # The packet type
                ptype = x[s+1:s+2]

                # Get the infomation part of the packet
                info = x[s+1:]

                if info.find(chr(0x00)) >= 0:
                    print "unable to parse. null character, info:  ", info

                # remvove nul chars from info
                info = info.replace(chr(0x00), '')

                # Make sure the info part is a string
                if type(info) is bytes:
                    info = info.decode("UTF-8", "ignore")

                if info.find(chr(0x00)) >= 0:
                    print "unable to parse again. null character, info:  ", info


            # if we've been able to parse the packet then proceed, otherwise, we skip
            if callsign and ptype and info:

                # Make sure the packet doesn't have a null character in it.
                x = x.replace(chr(0x00), '')

                sql = """insert into packets (tm, source, channel, frequency, callsign, raw, ptype, hash) values (
                    now()::timestamp with time zone, 
                    %s,
                    %s::numeric,
                    %s::numeric,
                    %s, 
                    %s, 
                    %s,
                    md5(%s)
                );"""

                # Execute the SQL statement
                debugmsg("Packet SQL: " + sql % (
                    source,
                    channel,
                    frequency,
                    callsign.strip(),
                    x, 
                    ptype.strip(),
                    info.strip()
                    ))
                try: 
                    tapcur.execute(sql, [
                        source,
                        channel,
                        frequency,
                        callsign.strip(), 
                        x,
                        ptype.strip(),
                        info.strip()
                    ])
                except pg.DatabaseError as error:
                    ts = datetime.datetime.now()
                    thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
                    print thetime, "Database error with packet(", x, "):  ", error
                    tapcur.close()
                    
                except ValueError as e:
                    ts = datetime.datetime.now()
                    thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
                    print thetime, "kisstap. Error adding packet(", x, "): ", e
                    tapcur.close()


        except (StopIteration, KeyboardInterrupt, SystemExit): 
            tapcur.close()
            self.close()


##################################################
# runKissTap process
##################################################
def runKissTap(schedule, e, config, freqmap):
    try:

        # Create a new kissTap object
        debugmsg("Starting KISS Tap process.")
        k = kissTap(timezone = config["timezone"], freqmap = freqmap, stopevent = e)

        # Loop through continuing to try and connect/run the tap, waiting 'schedule' seconds between attempts
        debugmsg("Waiting %d seconds before running kissTap.run()." % schedule)
        e.wait(schedule)

        debugmsg("Running kissTap.run()...")
        k.run()

    except (KeyboardInterrupt, SystemExit): 
        k.close()
        print "kissTap ended"

