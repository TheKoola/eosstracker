##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, Jeff Deaton (N6BA)
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
import threading as th
import signal
import aprslib
import os
import sys
import random
import time
import datetime 
import psycopg2 as pg
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
        print "%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message)
        sys.stdout.flush()


##################################################
# Create an APRS-IS filter string for the aprsc Uplink port.
# This filter is used to limit the amount of data downloaded from the
# APRS-IS servers.  This is not the "vampire tap" filter.
##################################################
def getAPRSISFilter(aprsRadius, customfilter = None):
    try:

        # If the radius is <= 0 then we just reeturn a blank filter string as the caller doesn't want to use a filter on the APRS-IS uplink connection.
        if aprsRadius <= 0:
            return ""

        # Check the customfilter and prepend that to aprsFilter
        if customfilter != None:
            aprsFilter = customfilter
        else:
            aprsFilter = ""

        # Database connection
        pgConnection = pg.connect(habconfig.dbConnectionString)
        pgCursor = pgConnection.cursor()

        # SQL query to get our current (or last) GPS location in lat/lon
        lastPositionSQL = """select 
            tm::timestamp without time zone as time, 
            speed_mph, 
            bearing, 
            altitude_ft, 
            round(cast(ST_Y(location2d) as numeric), 3) as latitude, 
            round(cast(ST_X(location2d) as numeric), 3) as longitude 

            from 
            gpsposition 

            order by 
            tm desc limit 1;
        """

        # Execute the SQL query and fetch the results
        pgCursor.execute(lastPositionSQL)
        rows = pgCursor.fetchall()

        # Only build a radius-query for APRS-IS if there was a "latest" position reurned from the SQL query.  
        # ....granted, this location might be really old.
        # Future note:  for those users that are running this from home, we need to provide a way for them to enter an arbitrary point to serve as the 
        #               center of a large circle to capture packets from an active flight's tracking efforts.
        if len(rows) > 0:
            latitude = rows[0][4]
            longitude = rows[0][5]
            aprsFilter = aprsFilter + " r/" + str(latitude) + "/" + str(longitude) + "/" + str(int(aprsRadius))
        #print "aprsFilter1: %s\n" % aprsFilter


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
        pgCursor.execute(activeBeaconsSql)
        rows = pgCursor.fetchall()

        # Loop through each beacon callsign, building the APRS-IS filter string
        beaconFilter = ""
        for beacon in rows:
            beaconFilter = beaconFilter + "/" + beacon[1]
        if len(rows) > 0:
            aprsFilter = aprsFilter + " b" + beaconFilter


        # Loop through the first 9 beacons adding 100km friend filters for each one. 
        friendFilter = ""
        for beacon in rows[0:9]:
            friendFilter = friendFilter + " f/" + beacon[1] + "/100"
        if len(rows) > 0:
            aprsFilter = aprsFilter + friendFilter


        # Close database connection
        pgCursor.close()
        pgConnection.close()

        print "Using this filter for APRS-IS uplink: %s\n" % aprsFilter
        sys.stdout.flush()

        # Return the resulting APRS-IS filter string
        return aprsFilter

    except pg.DatabaseError as error:
        pgCursor.close()
        pgConnection.close()
        print "Database error:  ", error
    except (StopIteration, KeyboardInterrupt, SystemExit):
        pgCursor.close()
        pgConnection.close()


##################################################
# Process for connecting to APRS-IS
##################################################
def tapProcess(configuration, aprsserver, typeoftap, radius, e):

    try:
        if typeoftap == "cwop":
            tap = aprsis.cwopTap(server = str(aprsserver), callsign = str(configuration['callsign']), timezone = str(configuration["timezone"]), aprsRadius = radius, stopevent = e)
        elif typeoftap == "aprs":
            tap = aprsis.aprsTap(server = str(aprsserver), callsign = str(configuration['callsign']), ssid = str(configuration["ssid"]), timezone = str(configuration["timezone"]), aprsRadius = radius, stopevent = e)
        else:
            return

        tap.run()

    except (aprslib.ConnectionDrop, aprslib.ConnectionError, aprslib.LoginError, aprslib.ParseError) as error:
        print "Closing APRS(", aprsserver, ") Tap: ", error
        tap.close()
        print "Tap ended: ", aprsserver

    except pg.DatabaseError as error:
        print "[tapProcess(", aprsserver, ")] Database error:  ", error
        tap.close()
    except (KeyboardInterrupt, SystemExit):
        tap.close()
        print "Tap ended: ", aprsserver


