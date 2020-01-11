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

import multiprocessing as mp
import subprocess as sb
import time
import datetime 
import psycopg2 as pg
import aprslib
import logging
import threading as th
import sys
import signal
import random
from inspect import getframeinfo, stack
import string

#import local configuration items
import habconfig 

#logging.basicConfig(level=0)

class GracefulExit(Exception):
    pass

def signal_handler(signum, frame):
    print "Caught SIGTERM..."
    raise GracefulExit()

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
class APRSIS(object):
    def __init__(self, connectionRetryLimit = None, server = None, timezone = None, dbConnectionString = None, callsign = None, aprsRadius = None, stopevent = None):
        # The database connection string
        self.dbstring = habconfig.dbConnectionString
        if dbConnectionString:
            self.dbstring = str(dbConnectionString)

        # The database connection object
        self.aprsconn = None

        # The timezone
        self.timezone = 'America\Denver'
        if timezone:
            self.timezone = str(timezone)

        # If no callsign was given, then construct a random string of 5 characters
        if not callsign:
            callsign = "".join(random.choice(string.ascii_uppercase) for x in range(5))
        
        # If the callsign is > 8 characters, then truncate it to 8
        if len(callsign) > 8:
            callsign = callsign[:8]

        # Number of random digits we need to append to the callsign
        numRandomDigits = 9 - len(callsign)

        # This generates a random number to append to the callsign and pads it such that the 9-character callsign is always random
        self.callsign = callsign + str(random.randint(5, 10 ** numRandomDigits - 1)).zfill(numRandomDigits)
        
        # aprslib connection
        self.ais = None

        # The aprs-is server
        self.server = "noam.aprs2.net"
        self.server_port = "14580"
        if server:
            self.server = server
            if isinstance(self.server, list):
                self.server = self.server[random.randint(0, len(self.server)-1)]
                debugmsg("picking random server from list: %s" % self.server)

        # the connection attempt limit and timeout per try
        self.timeout = 5
        self.long_timeout = 30

        # by default, the connectionRetryLimit is set to None, which will cause the run() function to loop forever.
        self.connectionRetryLimit = None
        if connectionRetryLimit:
            self.connectionRetryLimit = connectionRetryLimit

        # APRS-IS filter radius.  Default is 50km.
        self.aprsRadius = 50
        if aprsRadius:
            self.aprsRadius = aprsRadius

        # Placeholder for multiprocessing event from run() function
        if stopevent:
            self.stopevent = stopevent
        else:
            selt.stopevent = mp.Event()

        debugmsg("APRSIS Instance Created:")
        debugmsg("    dbstring: %s" % self.dbstring)
        debugmsg("    timezone: %s" % self.timezone)
        debugmsg("    callsign: %s" % self.callsign)
        debugmsg("    server: %s" % self.server)
        debugmsg("    server_port: %s" % self.server_port)
        debugmsg("    timeout: %s" % self.timeout)
        debugmsg("    long_timeout: %s" % self.long_timeout)
        debugmsg("    aprsRadius: %s" % self.aprsRadius)


    ################################
    # connect to the aprs-is server
    # 
    # This function will block until the connection try limit is reached or the stopevent is triggered
    def run(self):

        try:
            # Create an aprslib object
            debugmsg("APRS-IS connection: callsign: %s, passcode: %s, host: %s, port: %s" % (self.callsign, aprslib.passcode(self.callsign), self.server, '14580'))
            self.ais = aprslib.IS(self.callsign, aprslib.passcode(self.callsign), host=self.server, port='14580')

            # ...set the getAPRSFilter function
            filterstring = self.getAPRSFilter()
            self.ais.set_filter(filterstring)
            debugmsg("APRS-IS initial filter string set to: %s" % filterstring)
            
            # set the connection retry loop limit
            if self.connectionRetryLimit:
                trylimit = self.connectionRetryLimit
            else:
                trylimit = 999999999

            # This is the thread which updates the filter used with the APRS-IS connectipon
            aprsfilter = th.Thread(name="APRS-IS Filter", target=self._aprsFilterThread, args=())
            aprsfilter.setDaemon(True)
            aprsfilter.start()
            debugmsg("Filter thread created.")

            debugmsg("Connection retry loop limit set to: %s" % trylimit)

            # This will attempt a connection multiples times (ie. the following while loop), waiting self.timemout seconds in between tries.
            trycount = 0
            while trycount < trylimit and not self.stopevent.is_set():
                try:
                    # wait before trying to connect, but if the number or attempts grows larger, slow down...
                    if trycount > 18:
                        debugmsg("Waiting for %d seconds" % self.long_timeout)
                        self.stopevent.wait(self.long_timeout)
                    elif trycount > 0:
                        debugmsg("Waiting for %d seconds" % self.timeout)
                        self.stopevent.wait(self.timeout)

                    # Try to connect to aprsc
                    self.ais.connect()

                    debugmsg("Running AIS consumer function....")
                    print "Aprsc-is connection to ", self.server, " successful"
                    sys.stdout.flush()

                    # The consumer function blocks forever, calling the writeToDatabase function upon receipt of each APRS packet
                    self.ais.consumer(self.writeToDatabase, blocking=True, raw=True, immortal=True)

                except (aprslib.ConnectionDrop, aprslib.ConnectionError, aprslib.LoginError, aprslib.ParseError) as error:
                    print "[%s] Aprsc-is connection to %s failed. Attempt # %d, %s" % (datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), self.server, trycount, error)
                    sys.stdout.flush()

                finally:
                    # Increment trycount each time through the loop
                    trycount += 1

        except (GracefulExit, KeyboardInterrupt, SystemExit):
            self.close()



    ################################
    # destructor
    def __del__(self):
        self.close()


    ################################
    # Function for closing all connections
    def close(self):
        try:
            if self.ais:
                debugmsg("Closing APRS-IS connection")
                self.ais.close()

            if self.aprsconn:
                if not self.aprsconn.closed:
                    debugmsg("closing database connection")
                    self.aprsconn.close()
                else:
                    debugmsg("Databse connection was already closed")
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
            debugmsg("Databse connection string not set.")
            return False

        try:

            # If not already connected to the database, then try to connect
            if not self.aprsconn:
                debugmsg("Connecting to the database: %s" % self.dbstring)
                self.aprsconn = pg.connect (self.dbstring)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.close()
            print(error)
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
            gpscur = self.aprsconn.cursor()
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
            print(error)
            return gpsposition


    ##################################################
    # Write an incoming packet to the database
    def writeToDatabase(self, x): 
        try:
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
            else:
                ptype = ""
                info = ""
            
            # For those APRS packets that have an "object name" (presumably for an APRS "object") then we set the "from" field to the "object name".
            # ...even though the object packet was likely transmitted from a different callsign/station, sitting the from field to this object name
            # makes for niceness downstream when displaying APRS items on the map.
            if packet["object_name"] != "":
                packet["from"] = packet["object_name"]

            # Create a database cursor
            tapcur = self.aprsconn.cursor()

            # If the packet includes a location (some packets do not) then we form our SQL insert statement differently
            if packet["latitude"] == "" or packet["longitude"] == "":
                # SQL insert statement for packets that DO NOT contain a location (i.e. lat/lon)
                sql = """insert into packets (tm, callsign, symbol, speed_mph, bearing, altitude, comment, location2d, location3d, raw, ptype, hash) values (
                    now()::timestamp with time zone, 
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
                    packet["from"], 
                    packet["symbol"], 
                    packet["speed"], 
                    packet["course"], 
                    packet["altitude"], 
                    packet["comment"], 
                    packet["raw"], 
                    ptype, 
                    info)
                    )
                tapcur.execute(sql, [
                    packet["from"], 
                    packet["symbol"], 
                    packet["speed"], 
                    packet["course"], 
                    packet["altitude"], 
                    packet["comment"], 
                    packet["raw"], 
                    ptype, 
                    info
                ])

            else:
                # SQL insert statement for packets that DO contain a location (i.e. lat/lon)
                sql = """insert into packets (tm, callsign, symbol, speed_mph, bearing, altitude, comment, location2d, location3d, raw, ptype, hash) values (
                    now()::timestamp with time zone, 
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
                    packet["raw"], 
                    ptype,
                    info)
                    )
                tapcur.execute(sql, [
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
                    packet["raw"], 
                    ptype,
                    info
                ])

            # Close the database cursor
            tapcur.close()

            # Commit the insert to the database
            self.aprsconn.commit()
             

        except (ValueError, UnicodeEncodeError) as error:
            print "Encoding error: ", error
            print "Skipping DB insert for: ", x
            sys.stdout.flush()
            pass

        except pg.DatabaseError as error:
            print "[cwopWriteToDatabase] Database error:  ", error
            print "[cwopWriteToDatabase] raw packet: ", x
            tapcur.close()
            self.close()
        except (aprslib.ParseError, aprslib.UnknownFormat) as exp:
            pass
        except (StopIteration, KeyboardInterrupt, GracefulExit, SystemExit): 
            tapcur.close()
            self.close()


    ##################################################
    # Thread for updating APRS-IS filter
    def _aprsFilterThread(self):
       
        # The time in seconds in between updating the APRS-IS filter.
        # 
        delta = 15 

        try:
            # Loop forever (until this thread/process is killed) sleeping each time for "delta" seconds.
            while not self.stopevent.is_set():
                # Sleep for delta seconds
                self.stopevent.wait(delta)

                # Get a new APRS-IS filter string (i.e. our lat/lon location could have changed, beacon callsigns could have changed, etc.)
                filterstring = self.getAPRSFilter()
                debugmsg("Setting APRS-IS filter to: %s" % filterstring)
     
                # Put this filter into effect
                self.ais.set_filter(filterstring)

        except (StopIteration, KeyboardInterrupt, GracefulExit, SystemExit): 
            print "APRS-IS filter thread ended"


    ##################################################
    # Create an APRS-IS filter string
    # This is the client-side filter used for connecting to cwop.aprs.net
    # This function is called periodically to adjust the filter dynamically (i.e. user might be 
    # driving around and thus their GPS position is changing).
    def getAPRSFilter(self):
        try:
            # aprsFilter variable
            aprsFilter = ""

            # Get our current location
            gpsposition = self.getGPSPosition()

            # Only build a radius-query for APRS-IS if there was a "latest" position reurned from the SQL query.  
            if gpsposition['isvalid'] == True:
                aprsFilter = aprsFilter + " r/" + str(gpsposition['latitude']) + "/" + str(gpsposition['longitude']) + "/" + str(int(self.aprsRadius))
                debugmsg("Filter string:  %s" % aprsFilter)

            # Return the resulting APRS-IS filter string
            return aprsFilter

        except pg.DatabaseError as error:
            self.close()
            print "Database error:  ", error
        except (StopIteration, KeyboardInterrupt, GracefulExit, SystemExit): 
            self.close()



