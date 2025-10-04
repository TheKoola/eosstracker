#!/usr/bin/python3

##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2025 Jeff Deaton (N0JD)
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
#mp.set_start_method('spawn')

from optparse import OptionParser
#from queue import Queue, Empty
import os
import time
import datetime 
import psycopg2 as pg
import logging
from logging.handlers import QueueListener, TimedRotatingFileHandler, QueueHandler
#logger = logging.getLogger(__name__)
#logger.propagate = False

import threading as th
import sys
#sys.stderr.reconfigure(encoding="UTF-8", newline='\r\n')
#sys.stdout.reconfigure(encoding="UTF-8", newline='\r\n')

import signal
import psutil
import json
import random
import math
from inspect import getframeinfo, stack

#import local configuration items
import habconfig 
import landingpredictor as lp
import databasechecks
import subprocesses


##################################################
# a generic exception that we can raise to signal other processes that they need to end
##################################################
class GracefulExit(Exception):
    pass

##################################################
# signal handler for SIGTERM
##################################################
def signal_handler(signum, frame):
    pid = os.getpid()
    caller = getframeinfo(stack()[1][0])
    logger = logging.getLogger(__name__)
    logger.warning(f"Caught SIGTERM signal. {pid=}")
    #raise SystemExit()
    raise GracefulExit()


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
    procs = [myprocname]

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
# Determine if we need to kill a prior running copy of this program or if we need to exit since it's already running
##################################################
def processChecks(myprocname, kill):

    logger = logging.getLogger(__name__)

    # check if any processes are running
    proclist = isRunning(myprocname)

    # the process id of this script
    mypid = os.getpid()

    # This gets us to a consolidated list of pids...minus the pid of this script.  ;)
    pids = []
    for p in proclist:
        if p["pid"] != mypid:
            pids.append(p["pid"])
    pids.sort()
 
    # If the kill switch was given the we kill these pids
    if kill:
        logger.info("Killing processes...")
        for pid in pids:
    
            try: 
                # kill this pid
                os.kill(pid, signal.SIGTERM)
            except Exception as e:
                logger.warning(f"Unable to kill {pid}, {e}")
    
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
                logger.warning(f"Unable to kill {pid}, {e}")
    
            # we give it a little time to work before going to the next pid
            time.sleep(1)

        return True

    else:  
        # if there are running pids and we didn't get the kill switch, then exit
        if len(pids) > 0:
            logger.warning("Processes are already running.")
            return True

    return False


##################################################
# Check these directories for 777 permissions so the web-based frontend works correctly
##################################################
def checkDirPerms():

    # these directories need to have 777 permissions so the www-data user can write to them
    dirs_to_check = ["/eosstracker/www/audio", "/eosstracker/www/configuration"]

    # Loop through each directory
    for thedir in dirs_to_check:

        # Only proceed if this is a directory
        if os.path.isdir(thedir):

            # Get the current permissions of the directory
            perms = os.stat(thedir).st_mode

            logger = logging.getLogger(__name__)

            # If these permisisons are not 777 then try to set them to 777
            if perms & 0o777 != 0o777:
                try:
                    logger.info(f"Setting permissions to 777 on: {thedir}") 
                    os.chmod(thedir, 0o777)
                except OSError as e:
                    logger.error(f"Unable to set permisisons to 777 on, {thedir}.  {os.strerror(e.errno)}")


