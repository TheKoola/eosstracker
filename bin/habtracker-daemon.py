#!/usr/bin/python3

##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, 2021 Jeff Deaton (N6BA)
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
import aprslib
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
from inspect import getframeinfo, stack

#import local configuration items
import habconfig 
import landingpredictor as lp
import searchrtlsdr
import aprsreceiver
import gpspoller
import databasechecks
import databasewriter
import subprocesses
import connectors
import queries


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
    procs = ["direwolf", myprocname]

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

    # This is the GPS position tracker process
    logger.debug(f"Creating GPS Position Trackersubprocess")
    gpsprocess = mp.Process(name="GPS Position Tracker", target=gpspoller.runGPSPoller, args=(configuration,))
    gpsprocess.daemon = True
    procs.append(gpsprocess)

    # This is the database writer process.  It's job is to insert incoming packets into the database
    logger.debug(f"Creating Database Writer subprocess")
    dbwriter = mp.Process(name="Database Writer", target=databasewriter.runDatabaseWriter, args=(configuration,))
    dbwriter.daemon = True
    procs.append(dbwriter)

    # This is the landing predictor process
    logger.debug(f"Creating Landing Predictor subprocess")
    landingprocess = mp.Process(name="Landing Predictor", target=lp.runLandingPredictor, args=(configuration,))
    landingprocess.daemon = True
    procs.append(landingprocess)

    # Start the aprsc sub process
    logger.debug(f"Creating Aprsc subprocess")
    aprscprocess = mp.Process(name="Aprsc", target=subprocesses.runSubprocess, args=(configuration, 'aprsc'))
    aprscprocess.daemon = True
    procs.append(aprscprocess)

    # This is the APRS-IS connection tap, it will connect to the aprsc process we start above.
    logger.debug(f"Creating APRS-IS Tap subprocess")
    aprstap = mp.Process(name="APRS-IS Tap", target=connectors.connectorTap, args=(configuration, "aprs"))
    aprstap.daemon = True
    procs.append(aprstap)

    # This is the CWOP connection tap.  
    logger.debug(f"Creating CWOP Tap subprocess")
    cwoptap = mp.Process(name="CWOP Tap", target=connectors.connectorTap, args=(configuration, "cwop"))
    cwoptap.daemon = True
    procs.append(cwoptap)

    # This is the GnuRadio aprsreceiver process(es)
    freqlist = configuration["direwolffreqlist"]
    if len(freqlist) > 0:

        # Max number of SDR channels we can listen to while staying at or under the max limit for direwolf
        # We subtract channels from this amount as we loop through the SDR devices.
        # 
        # The approach here is to 'waterfall' the available channels across the SDR devices discovered as usable.  We setup (i.e. a gnuradio process) all 
        # frequencies on the first SDR, if there are any remaining channels we can still use, we're under the max direwolf limit, they get spun up
        # in a 2nd gnuradio process.  ...and so on until we run out of direwolf channels to use (aka the max channels number is reached).  This will undoubtedly
        # mean that the first SDR discovered will [usually] be the most heavily used with all/most frequencies being listened too.  It might make sense in the future
        # to change this so that we try to spread the frequencies more evenly across multiple SDRs (or do an even/odd alloctaion).
        num_channels = configuration["maxdirewolfchannels"] + (-1 if configuration["beaconing"] else 0)

        # each 'flist' represents an individual SDR device and it's list of frequencies we're wanting it to listen too
        for flist in freqlist:

            logger.debug(f"{num_channels=}, {flist}")

            # if the number of frequencies is greater than the number of channels we've got available for direwolf, then adjust
            if num_channels <= 0:
                logger.debug(f"reached maximum channels for gnuradio processes.  Remaining channels: {num_channels}")

                # we've used up all available channels that we can use with direwolf.  No use in spinning up any more gnuradio processes.
                break

            # if the number of frequencies is > than the number of direwolf channels we have available, then limit that to the first 'num_channels' amount.
            elif len(flist) > num_channels:
                sdr = flist[0:num_channels]
                logger.debug(f"limiting number of channels for {sdr}.  {num_channels=}")

            # otherwise, we just add all of the frequencies to the list we want to listen too.
            else:
                sdr = flist
                logger.debug(f"adding all channels for {sdr}")

            # subtract this list of channels from the total we're going to have direwolf listen too
            num_channels -= len(sdr)

            # Get the first element of this list, so we can grab the SDR prefix, serial number, and index number
            # Example: [144390000, 12010, 'rtl', 'some_string', 1]
            elem = sdr[0]
            sdrprefix = elem[2]
            sdrserialno = elem[3]
            sdrindex = elem[4]

            logger.debug(f"Creating GnuRadio Receiver subprocess for SDR: {sdrprefix=} {sdrserialno=} {sdrindex=}")
            aprs = mp.Process(name="GnuRadio Receiver", target=aprsreceiver.GRProcess, args=(configuration, sdr, sdrprefix, sdrserialno, sdrindex))
            aprs.daemon = True
            procs.append(aprs)


        # The direwolf process
        logger.debug(f"Creating Direwolf subprocess")
        dfprocess = mp.Process(name="Direwolf", target=subprocesses.runSubprocess, args=(configuration, 'direwolf'))
        dfprocess.daemon = True
        procs.append(dfprocess)

        # The direwolf tap process 
        logger.debug(f"Creating Direwolf Tap subprocess")
        dftapprocess = mp.Process(name="Direwolf KISS Tap", target=connectors.connectorTap, args=(configuration, "dwkiss"))
        dftapprocess.daemon = True
        dftapprocess.name = "Direwolf KISS Tap"
        procs.append(dftapprocess)


    # if we're igating, then create a process to update a JSON file with igating statistics.  
    # Might expand on this idea in the future with a "stats" or "telemetry" process that publishes data about the backend.
    #igating = (True if configuration["igating"] == "true" else False) if "igating" in configuration else False
    #if igating:

        # The telemetry process
    #    logger.debug(f"Creating Telemetry subprocess")
    #    tmprocess = mp.Process(name="Telemetry", target=telemetry, args=(configuration,))
    #    tmprocess.daemon = True
    #    procs.append(tmprocess)



    ####### NO #######
    # This is the RTP Multicast connection tap.  
    #rtp = mp.Process(name="RTP Multicast Tap", target=connectors.connectorTap, args=(configuration, "rtp"))
    #rtp.daemon = True
    #procs.append(rtp)
    ####### NO #######


    # Return the list of newly created processes
    return procs