#####################################
# class for connecting to APRS-IS systems
#####################################
class aprsTap(APRSIS):
    def __init__(self, server = None, timezone = None,  callsign = None, ssid = None, aprsRadius = None, stopevent = None):
        super(aprsTap, self).__init__(server = server, timezone = timezone, callsign = callsign, aprsRadius = aprsRadius, stopevent = stopevent)
        self.ssid = ssid

        # the callsign for what Direwolf is using, defaults to the underlying callsign
        self.dwcallsign = self.callsign
        if callsign:
            self.dwcallsign = callsign

    def getAPRSFilter(self):
        try:
            # Adjust inital APRS-IS filter if a callsign was given.
            # ...we do this so that we ingest packets that were heard directly as well as those via a radius, etc..
            if self.ssid and self.dwcallsign != "E0SS":
                aprsFilter = "e/" + self.dwcallsign + "-" + self.ssid
            elif self.dwcallsign:
                aprsFilter = "e/" + self.dwcallsign + "*"
            else:
                aprsFilter = ""

            # Get our current location
            aprsFilter = aprsFilter + " " + super(aprsTap, self).getAPRSFilter()

            # SQL query to fetch the callsigns for beacons on active flights
            activeBeaconsSql = """select
                f.flightid,
                fm.callsign

                from
                flights f,
                flightmap fm

                where
                fm.flightid = f.flightid
                and f.active = true

                order by
                f.flightid desc,
                fm.callsign asc;
            """

            # Execute the SQL query and fetch the results
            pgCursor = self.aprsconn.cursor()
            pgCursor.execute(activeBeaconsSql)
            rows = pgCursor.fetchall()
            pgCursor.close()

            # Loop through each beacon callsign, building the APRS-IS filter string
            beaconFilter = ""
            for beacon in rows:
                beaconFilter = beaconFilter + "/" + beacon[1]
            if len(rows) > 0:
                aprsFilter = aprsFilter + " b" + beaconFilter

            # Loop through the first 9 beacons adding 50km friend filters for each one.
            friendFilter = ""
            for beacon in rows[0:9]:
                friendFilter = friendFilter + " f/" + beacon[1] + "/50"
            if len(rows) > 0:
                aprsFilter = aprsFilter + friendFilter

            # Return the resulting APRS-IS filter string
            debugmsg("aprsTap filter: %s" % aprsFilter)
            return aprsFilter

        except pg.DatabaseError as error:
            pgCursor.close()
            self.close()
            print "Database error:  ", error
        except (StopIteration, KeyboardInterrupt, GracefulExit, SystemExit): 
            pgCursor.close()
            self.close()


