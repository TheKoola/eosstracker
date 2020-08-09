#!/usr/bin/python

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

from optparse import OptionParser
import multiprocessing as mp
import subprocess as sb
import os
import math
import time
import datetime 
import psycopg2 as pg
import aprslib
import logging
import threading as th
import sys
import signal
import psutil
import json
import random
from inspect import getframeinfo, stack

#import local configuration items
import habconfig 
import landingpredictor as lp
import gpspoller
import aprsis
import infocmd
import kisstap
import searchrtlsdr
import aprsreceiver
import aprsc
import direwolf

class GracefulExit(Exception):
    pass

def signal_handler(signum, frame):
    ts = datetime.datetime.now()
    thetime = ts.strftime("%Y-%m-%d %H:%M:%S")
    pid = os.getpid()
    
    caller = getframeinfo(stack()[1][0])
    print "{} [{}] Caught signal: {}.  {}:{}".format(thetime, pid, signum, caller.filename.split("/")[-1], caller.lineno)
    sys.stdout.flush()
    raise GracefulExit()


##################################################
# Determine what frequencies and ports GnuRadio should listen on and which UDP ports to send audio over
##################################################
def getFrequencies(rtl=0):
    rtl = rtl * 10

    try:
        # connect to the database
        grconn = pg.connect (habconfig.dbConnectionString)
        grcur = grconn.cursor()

        # SQL query to get a list of active flights and the frequency their beacons will be xmiting on
        grsql = """select distinct
            cast(fm.freq * 1000000 as integer)

            from
            flights f,
            flightmap fm

            where
            fm.flightid = f.flightid
            and f.active = 't'
            and fm.freq <> 144.390

            order by
            1 asc;
        """
 
        # Execute the SQL query and fetch the results
        grcur.execute(grsql)
        rows = grcur.fetchall()

        # The frequency list...
        # Always listen on 144.39MHz and send audio for that frequency on UDP port 12000
        fl = [(144390000, 12000 + rtl)]
 
        # Now loop through all frequencies returned from the SQL query above
        u = 12001 + rtl
        for freq in rows:
            fl.append((freq[0], u))
            u += 1

        # Close database connections
        grcur.close()
        grconn.close()
 
        # Return our list of frequencies and their cooresponding UDP ports
        return fl

    except pg.DatabaseError as error:
        grcur.close()
        grconn.close()
        print error
        return None
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        grcur.close()
        grconn.close()
        return None
    

##################################################
# argument_parser function...This will parse through any command line options given and return the options
##################################################
def argument_parser():
    description = 'Backend daemon for the HAB Tracker application'
    parser = OptionParser(usage="%prog: [options]", description=description)
    parser.add_option(
        "", "--callsign", dest="callsign", type="string", default='E0SS',
        help="Provide your callsign (this is optional) [default=%default]")
    parser.add_option(
        "", "--aprsisRadius", dest="aprsisRadius", type="int", default=50,
        help="Set the radius (in kilometers) for filtering packets from APRS-IS [default=%default]")
    parser.add_option(
        "", "--algoInterval", dest="algoInterval", type="int", default=10,
        help="How often (in secs) the landing predictor run [default=%default]")
    parser.add_option(
        "", "--kill", dest="kill", action="store_true", 
        help="Use this option to kill any existing processes then exit")
    return parser




##################################################
# are processes running?
##################################################
def isRunning(myprocname):
    # Initialize the list that will contain our list of processes
    listOfProcesses = []

    # This is the list of process names we should look for (we ignore gpsd since it should always be running)
    procs = ["direwolf", "aprsc", myprocname]

    # Iterate over all running processes
    for proc in psutil.process_iter():
       # Get process detail as dictionary
       pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent' ])
   
       # check for a name match...
       for p in procs:
           if p in pInfoDict["name"].lower():
               listOfProcesses.append(pInfoDict)
               break
    return listOfProcesses



##################################################
# add row to tracker teams table
##################################################
def checkBenchTeam():
    # we need to see if the existing landing predictions table has the flightpath column and add it if not.
    try:
        # Database connection 
        dbconn = None
        dbconn = pg.connect (habconfig.dbConnectionString)
        dbcur = dbconn.cursor()

        # SQL to check if the column exists or not
        check_row_sql = "select * from teams where tactical='ZZ-Not Active';"
        dbcur.execute(check_row_sql)
        rows = dbcur.fetchall()

        # If the number of rows returned is zero, then we need to add the row
        if len(rows) == 0:
            print "Adding the 'ZZ-Not Active' team to the tracker team list."
            
            # SQL to add the row
            insert_sql = "insert into teams (tactical, flightid) values ('ZZ-Not Active', NULL);"
            dbcur.execute(insert_sql)
            dbconn.commit()

        # Close DB connection
        dbcur.close()
        dbconn.close()
    except pg.DatabaseError as error:
        dbcur.close()
        dbconn.close()
        print error