##################################################
# Build the aprsc configuration file
##################################################
def createAprscConfig(filename, callsign, igate, customfilter = None):

    # Name of the aprsc configuration file.  If not provided then we can't run aprsc.  This should never happen, but just in case.
    if filename == "" or filename is None:
        return -1

    try:

    # Create or overwrite the aprsc configuration file
        with open(filename, "w") as f:
            f.write("ServerId " + callsign + "\n")
            password = aprslib.passcode(str(callsign))
            f.write("PassCode " + str(password) + "\n")
            f.write("MyAdmin \"HAB Tracker\"\n")
            f.write("MyEmail me@emailnotset.local\n")
            f.write("RunDir data\n")
            f.write("LogRotate 10 5\n")
            f.write("UpstreamTimeout 15s\n")
            f.write("ClientTimeout 48h\n")
            f.write("Listen \"Full feed\"                                fullfeed tcp ::  10152 hidden\n")
            f.write("Listen \"\"                                         fullfeed udp ::  10152 hidden\n")
            f.write("Listen \"Client-Defined Filters\"                   igate tcp ::  14580\n")
            f.write("Listen \"\"                                         igate udp ::  14580\n")

            if igate == "true":
                # For uploading packets received over RF (aka from Direwolf), set this to "full" instead of "ro".
                if customfilter == None:
                    f.write("Uplink \"Core rotate\" full  tcp  noam.aprs2.net 10152\n")
                else:
                    f.write("Uplink \"Core rotate\" full  tcp  noam.aprs2.net 14580 " + str(customfilter) + "\n")
            else:
                # This is set to be a read only connection to APRS-IS.  That is, we're not going to upload packets to any defined Uplink connections.
                if customfilter == None:
                    f.write("Uplink \"Core rotate\" ro  tcp  noam.aprs2.net 10152\n")
                else:
                    f.write("Uplink \"Core rotate\" ro  tcp  noam.aprs2.net 14580 " + str(customfilter) + "\n")

            f.write("HTTPStatus 0.0.0.0 14501\n")
            f.write("FileLimit        10000\n")
            f.close()
        return 0
    except (KeyboardInterrupt, SystemExit):
        return -1
    except IOError as error:
        print "Unable to create aprsc configuration file.\n %s" % error
        return -1



##################################################
# Run the aprsc process
##################################################
def aprsc(config, e):
    # Location of the aprsc binary
    aprsc_binary = "/opt/aprsc/sbin/aprsc"

    # Create the aprsc configuration file
    # We're assuming the path to this is the standard install path for aprsc, /opt/aprsc/etc/...
    # We always append "01" to the callsign to ensure that it's unique for APRS-IS
    aprsc_configfile = "/opt/aprsc/etc/tracker-aprsc.conf"

    # Get just the filename without any path, but prefix that with "etc/"....because aprsc runs in a chroot environment (aka no absolute paths).
    config_file = "etc/" + os.path.basename(aprsc_configfile)

    # This generates a random number to append to the callsign and pads it such that the server ID is always 9 characters in length
    numRandomDigits = 9 - len(config["callsign"])
    aprscServerId = str(config["callsign"]) + str(random.randint(5, 10 ** numRandomDigits - 1)).zfill(numRandomDigits)


    ##########
    # We build the configuration file assuming we're running the modifyed aprsc binary that accepts filter commands on the Uplink port.
    # To check, we run with the "-y" switch initially and check the return code.  If > 0, then we revert to the syntax without the custom filter.
    #
    # Example (with custom filter):
    #    Uplink "Core rotate" full  tcp  noam.aprs2.net 14580 filter r/39/-103/200
    #
    # Example (without custom filter):
    #    Uplink "Core rotate" full  tcp  noam.aprs2.net 10152
    #
    #
    ##########

    # Create a custom filter for the uplink port, this uses a 400km radius around our location (from GPS).
    aprsisfilter = "filter " + str(getAPRSISFilter(400, config["customfilter"]))

    # Create the configuration file with this custom filter.
    # If we can't create the configuration file, then we have to exit...
    if createAprscConfig(aprsc_configfile, aprscServerId, config["igating"], aprsisfilter) < 0:
        return  -1


    # For reference we must run aprsc as root (thus the need for sudo) so that it can chroot to the /opt/aprsc path.
    # For example:
    #     sudo /opt/aprsc/sbin/aprsc -u aprsc -t /opt/aprsc -e info -o file -r logs -c etc/aprsc-tracker.conf

    # To run aprsc, we must be root, so we're going to use sudo to do that.  This assumes, that the user running this script has
    # been given permission to start and stop (i.e. kill) the aprsc process without a password.

    # We first run aprsc with the "-y" switch to test the configuration file for syntax.
    aprsc_syntax_command = ["sudo", aprsc_binary, "-u", "aprsc", "-t", "/opt/aprsc", "-e", "info", "-o", "file", "-r", "logs", "-y", "-c", config_file]

    try:
        # Run the aprsc command, but we redirect output to /dev/null because we only care about the return code
        devnull = open(os.devnull, "w")
        p = sb.Popen(aprsc_syntax_command, stdout=devnull, stderr=sb.STDOUT)

        # Wait for it to finish and grab the return code.
        r = p.wait()

        # Make sure devnull is closed
        devnull.close()

        # If the return code is zero, then we can continue on using the custom filter on the Uplink connection.  If not zero, then
        # there was an error with the aprsc configuration file syntax, presumably because of our custom filter on the uplink port.
        if r != 0:
            print "WARNING:  Syntax error with aprsc Uplink configuration, retrying without custom uplink filter..."
            sys.stdout.flush()

            # We now need to rebuild the configuration file without a custom APRS-IS filer on the Uplink connection.
            # If we can't create the configuration file, then we have to exit...
            if createAprscConfig(aprsc_configfile, aprscServerId, config["igating"]) < 0:
                return  -1

        # The aprsc process should NOT be running, but if it is, we need to kill it.
        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"
    except (KeyboardInterrupt, SystemExit):
        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"


    # Now we start the aprsc process for real...

    # The command string and arguments for running aprsc
    aprsc_command = ["sudo", aprsc_binary, "-u", "aprsc", "-t", "/opt/aprsc", "-e", "info", "-o", "file", "-r", "logs", "-c", config_file]

    try:
        # Run the aprsc command
        p = sb.Popen(aprsc_command)

        # Wait for the stop event to be set
        e.wait()

        debugmsg("aprsc: stopevent must have been set")

        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"
    except (KeyboardInterrupt, SystemExit):
        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"