##################################################
# read in the JSON configuration file
##################################################
def readConfiguration(configfile, options):

    # try to open the configuration file
    try:
        with open('/eosstracker/www/configuration/config.txt') as json_data:
            conf = json.load(json_data)
    except:

        # Otherwise, we assume the callsign from the command line and do NOT perform igating or beaconing
        conf = { "callsign" : options.callsign, "igating" : "false", "beaconing" : "false" }

    ## Now check for default values for all of the configuration keys we care about.  Might need to expand this to be more robust/dynamic in the future.
    defaultkeys = {
            "timezone":"America/Denver",
            "callsign":"",
            "lookbackperiod":"180",
            "iconsize":"24",
            "plottracks":"off", 
            "ssid" : "0", 
            "igating" : "false", 
            "beaconing" : "false", 
            "passcode" : "", 
            "gpshost": "",
            "ka9qradio": "false",
            "fastspeed" : "45", 
            "fastrate" : "01:00", 
            "slowspeed" : "5", 
            "slowrate" : "10:00", 
            "beaconlimit" : "00:35", 
            "fastturn" : "20", 
            "slowturn": "60", 
            "audiodev" : "0", 
            "serialport": "none", 
            "serialproto" : "RTS", 
            "comment" : "EOSS Tracker", 
            "includeeoss" : "true", 
            "eoss_string" : "EOSS", 
            "symbol" : "/k", 
            "overlay" : "", 
            "ibeaconrate" : "15:00", 
            "ibeacon" : "false", 
            "customfilter" : "r/39.75/-103.50/400", 
            "objectbeaconing" : "false", 
            "mobilestation" : "true",
            "aprsisserver" : "noam.aprs2.net",
            "cwopserver" : "cwop.aprs.net",
            "cwopradius" : 200
    }

    for the_key in list(defaultkeys.keys()):
        if the_key not in conf:
            conf[the_key] = defaultkeys[the_key]

    # If the callsign is empty, we use the default one from the command line.
    if conf["callsign"] == "":
        conf["callsign"] = options.callsign

    # If the ssid is empty, we use "0" as the default
    if conf["ssid"] == "":
        conf["ssid"] = 0

    # if igating is enabled, then we need to determine the aprs-is passcode, etc.
    if conf["igating"] == "true":
        if str(aprslib.passcode(str(conf["callsign"]))) != str(conf["passcode"]):
            logger = logging.getLogger(__name__)
            logger.warning(f"Incorrect passcode. {str(conf['passcode'])}, not equal to, {aprslib.passcode(str(conf['callsign']))}.  igating disabled.")
            conf["igating"] = "false"

    # Add the aprsisRadius and the algoInterval settings to the configuration from the options settings
    conf["aprsisradius"] = options.aprsisRadius
    conf["algointerval"] = options.algoInterval

    # Return the configuration
    return conf

##################################################
# create all sub-processes
##################################################
def createProcesses(configuration):

    # Our list of processes
    procs = []

    # Logger
    logger = logging.getLogger(__name__)

    # This is the landing predictor process
    logger.debug(f"Creating Landing Predictor subprocess")
    landingprocess = mp.Process(name="Landing Predictor", target=lp.runLandingPredictor, args=(configuration,))
    landingprocess.daemon = True
    procs.append(landingprocess)

    # If beaconing over RF using direwolf is enabled
    if configuration["beaconing"] == "true" or configuration["beaconing"] == True:
        # The direwolf process
        logger.debug(f"Creating Direwolf subprocess")
        dfprocess = mp.Process(name="Direwolf", target=subprocesses.runSubprocess, args=(configuration, 'direwolf'))
        dfprocess.daemon = True
        procs.append(dfprocess)

    # Return the list of newly created processes
    return procs