##################################################
# This is the telemetry process.  It will loop, periodically publishing stats about the backend processes to a JSON file
##################################################
def telemetry(config)->None:

    # Sanity check
    if config is None:
        return None

    # name of this process
    name = "Telemetry:"

    # make sure we're igating
    igating = (True if config["igating"] == "true" else False) if "igating" in config else False

    # get the stop event
    stopevent = config["stopevent"] if "stopevent" in config else None

    # get the logging queue
    loggingqueue = config["loggingqueue"] if "loggingqueue" in config else None

    # setup logging
    telemlogger = logging.getLogger(f"{__name__}.Telemetry")
    telemlogger.setLevel(logging.INFO)
    telemlogger.propagate = False

    # check if a logging queue was supplied
    if loggingqueue is not None:
        handler = QueueHandler(loggingqueue)
        telemlogger.addHandler(handler)

    telemlogger.debug(f"{name} process started")

    # where we store the telemetry we want to publish
    jsonFile = "/eosstracker/www/igatestats.json"
    jsonTempFile = "/eosstracker/www/igatestats.json.tmp"

    # Get the igate stats dictionary
    igatestats = config["igatestatistics"] if "igatestatistics" in config else None
    
    try:
        
        # Loop counter
        i = 0

        # Loop continuously looking to publish telemetry
        while not stopevent.is_set():

            # handle igating statistics
            if igatestats:

                # make sure the object exists
                if "igated_stations" in igatestats:

                    # ...and that there is a valid dictionary therein...
                    stats = igatestats["igated_stations"]
                    if stats:


                        ##### need a better way to do this instead of just dumping to a JSON file.  Seems poorly thought out.  However, 
                        ##### at the moment it will do. 

                        # sort the stats dictionary by value in reverse order.
                        #sorted_stats = sorted(stats.items(), key=lambda x: x[1], reverse=True)
                        sorted_stats = { x: v for x, v in sorted(stats.items(), key=lambda x: x[1], reverse=True)}

                        telemlogger.debug(f"{name} Igate statistics: {sorted_stats=}")

                        # open the JSON temp file and write our telemetry to it
                        with open(jsonTempFile, "w") as f:
                            f.write(json.dumps(sorted_stats))

                        # Now move the temp file in place over the real one.
                        if os.path.isfile(jsonTempFile):
                            os.rename(jsonTempFile, jsonFile)

                        # every 60th time through the loop we write an info message to system logging
                        if not i % 60:
                            topstations = {A:N for (A,N) in [ k for k in sorted_stats.items()][:3]}
                            #topstations = sorted_stats[:3]
                            telemlogger.info(f"{name} Total igated packets: {sum(stats.values())}, top stations {topstations}")

            # wait a few seconds before getting igate stats again
            stopevent.wait(5)

            # increment our loop counter
            i += 1

    except (KeyboardInterrupt, SystemExit):
        telemlogger.info(f"process interrupted.  Now ending.")
    finally:
        telemlogger.info(f"process finished.")




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

    aprslogger = logging.getLogger("aprslib")
    aprslogger.addHandler(ch)
    aprslogger.addHandler(logfile)
    aprslogger.setLevel(logging.WARNING)

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
        logger.info(f"Waiting for [{p.pid}] {p.name} to end...")

        # Join the process, waiting for it to end, but only wait a few seconds
        p.join(10)

        # check if the process is still alive.  If so, then we need to attempt to terminate it (maybe its hung?)
        if p.exitcode == None:
            logger.info(f"Terminating process, [{p.pid}] {p.name}...")
            p.terminate()


    # Loop through the processes once more, if anything is still running then we need to SIGKILL it
    for p in processes:

        # wait a few seconds for the process to end.
        p.join(5)

        # if the process still hasn't terminated, then we SIGKILL it
        if p.exitcode == None:

            logger.info(f"Sending SIGKILL to process, [{p.pid}] {p.name}...")
            p.kill()

    return True