##################################################
# main function
##################################################
def main():
    
    # Check the options provided on the command line
    options, _ = argument_parser().parse_args()

    # lower case name of this script without any extension
    thisprocname = os.path.basename(sys.argv[0].lower()).split(".")[0]

    # the process id of this script
    mypid = os.getpid()


    # --------- this section checks for already running processes --------
    # check if any processes are running
    proclist = isRunning(thisprocname)

    # This gets us to a consolidated list of pids...minus the pid of this script.  ;)
    pids = []
    for p in proclist:
        if p["pid"] != mypid:
            pids.append(p["pid"])
    pids.sort()
 
    # If the kill switch was given the we kill these pids
    if options.kill:
        print "Killing processes..."
        for pid in pids:
    
            try: 
                # kill this pid
                os.kill(pid, signal.SIGTERM)
            except Exception as e:
                print "Unable to kill %d, %s" % (pid, e)
    
            # we give it a little time to work before going to the next pid
            time.sleep(1)
  
        # check if anything is still running
        proclist = isRunning(thisprocname) 
        leftoverpids = []
        for p in proclist:
            if p["pid"] != mypid:
                leftoverpids.append(p["pid"])
        leftoverpids.sort()
       
        # now kill any leftovers
        for pid in leftoverpids:
            try: 
                # kill this pid
                os.kill(pid, signal.SIGTERM)
            except Exception as e:
                print "Unable to kill %d, %s" % (pid, e)
    
            # we give it a little time to work before going to the next pid
            time.sleep(1)

        # now exit
        print "Done."
        sys.exit()

    else:  
        # if there are running pids and we didn't get the kill switch, then exit
        if len(pids) > 0:
            print "Processes are running, exiting."
            sys.exit()

    # --------- end of process checking section ----------



    # --------- Start of directory permissions section ----------
    # these directories need to have 777 permissions so the www-data user can write to them
    dirs_to_check = ["/eosstracker/www/audio", "/eosstracker/www/configuration"]

    # Loop through each directory
    for thedir in dirs_to_check:

        # Only proceed if this is a directory
        if os.path.isdir(thedir):

            # Get the current permissions of the directory
            perms = os.stat(thedir).st_mode

            # If these permisisons are not 777 then try to set them to 777
            if perms & 0o777 != 0o777:
                try:
                    print "Setting permissions to 777 on:", thedir 
                    os.chmod(thedir, 0o777)
                except OSError as e:
                    print "Unable to set permisisons to 777 on,", thedir, ", ", os.strerror(e.errno)

    # --------- End of directory permissions section ----------



    # --------- Add any Database things ----------
    checkBenchTeam();

    # --------- End of database additions----------



    # --------- Read in the configuration file (if it exists) --------
    # This is normally in ../www/configuration/config.txt
    try:
        with open('/eosstracker/www/configuration/config.txt') as json_data:
            configuration = json.load(json_data)
    except:
        # Otherwise, we assume the callsign from the command line and do NOT perform igating or beaconing
        configuration = { "callsign" : options.callsign, "igating" : "false", "beaconing" : "false" }

    ## Now check for default values for all of the configuration keys we care about.  Might need to expand this to be more robust/dynamic in the future.
    defaultkeys = {"timezone":"America/Denver","callsign":"","lookbackperiod":"180","iconsize":"24","plottracks":"off", "ssid" : "2", "igating" : "false", "beaconing" : "false", "passcode" : "", "fastspeed" : "45", "fastrate" : "01:00", "slowspeed" : "5", "slowrate" : "10:00", "beaconlimit" : "00:35", "fastturn" : "20", "slowturn": "60", "audiodev" : "0", "serialport": "none", "serialproto" : "RTS", "comment" : "EOSS Tracker", "includeeoss" : "true", "eoss_string" : "EOSS", "symbol" : "/k", "overlay" : "", "ibeaconrate" : "15:00", "ibeacon" : "false", "customfilter" : "r/39.75/-103.50/400", "objectbeaconing" : "false"}

    for the_key in defaultkeys.keys():
        if the_key not in configuration:
            configuration[the_key] = defaultkeys[the_key]

    # If the callsign is empty, we use the default one from the command line.
    if configuration["callsign"] == "":
        configuration["callsign"] = options.callsign

    # If the ssid is empty, we use "2" as the default
    if configuration["ssid"] == "":
        configuration["ssid"] = 2

    if configuration["igating"] == "true":
        if str(aprslib.passcode(str(configuration["callsign"]))) != str(configuration["passcode"]):
            print "Incorrect passcode, ", str(configuration["passcode"]), " != ", aprslib.passcode(str(configuration["callsign"])), ", provided, igating disabled."
            configuration["igating"] = "false"


    print "Starting HAB Tracker backend daemon"
    print "Callsign:  %s" % str(configuration["callsign"])

    # this holds the list of sub-processes and threads that we want to start/run
    processes = []

    # signal handler for catching kills
    signal.signal(signal.SIGTERM, signal_handler)

    # This is the common event that when set, will cause all the sub-processes to gracefully end
    stopevent = mp.Event()

    try:

        # A list of frequency lists (i.e. a list of lists) for creating the direwolf configuration file
        direwolfFreqList = []

        # The direwolf channel-to-frequency mapping
        freqmap = []

        # Get the RTL-SDR USB dongles that are attached
        sdrs = searchrtlsdr.getUSBDevices()

        # The number of SDRs
        i = len(sdrs)
 
        print "Number of usable SDRs: ", i

        #  Online-only mode:  
        #      - we do start aprsc, but only have it connect as "read-only" to APRS-IS (regardless if we want to igate or not)
        #      - we do not start GnuRadio processes
        #      - we do not start Direwolf
        #   
        #  RF mode: 
        #      - we do start aprsc, and connect in "read-only" mode (unless we want to igate packets to the internet)
        #      - we do start GnuRadio processes
        #      - we do start Direwolf and have it connect to the aprsc instance via "localhost" 

       
        # This is the aprsc process
        aprscprocess = mp.Process(target=aprsc.aprsc, args=(configuration, stopevent))
        aprscprocess.daemon = True
        aprscprocess.name = "aprc"
        processes.append(aprscprocess) 

        status = {}
        antennas = []

        # If USB SDR dongles are attached, then we're going to start in RF mode and start GnuRadio and Direwolf processes
        if i > 0:
            # For each SDR dongle found, start a separate GnuRadio listening process
            total_freqs = 0
            chan = 0
            for k in sdrs:

                print "Using SDR:  ", k
                status["rf_mode"] = 1
                
                # Get the frequencies to be listened to (ex. 144.39, 144.34, etc.) and UDP port numbers for xmitting the audio over
                freqlist = getFrequencies(k["rtl"])

                # Append this frequency list to our list for later json output
                ant = {}
                ant["rtl_id"] = k["rtl"]
                ant["frequencies"] = []
                ant["rtl_serialnumber"] = k["serialnumber"]
                ant["rtl_manufacturer"] = k["manufacturer"]
                ant["rtl_product"] = k["product"]
                for freq,udpport in freqlist:
                    ant["frequencies"].append({"frequency": round(freq/1000000.0, 3), "udp_port": udpport})
                    freqmap.append([chan, freq])
                    chan += 2
                    total_freqs += 1
                antennas.append(ant) 

                # append this frequency/UDP port list to the list for Direwolf
                direwolfFreqList.append(freqlist)

                # This is the GnuRadio process
                grprocess = mp.Process(target=aprsreceiver.GRProcess, args=(freqlist, int(k["rtl"]), stopevent))
                grprocess.daemon = True
                grprocess.name = "GnuRadio_" + str(k["rtl"])
                processes.append(grprocess)


            status["direwolfcallsign"] = str(configuration["callsign"]) + "-" + str(configuration["ssid"])

            # The direwolf process
            dfprocess = mp.Process(target=direwolf.direwolf, args=(stopevent, str(configuration["callsign"]) + "-" +  str(configuration["ssid"]), direwolfFreqList, configuration))
            dfprocess.daemon = True
            dfprocess.name = "Direwolf"
            processes.append(dfprocess)

            # The direwolf tap process 
            dftapprocess = mp.Process(target=kisstap.runKissTap, args=(5, stopevent, configuration, freqmap))
            dftapprocess.daemon = True
            dftapprocess.name = "Direwolf Tap"
            processes.append(dftapprocess)


            if configuration["beaconing"] == "true" and configuration["objectbeaconing"] == "true":

                configuration["xmit_channel"] = total_freqs * 2

                # The beaconing process (this is different from the position beacons that direwolf will transmit)
                print "Starting object beaconing process..."
                icprocess = mp.Process(target=infocmd.runInfoCmd, args=(120, stopevent, configuration))
                icprocess.daemon = True
                icprocess.name = "Object beaconing"
                processes.append(icprocess)

        else:
            status["rf_mode"] = 0
            status["direwolfcallsign"] = ""
           
        status["antennas"] = antennas 
        status["igating"] = configuration["igating"]
        status["beaconing"] = configuration["beaconing"]
        status["active"] = 1

        ts = datetime.datetime.now()
        status["starttime"] = ts.strftime("%Y-%m-%d %H:%M:%S")
        status["timezone"] = str(configuration["timezone"])

        # This is the APRS-IS connection tap.  This is the process that is responsible for inserting APRS packets into the database
        aprstap = mp.Process(name="APRS-IS Tap", target=aprsis.tapProcess, args=(configuration, "127.0.0.1", "aprs", options.aprsisRadius, stopevent))
        aprstap.daemon = True
        aprstap.name = "APRS-IS Tap"
        processes.append(aprstap)

        # This is the CWOP connection tap.  This is the process that is responsible for inserting CWOP packets into the database
        cwoptap = mp.Process(name="CWOP Tap", target=aprsis.tapProcess, args=(configuration, "cwop.aprs.net", "cwop", 200, stopevent))
        cwoptap.daemon = True
        cwoptap.name = "CWOP Tap"
        processes.append(cwoptap)

        # This is the GPS position tracker process
        gpsprocess = mp.Process(target=gpspoller.GpsPoller, args=(stopevent,))
        gpsprocess.daemon = True
        gpsprocess.name = "GPS Position Tracker"
        processes.append(gpsprocess)

        # This is the landing predictor process
        landingprocess = mp.Process(target=lp.runLandingPredictor, args=(options.algoInterval, stopevent, configuration))
        landingprocess.daemon = True
        landingprocess.name = "Landing Predictor"
        processes.append(landingprocess)


        # Loop through each process starting it
        for p in processes:
            #print "Starting:  %s" % p.name
            p.start()


        # Save the operating mode and status to a JSON file
        jsonStatusFile = "/eosstracker/www/daemonstatus.json"
        jsonStatusTempFile = "/eosstracker/www/daemonstatus.json.tmp"
        with open(jsonStatusTempFile, "w") as f:
            f.write(json.dumps(status))
        if os.path.isfile(jsonStatusTempFile):
            os.rename(jsonStatusTempFile, jsonStatusFile)
    
        # Join each process (which blocks until the sub-process ends)
        for p in processes:
            p.join()

    except (KeyboardInterrupt): 
        # The KeyboardInterrupt event is caught by all of the individual threads/processes so we just need to wait for them to finish
        for p in processes:
            print "Waiting for [%s] %s to end..." % (p.pid, p.name)
            p.join()

    except (GracefulExit, SystemExit) as msg: 
        # Set this event to be as graceful as we can for shutdown...
        print "Caught signal: {}, Setting stop event...".format(msg)
        sys.stdout.flush()

        stopevent.set()
        # For catching a kill signal, we need to tell the individual processes to terminate
        for p in processes:
            print "Waiting for [%s] %s to end..." % (p.pid, p.name)
            p.join()
            #print "Sending terminate signal to [%s] %s..." % (p.pid, p.name)
            #p.terminate()
            #p.join()

    # Save the operating mode and status to a JSON file...as basically empty as we're now shutting down
    jsonStatusFile = "/eosstracker/www/daemonstatus.json"
    jsonStatusTempFile = "/eosstracker/www/daemonstatus.json.tmp"
    status = {}
    status["antennas"] = []
    status["rf_mode"] = 0
    status["active"] = 0
    with open(jsonStatusTempFile, "w") as f:
        f.write(json.dumps(status))
    if os.path.isfile(jsonStatusTempFile):
        os.rename(jsonStatusTempFile, jsonStatusFile)

    print "\nDone."



if __name__ == '__main__':
    main()
