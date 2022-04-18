##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020,2021,2022 Jeff Deaton (N6BA)
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
# The APRSStatus Class
# 
#####################################
class APRSStatus(object):

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

        debugmsg("APRSStatus constructor")
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
                debugmsg("APRSStatus destructor:  closing database connection.")
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
    def processStatusPackets(self):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return 0

        if self.dbconn.closed:
            return 0

        l = []
        for l in [self.status_packets()]:
            if len(l) > 0:
                for str in l:
                    if str is not None and str != "":

                        # Transmit this via direwolf
                        debugmsg("Transmitting: %s" % str)
                        self.direwolf.transmit(str)



    ################################
    # This returns a string that contains a list of status packets that should be transmitted
    def status_packets(self):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # database cursor
        statuscur = self.dbconn.cursor()

        # Information string
        infoStrings = []

        try:
            # Get the any packets from the statusqueue table
            statusqueue_sql = """
                select 
                    s.transmit_text

                from
                    statusqueue s

                where 
                    s.transmitted = 'n'
                    and s.tm > now() - interval '00:20:00'

                order by
                    s.tm asc 
                ;
            """

            # Execute the query to get the most recent landing prediction for this callsign
            statuscur.execute(statusqueue_sql)
            rows = statuscur.fetchall()

            # loop through each row returned, forming up the text for an APRS status packet
            for r in rows:
                infoString = ">" + str(r[0])[0:62]
                infoStrings.append(infoString)
                debugmsg("APRSStatus: appending, {}, to the list of packets to transmit.".format(infoString))

            # now set the transmitted flag to true for each status message returned above.  This is premature as we're "assuming"
            # these packets will ultimately get xmitted later on.  <<<need to find a better way to do this>>>
            statusqueue_sql = """
                update statusqueue set transmitted='y' where transmitted='n';
            """
            statuscur.execute(statusqueue_sql)

        except pg.DatabaseError as error:
            statuscur.close()
            self.dbconn.close()
        except (KeyboardInterrupt, SystemExit):
            statuscur.close()
            self.dbconn.close()
        finally: 
            statuscur.close()

        return infoStrings


##################################################
# runAPRSStatus process
##################################################
def runAPRSStatus(e, config):
    try:

        # Create a new LandingPredictor object
        debugmsg("Starting APRSStatus process.")
        debugmsg("callsign: %s, dw_channel: %d" % (config["callsign"] + "-" + config["ssid"], config["xmit_channel"]))
        if config["includeeoss"] == "true" and config["eoss_string"] != "":
            via = config["eoss_string"] + ",WIDE1-1,WIDE2-1"
        else:
            via = "WIDE1-1,WIDE2-1"

        status = APRSStatus(config["callsign"] + "-" + config["ssid"], habconfig.dbConnectionString, timezone = config["timezone"], dw_channel = int(config["xmit_channel"]), viapath = via)

        # Wait some amount of time before we get started
        e.wait(10)

        # run the APRSStatus processor function continuously, every 5 seconds.
        while not e.is_set():
            status.processStatusPackets()
            e.wait(5)

    except (KeyboardInterrupt, SystemExit): 
        print "APRSStatus ended"
        pass


