##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020,2023 Jeff Deaton (N6BA)
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
from queue import Empty
import subprocess as sb
import time
import datetime 
import psycopg2 as pg
import aprslib
import threading as th
import socket
import sys
import signal
import random
from inspect import getframeinfo, stack
import string
from dataclasses import dataclass
import logging
from logging.handlers import QueueHandler, QueueListener, TimedRotatingFileHandler

#import local configuration items
import habconfig 
from packet import Packet


#####################################
# database error class
#####################################
@dataclass
class DBError(Exception):
    """
    Raised when there was some sort of database error.  Allows for a custom message to be set.
    """
    message: str = None


#####################################
# base class for writing packets to the database
#####################################
@dataclass
class databaseWriter(object):

    # The database connection string
    dbstring: str = habconfig.dbConnectionString

    # The database connection object
    dbconn: pg.extensions.connection = None

    # The queue where incoming packets are stored
    packetqueue: mp.Queue = None

    # The timezone
    timezone: str = 'America\Denver'

    # Placeholder for multiprocessing event from run() function
    stopevent: mp.Event = mp.Event()

    # Last time a packet was ingested/handled. 
    ts: datetime.datetime = datetime.datetime.now()

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

        self.logger.debug("databaseWriter Instance Created:")
        self.logger.debug(f"    dbstring: {self.dbstring}")
        self.logger.debug(f"    timezone: {self.timezone}")


    ################################
    # This function will block until the stopevent is triggered
    ################################
    def run(self):

        # The number of times we've tried to connect to the database
        trycount = 0

        # timeout between tries
        timeout = 5

        # long timeout
        long_timeout = timeout * 12

        # This will attempt a connection multiples times (ie. the following while loop), waiting a few seconds in between tries.
        while not self.stopevent.is_set():

                # wait before trying to connect, but as the number of attempts grows larger, slow down...
                if trycount > 18:
                    self.logger.debug(f"Waiting for {long_timeout} seconds")
                    self.stopevent.wait(long_timeout)
                elif trycount > 0:
                    self.logger.debug(f"Waiting for {timeout} seconds")
                    self.stopevent.wait(timeout)

                # Try and connect to the database
                connected = self.connectToDatabase()

                self.logger.debug(f"connection to the database:  {connected}")

                # if the connection was successful, then we set the trycount back to zero
                if connected:
                    trycount = 0

                # Now loop, checking the incoming queue for packets that need to be written to the database
                while connected and not self.stopevent.is_set():

                    # Update the last timestamp
                    self.ts = datetime.datetime.now()

                    try: 
                        # attempt to read a packet from the queue
                        packet = self.packetqueue.get_nowait()

                        # if a packet was returned from the queue, then write it to the database
                        if packet is not None:

                            self.logger.debug(f"Packet from queue:  {packet}")

                            # write this packet to the database
                            self.writeToDatabase(packet)

                    except (Empty, ValueError) as e:

                        #self.logger.debug(f"Packetqueue was empty: {e}")

                        # if the queue was empty, then wait for a second before retrying
                        self.stopevent.wait(1)

                    except (DBError) as e:

                        self.logger.debug("DBError: {e}")

                        # something happened with the database write attempt, break out of this inner loop
                        break

                # Close our database connection
                self.close()

                # Increment trycount each time through the loop
                trycount += 1

        self.logger.info("Ending databasewriter process.")
        self.close()

        #except (KeyboardInterrupt, SystemExit) as err:
        #    self.logger.debug(f"Caught interrupt event, exiting run() function:  {err}")
        #    self.close()



    ##################################################
    # destructor
    ##################################################
    def __del__(self):
        self.logger.debug("__del__: calling close()")
        self.close()


    ##################################################
    # Function for closing all connections
    ##################################################
    def close(self):
        try:

            if self.dbconn:
                if not self.dbconn.closed:
                    self.logger.debug("closing database connection")
                    self.dbconn.close()
                else:
                    self.logger.debug("Databse connection was already closed")
            else:
                self.logger.debug("Database connection not created.")
        except pg.DatabaseError as error:
            self.logger.error(f"Database error: {error}")


    ##################################################
    # Set the database connection string
    ##################################################
    def setDBConnection(self, dbstring = None):
        # Set the database connection 
        if dbstring:
            self.logger.debug(f"Setting database connection string to: {dbstring}")
            self.dbstring = dbstring


    ##################################################
    # Function for connecting to the database
    ##################################################
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            self.logger.debug("Database connection string not set.")
            return False

        try:

            # If not already connected to the database, then try to connect
            if not self.dbconn:
                self.logger.debug(f"Connecting to the database: {self.dbstring}")

                # Connect to the database
                self.dbconn = pg.connect (self.dbstring)

                # Set autocommit to on
                self.dbconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.close()
            self.logger.error(f"Database error: {error}")
            return False



    ##################################################
    # Write an incoming packet to the database
    ##################################################
    def writeToDatabase(self, p: Packet):
        """
        this will write the incoming packet (p) to the database. 
        """

        

        # If packet is None then just return
        if not p:
            self.logger.debug("writeToDatabase: packet is None.")
            return None

        try:

            # The raw APRS packet (this is already converted to UTF-8 text)
            x = p.text

            # the frequency
            frequency = p.frequency

            # this is no longer used, so we just set it to 0 because the database packets table still uses this.
            channel = 0

            self.logger.debug(f"writeToDatabase.  x({type(x)}): {x}, frequency: {frequency}")

            # Create a database cursor
            tapcur = self.dbconn.cursor()

            # Update the watchdog timer
            self.ts = datetime.datetime.now()

            # The source (i.e. we're listening to packets from Direwolf's KISS port, the ka9q-radio, etc.)
            packetsource = p.source  # "ka9q-radio", "direwolf", etc.

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


            self.logger.debug("checking if a posit packet...")
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
                self.logger.debug("Packet SQL: " + sql % (
                    packetsource,
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
                    packetsource,
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
                self.logger.debug("Packet SQL: " + sql % (
                    packetsource,
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
                    packetsource,
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
            self.dbconn.commit()

            # Close the database cursor
            tapcur.close()


        except (NameError, ValueError, UnicodeEncodeError) as error:
            self.logger.warning(f"Error parsing packet({x}): {error}")

        except pg.DatabaseError as error:
            ts = datetime.datetime.now()
            thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
            self.logger.error(f"{thetime}: Database error with packet(\"{x}\"): {error}")
            tapcur.close()
            self.close()

            # raise an error that something happened with the database
            raise DBError(f"Attempting to add packet to database: {error}")


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
                    self.logger.info(f"Unable to parse. null character, info: {info}")

                # remvove nul chars from info
                info = info.replace(chr(0x00), '')

                # Make sure the info part is a string
                if type(info) is bytes:
                    info = info.decode("UTF-8", "ignore")

                if info.find(chr(0x00)) >= 0:
                    self.logger.info(f"unable to parse again. null character, info: {info}")


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
                self.logger.debug("Packet SQL: " + sql % (
                    packetsource,
                    channel,
                    frequency,
                    callsign.strip(),
                    x, 
                    ptype.strip(),
                    info.strip()
                    ))
                try: 
                    tapcur.execute(sql, [
                        packetsource,
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
                    self.logger.error(f"{thetime}: Database error with packet(\"{x}\"): {error}")
                    tapcur.close()

                    # Raise the database error
                    raise DBError("A database error occured during 2nd attempt: {}".format(error))
                    
                except ValueError as e:
                    ts = datetime.datetime.now()
                    thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
                    self.logger.warning(f"{thetime}: Databasewriter. Error adding packet(\"{x}\": {e}")
                    tapcur.close()


        except (StopIteration):
            tapcur.close()
            self.close()

        return True


##################################################
# runDatabaseWriter
##################################################
def runDatabaseWriter(config):
    try:

        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logging.INFO)
        logger.propagate = False

        # configure logging for the aprslib module
        logging.getLogger("aprslib").addHandler(qh)

        # Create a new database writer object
        logger.info("Starting databasewriter process.")
        k = databaseWriter(timezone = config["timezone"], stopevent = config["stopevent"], packetqueue = config["databasequeue"], loggingqueue = config["loggingqueue"])

        logger.debug(f"databasewriter: {k}")
        logger.debug("Running databaseWriter.run()...")
        k.run()

    except (KeyboardInterrupt, SystemExit): 
        logger.debug(f"runDatabaseWriter caught keyboardinterrupt")
        config["stopevent"].set()
        k.close()

    logging.info("databaseWriter ended")