#####################################
# class for connecting to CWOP systems
#####################################
class cwopTap(APRSIS):
    def __init__(self, server = None, timezone = None,  callsign = None, ssid = None, aprsRadius = None, stopevent = None):
        super(cwopTap, self).__init__(None, server, timezone, None, callsign, aprsRadius, stopevent)
        self.ssid = ssid

    def getAPRSFilter(self):
        try:
            # Get our current location
            aprsFilter = super(cwopTap, self).getAPRSFilter()

            # database cursor
            pgCursor = self.aprsconn.cursor()

            # SQL query to fetch look for landing predictions for any active flights
            landingPredictionsSql = """select
                a.tm,
                a.flightid,
                a.callsign,
                a.lat,
                a.lon

                from 
                (select 
                l.tm,
                f.flightid,
                fm.callsign,
                round(cast(ST_Y(l.location2d) as numeric), 6) as lat,
                round(cast(ST_X(l.location2d) as numeric), 6) as lon,
                rank () over (
                    partition by f.flightid, fm.callsign 
                    order by l.tm desc
                ) as rank

                from 
                landingpredictions l,
                flights f,
                flightmap fm

                where
                fm.flightid = f.flightid
                and f.active = true
                and l.flightid = f.flightid
                and l.callsign = fm.callsign
                and l.tm > now()::date

                order by
                l.tm desc
                ) as a

                where 
                a.rank = 1
            """
            # Execute the SQL query and fetch the results
            pgCursor.execute(landingPredictionsSql)
            rows = pgCursor.fetchall()

            # Loop through each row, building the APRS-IS filter string
            lpFilter = ""
            for lp in rows:
                lpFilter = lpFilter + " r/" + str(lp[3]) + "/" + str(lp[4]) + "/" + str(self.aprsRadius)

            aprsFilter = aprsFilter + lpFilter

            # SQL query to fetch the lat/lon of callsigns for beacons on active flights
            activeBeaconsSql = """select
                t.tm,
                t.flightid,
                t.callsign,
                t.lat,
                t.lon

                from
                (select
                a.tm,
                f.flightid,
                fm.callsign,
                round(cast(ST_Y(a.location2d) as numeric), 6) as lat, 
                round(cast(ST_X(a.location2d) as numeric), 6) as lon,
                rank () over (
                    partition by f.flightid, fm.callsign
                    order by a.tm desc
                ) as rank

                from
                flights f,
                flightmap fm,
                packets a

                where
                fm.flightid = f.flightid
                and f.active = true
                and a.callsign = fm.callsign
                and a.location2d != ''
                and a.tm > now()::date

                order by
                a.tm desc,
                f.flightid,
                fm.callsign
                ) as t  

                where 
                t.rank = 1
            """

            # Execute the SQL query and fetch the results
            pgCursor.execute(activeBeaconsSql)
            rows = pgCursor.fetchall()
            pgCursor.close()

            # Loop through each beacon callsign, building the APRS-IS filter string
            beaconFilter = ""
            for beacon in rows:
                beaconFilter = beaconFilter + " r/" + str(beacon[3]) + "/" + str(beacon[4]) + "/" + str(self.aprsRadius)

            aprsFilter = aprsFilter + beaconFilter

            # Return the resulting APRS-IS filter string
            debugmsg("cwopTap filter: %s" % aprsFilter)
            return aprsFilter

        except pg.DatabaseError as error:
            pgCursor.close()
            self.close()
            print "Database error:  ", error
        except (StopIteration, KeyboardInterrupt, GracefulExit, SystemExit): 
            pgCursor.close()
            self.close()