##################################################
# configure logging and return the queuelistener object and multiprocessing queue to be used by other sub-processes for logging.
##################################################
def configure_logging()->(QueueListener, mp.Queue):

    # setup logging
    logger = logging.getLogger(__name__)
    logger.propagate = False
    logger.setLevel(logging.INFO)
    formatstr = "%(asctime)s - %(levelname)s - %(module)s - %(message)s"
    formatter = logging.Formatter(formatstr)

    # logging output to the console (i.e. stdout, stderr) 
    ch = logging.StreamHandler(stream=sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    # log messages are also sent to the log file
    logfile = TimedRotatingFileHandler('/eosstracker/logs/habtracker.log', when='midnight', interval=1)
    logfile.setLevel(logging.INFO)
    logfile.setFormatter(formatter)
    logger.addHandler(logfile)

    # setup a queue that will be used the other sub-processes to send their logging to this process
    loggingqueue = mp.Queue()

    # Now create the QueueListener handler that will ingest logs from other processes
    qlistener = QueueListener(loggingqueue, ch, logfile)
    qlistener.start()

    return (qlistener, loggingqueue)


##################################################
# end sub-processes
##################################################
def endProcesses(processes = None)->bool:

    # sanity checks
    if processes == None:
        return False

    logger = logging.getLogger(__name__)

    # loop through each process in the list
    for p in processes:

        # Join the process, waiting for it to end, but only wait a few seconds
        if p.is_alive():
            logger.info(f"Waiting for [{p.pid}] {p.name} to end...")
            p.join(10)

            # check if the process is still alive.  If so, then we need to attempt to terminate it (maybe its hung?)
            if p.exitcode == None:
                logger.info(f"Terminating process, [{p.pid}] {p.name}...")
                p.terminate()


    # Loop through the processes once more, if anything is still running then we need to SIGKILL it
    for p in processes:

        # wait a few seconds for the process to end.
        if p.is_alive():
            p.join(5)

            # if the process still hasn't terminated, then we SIGKILL it
            if p.exitcode == None:

                logger.info(f"Sending SIGKILL to process, [{p.pid}] {p.name}...")
                p.kill()

    return True



##################################################
# main function
##################################################
def main():

    # Setup logging 
    loglistener, loggingqueue = configure_logging()
    logger = logging.getLogger(__name__)

    # Check the options provided on the command line
    options, _ = argument_parser().parse_args()

    # lower case name of this script without any extension
    thisprocname = os.path.basename(sys.argv[0].lower()).split(".")[0]

    # Check if we need to kill an already running copy of this script or if we're already running, then we need to exit.
    if processChecks(thisprocname, options.kill):
        logger.info("Done.")
        sys.exit(1)

    # Print out our starting up message
    pid = os.getpid()
    logger.info(f"############## HAB Tracker start, {pid=} #############")

    try:

        # Check the directory permissions of some of the web-based frontend stuff
        checkDirPerms()

        # Add the Database for any updates or changes needed
        databasechecks.databaseUpdates(logger)

        # Read in the JSON configuration file
        configuration = readConfiguration('/eosstracker/www/configuration/config.txt', options)

        # Print out the callsign we're using
        logger.info(f"Callsign:  {configuration['callsign']}")

        # signal handler for catching kills
        signal.signal(signal.SIGTERM, signal_handler)


        #######################################################
        ############# these next few items are shared objects amongst sub-processes

        # This is the common event that when set, will cause all the sub-processes to gracefully end
        stopevent = mp.Event()
        
        # Add the stopevent to the our configuration
        configuration["stopevent"] = stopevent

        # add the logging queue to the configuration sent to sub-processes so their log messages are routed back here
        configuration["loggingqueue"] = loggingqueue

        #######################################################
        #######################################################


        # this holds the list of sub-processes and threads that we want to start/run
        processes = []

        # Set JSON inital status data
        status = {}
        status["active"] = True
        ts = datetime.datetime.now()
        status["starttime"] = ts.strftime("%Y-%m-%d %H:%M:%S")
        status["timezone"] = str(configuration["timezone"])
        status["gpshost"] = configuration["gpshost"]

        # Create all of the sub-processes
        processes = createProcesses(configuration)

        # Loop through each process starting it (unless it's already been started)
        for p in processes:
            if not p.is_alive():
                logger.info(f"Starting process for {p.name}")
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
        logger.debug(f"############### MAIN ##############  Caught keyboard interrupt, setting stop event")

        # The KeyboardInterrupt event "should" be caught by all of the individual threads/processes
        stopevent.set()

        # now end the processes (if they're not already shutdown)
        endProcesses(processes)

    except (GracefulExit, SystemExit) as msg: 
        # Set this event to be as graceful as we can for shutdown...
        logger.warning(f"Signaling to the application that it's time to shutdown.")

        # set the stop event so that other processes will stop
        stopevent.set()

        # now end the processes (if they're not already shutdown)
        endProcesses(processes)

    # stop the logging listener as all the sub-processes are not stopped
    loglistener.stop()

    # Save the operating mode and status to a JSON file...as basically empty as we're now shutting down
    jsonStatusFile = "/eosstracker/www/daemonstatus.json"
    jsonStatusTempFile = "/eosstracker/www/daemonstatus.json.tmp"
    status = {}
    status["active"] = False
    status["gpshost"] = configuration["gpshost"]
    status["timezone"] = str(configuration["timezone"])

    with open(jsonStatusTempFile, "w") as f:
        f.write(json.dumps(status))
    if os.path.isfile(jsonStatusTempFile):
        os.rename(jsonStatusTempFile, jsonStatusFile)

    logger.info("Done.")

if __name__ == '__main__':
    main()