##################################################
# Wrapper function that opens a database connection, then calls the getFrequencies function to query the
# backend database for the list of frequencies we should be listening too.
##################################################
def getFreqList():

    # get the logger
    logger = logging.getLogger(__name__)

    # list of frequencies
    freqs = None

    try:
        # Database connection 
        dbconn = None
        dbconn = pg.connect (habconfig.dbConnectionString)
        dbconn.set_session(autocommit=True)

        freqs = queries.getFrequencies(dbconn, logger)
        logger.debug(f"frequency list: {freqs}")

        dbconn.close()

    except pg.DatabaseError as error:
        # If there was a connection error
        dbconn.close()
        logger.error(f"Database error: {error}")

    return freqs


##################################################
# get the list of frequencies that gnuradio will listen too...and subsequently the UDP ports that direwolf will listen too
# then construct the freq map that direwolf will use.
##################################################
def buildFreqMap(config):

        # get the logger
        logger = logging.getLogger(__name__)

        # A list of frequency lists (i.e. a list of lists) for creating the direwolf configuration file
        direwolfFreqList = []

        # The direwolf channel-to-frequency mapping
        freqmap = []

        # Get the RTL-SDR USB dongles that are attached
        sdrs = searchrtlsdr.getUSBDevices()

        # The number of SDRs
        i = len(sdrs)
 
        print(("Number of usable SDRs: ", i))
        logger.info(f"Number of usable SDRs: {i}")

        #  Online-only mode:  
        #      - we do start aprsc, but only have it connect as "read-only" to APRS-IS (regardless if we want to igate or not)
        #      - we do not start GnuRadio processes
        #      - we do not start Direwolf
        #   
        #  RF mode: 
        #      - we do start aprsc, and connect in "read-only" mode (unless we want to igate packets to the internet)
        #      - we do start GnuRadio processes
        #      - we do start Direwolf and have it connect to the aprsc instance via "localhost" 

        direwolfstatus = {}
        antennas = []

        # If USB SDR dongles are attached, then we're going to start in RF mode and start GnuRadio and Direwolf processes
        if i > 0:

            # Get the frequencies to be listened to (ex. 144.39, 144.34, etc.) and UDP port numbers for xmitting the audio over
            freqs = getFreqList()

            # For each SDR dongle found, start a separate GnuRadio listening process
            total_freqs = 0
            chan = 0
            loop_iter = 0
            for k in sdrs:

                logger.info(f"Using SDR: {k}")
                direwolfstatus["rf_mode"] = 1
                
                # Append this frequency list to our list for later json output
                ant = {}
                ant["rtl_id"] = k["rtl"]
                ant["prefix"] = k["prefix"]
                ant["frequencies"] = []
                ant["rtl_serialnumber"] = k["serialnumber"]
                ant["rtl_manufacturer"] = k["manufacturer"]
                ant["rtl_product"] = k["product"]

                # Create frequency/udpport list that gnuradio and direwolf will use.
                udpport = 12000 + loop_iter * 10
                freqlist = []
                for freq in freqs:
                    ant["frequencies"].append({"frequency": round(freq/1000000.0, 3), "udp_port": udpport})
                    freqlist.append([freq, udpport, k["prefix"], k["serialnumber"], k["rtl"]])
                    freqmap.append([chan, freq])
                    chan += 2
                    total_freqs += 1
                    udpport += 1
                antennas.append(ant) 

                # append this frequency/UDP port list to the list for Direwolf
                direwolfFreqList.append(freqlist)

                # The IP destination for where the GnuRadio UDP network block is to send its audio packets too.  This is hard coded to be the loopback address (for now).
                ip_dest = "127.0.0.1"

                loop_iter += 1


            # The direwolf audio sample rate.  This is hardcoded for now to be 50000 as it makes the math easier for the Resampler blocks within the GnuRadio receiver.
            # This primaryly comes into play with airspy dongles as they have a fixed sample rate that is a nice multiple of 50000.
            samplerate = 50000

            ssid = int(config["ssid"]) if "ssid" in config else 0
            if ssid <= 0:
                ssid = None

            direwolfstatus["direwolfcallsign"] = str(config["callsign"]) + ("-" + str(ssid) if ssid else "")
            logger.info(f"direwolfcallsign: {direwolfstatus['direwolfcallsign']}, ssid: {ssid}")
            direwolfstatus["direwolffreqlist"] = direwolfFreqList
            direwolfstatus["direwolffreqmap"] = freqmap
            direwolfstatus["direwolfaudiorate"] = samplerate

            # Get our our current position
            #myposition = getGPSPosition()

            # The direwolf process
            #dfprocess = mp.Process(target=direwolf.direwolf, args=(stopevent, str(configuration["callsign"]) + "-" +  str(configuration["ssid"]), direwolfFreqList, configuration, myposition))
            #dfprocess.daemon = True
            #dfprocess.name = "Direwolf"
            #processes.append(dfprocess)

            # The direwolf tap process 
            #dftapprocess = mp.Process(target=kisstap.runKissTap, args=(5, stopevent, configuration, freqmap))
            #dftapprocess.daemon = True
            #dftapprocess.name = "Direwolf Tap"
            #processes.append(dftapprocess)


            direwolfstatus["xmit_channel"] = None
            if config["beaconing"] == "true":

                direwolfstatus["xmit_channel"] = total_freqs * 2

                # The beaconing process (this is different from the position beacons that direwolf will transmit)
                #print("Starting object beaconing process...")

                #icprocess = mp.Process(target=infocmd.runInfoCmd, args=(120, stopevent, configuration))
                #icprocess.daemon = True
                #icprocess.name = "Object beaconing"
                #processes.append(icprocess)

        else:
            direwolfstatus["direwolfcallsign"] = ""
            direwolfstatus["direwolffreqlist"] = []
           
        direwolfstatus["antennas"] = antennas 

        return direwolfstatus


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

        # incoming packet queue for database writes.  All sub-processes that ingest packets place packets in this queue.
        configuration["databasequeue"] = mp.Queue(maxsize = 0)

        # for all packets that we're intending to igate. sub-processes will add packets for igating consideration to this queue
        configuration["igatingqueue"] = mp.Queue(maxsize = 0)

        # add the logging queue to the configuration sent to sub-processes so their log messages are routed back here
        configuration["loggingqueue"] = loggingqueue

        # a central, shared location for disimenating latest information from a variety of processes
        # this is our multi-process manager object (for handling shared dictionaries)
        manager = mp.Manager()

        # if the manager creation was successful
        if manager:

            # create a dictionary for storing our position information (gpspoller updates it).  Other processes read this to get latest position details
            configuration["position"] = manager.dict()

            # Create a list of landing locations for active flights.  this is a list of tuples (i.e. coordinates) for all active flights.  Updated by the 
            # landing predictor process.  
            configuration["landinglocations"] = manager.dict()

            # Create a list of all beacon callsigns on active flights.  This is a list of beacon callsigns updated by the landing predictor process.
            configuration["activebeacons"] = manager.dict()

            # Create an object where we store igating statistics.  This is a dictionary with keys representing a station's callsign.  Values are number of packets igated.
            configuration["igatestatistics"] = manager.dict()

        else:

            # if we couldn't create a manager object then we set the "position" key to None
            configuration["position"] = None


        #######################################################
        #######################################################


        # where to store our output JSON status information (the web-based frontend reads this to know if the backend is running or not)
        status = {}
        antennas = []

        # this holds the list of sub-processes and threads that we want to start/run
        processes = []

        # Set JSON inital status data
        status["rf_mode"] = 0
        status["direwolfcallsign"] = ""
        status["antennas"] = []
        status["igating"] = configuration["igating"]
        status["beaconing"] = configuration["beaconing"]
        status["active"] = 1
        ts = datetime.datetime.now()
        status["starttime"] = ts.strftime("%Y-%m-%d %H:%M:%S")
        status["timezone"] = str(configuration["timezone"])

        # get the frequency, udp mapping (from backend database of active flights) and set various objects.
        direwolfstatus = buildFreqMap(configuration)
        configuration["direwolffreqlist"] = direwolfstatus["direwolffreqlist"] if "direwolffreqlist" in direwolfstatus else []
        configuration["direwolffreqmap"] = direwolfstatus["direwolffreqmap"] if "direwolffreqmap" in direwolfstatus else None
        configuration["xmit_channel"] = direwolfstatus["xmit_channel"] if "xmit_channel" in direwolfstatus else None
        configuration["direwolfcallsign"] = direwolfstatus["direwolfcallsign"] if "direwolfcallsign" in direwolfstatus else None
        configuration["direwolfaudiorate"] = direwolfstatus["direwolfaudiorate"] if "direwolfaudiorate" in direwolfstatus else None
        configuration["maxdirewolfchannels"] = 8
        status["direwolfcallsign"] = direwolfstatus["direwolfcallsign"]
        status["rf_mode"] = 1 if status["direwolfcallsign"] else 0
        status["antennas"] = direwolfstatus["antennas"]

        # if direwolf doesn't have anything to listen to (i.e. we didn't find any SDRs attached) then we definitely can't be igating.
        if len(configuration["direwolffreqlist"]) == 0:
            configuration["igating"] = "false"

        # we want to connect to for aprs-is connectivity
        #configuration["aprsisserver"] = "noam.aprs2.net"
        configuration["aprsisserver"] = "127.0.0.1"

        # where the direwolf instance is running
        configuration["direwolfserver"] = "127.0.0.1"

        # Create all of the sub-processes
        processes = createProcesses(configuration)

        # Loop through each process starting it
        for p in processes:
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
    status["antennas"] = []
    status["rf_mode"] = 0
    status["active"] = 0
    with open(jsonStatusTempFile, "w") as f:
        f.write(json.dumps(status))
    if os.path.isfile(jsonStatusTempFile):
        os.rename(jsonStatusTempFile, jsonStatusFile)

    logger.info("Done.")

if __name__ == '__main__':
    main()
