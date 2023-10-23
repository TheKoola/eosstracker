##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2023  Jeff Deaton (N6BA)
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
import psutil
import os
import sys
import random
import aprslib
import numpy as np
from dataclasses import dataclass, field
import logging
from logging.handlers import QueueHandler

# local imports
import psycopg2 as pg
import queries
import habconfig


class GracefulExit(Exception):
    pass

##################################################
# signal handler for SIGTERM
##################################################
def local_signal_handler(signum, frame):
    pid = os.getpid()
    caller = getframeinfo(stack()[1][0])
    logger = logging.getLogger(__name__)
    logger.warning(f"Caught SIGTERM signal. {pid=}")
    raise GracefulExit()


##################################################
# base class for encapculating various sub-processes like direwolf, aprsc, etc.
##################################################
@dataclass
class SubProcess:

    # The configuration file
    config_file: str = None

    # the logging queue
    loggingqueue: mp.Queue = None

    # the configuration dictionary
    configuration: dict = field(default_factory=dict)

    # Location of the sub-process binary
    binary: str = None

    # The location of the sub-process log file
    logfile: str = None

    # The name of this sub-process
    name: str = "no name"

    # Sub-process arguments.  This should be a list
    arguments: list = field(default_factory=list)



    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:

        # setup logging
        self.setupLogging()

        # check if there is an ssid given
        self.ssid = self.configuration["ssid"] if "ssid" in self.configuration else 0

        # the callsign of the user running this
        self.callsign = self.configuration["callsign"] + ("-" + str(self.ssid) if self.ssid > 0 else "")

        # does the configuration indicate we're RF beaconing?
        self.beaconing = True if self.configuration["beaconing"] == "true" else False

        # does the configuration indicate we're RF beaconing?
        self.igating = True if self.configuration["igating"] == "true" else False

        # the Event object that the main program will signal us with, that we should stop running
        self.stopevent = self.configuration["stopevent"]

        # the sub-process process itself
        self.p = None

        self.logger.debug(f"{self.name}: Created a sub-process instance")

    #####################################
    # setup logging
    #####################################
    def setupLogging(self)->None:

        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.configuration["loggingqueue"] is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.configuration["loggingqueue"])
            self.logger.addHandler(handler)

    ##################################################
    # acquire the location of this station (i.e. GPS coords)
    ##################################################
    def getPosition(self)->dict:

        # default position object
        gpsposition = {
                "altitude" : 0.0,
                "latitude" : 0.0,
                "longitude" : 0.0,
                "isvalid" : False
                }

        # Wait for a little while (up to 30 seconds) to try and get our GPS location from the GPS Poller process
        nofix = True
        trycount = 0
        while nofix == True and trycount < 30:
            
            # This retreives the latest GPS data (assuming GPS Poller process is running)
            g = self.configuration["position"]

            if "gpsdata" in g: 
                position = g["gpsdata"]

                if "mode"  in position:
                    mode = int(position["mode"])

                    if mode == 3:
                        
                        # we've got a 3D position fix!!
                        nofix = False
                        gpsposition["altitude"] = round(float(position["altitude"]) * .3048,2)  # convert to meters
                        gpsposition["latitude"] = round(float(position["lat"]),8)
                        gpsposition["longitude"] = round(float(position["lon"]),8)
                        gpsposition["isvalid"] = True

            if nofix == True:
                # we're still waiting on the GPS to obtain a fix so we wait for 1 second
                self.stopevent.wait(1)

                # increment our try counter
                trycount += 1

                self.logger.info(f"{self.name}: Waiting on GPS fix: {trycount}s")


        # if we still don't have a GPS fix, then we query the database for our last known location
        if nofix == True:

            self.logger.info(f"{self.name}: Unable to acqure 3D fix from GPS, querying database for last known location")

            # connect to the database
            dbconn = queries.connectToDatabase(db_connection_string = habconfig.dbConnectionString, logger = self.logger)

            # if the connection was successful, then call the GPS position function
            if dbconn is not None:

                # query the database for our last known location
                gpsposition = queries.getGPSPosition(dbconn = dbconn, logger = self.logger)

                # close the database connection
                dbconn.close()

        # return the gpsposition object
        return gpsposition

    ##################################################
    # This creates the configuration file for Direwolf
    ##################################################
    def createConfig(self)->bool:
        return False


    ##################################################
    # terminate the sub-process and completely shutdown
    ##################################################
    def stop(self, process: int = None)->bool:

        # set the stop event so the run loop will terminate
        #self.logger.debug(f"{self.name}: setting stop event")
        #self.stopevent.set()

        # call _kill, just in case
        return self._kill()


    ##################################################
    # kill the sub-process
    ##################################################
    def _kill(self, process: int = None)->bool:

        # sanity check
        if process is None and self.p is None:
            return False

        # if we were called without a pid, the use our own
        if process is None:
            process = self.p
        
        # Check if this sub-process is running
        if process.poll() is None:

            self.logger.info(f"{self.name}: Terminating {self.name} sub-process, {process.pid}.")

            # try to terminate it with a SIGTERM
            process.terminate()

            # now wait for the sub-process to end
            try:

                self.logger.info(f"{self.name}: Waiting for {self.name} sub-process, {process.pid}, to end..")

                # wait a few seconds for the process to end
                process.wait(6)

            except (sb.TimeoutExpired):

                # sub-process didn't end so we now send a SIGKILL signal instead
                self.logger.info(f"{self.name}: Killing {self.name} process {process.pid}...")
                process.kill()

        # return the process state
        return process.poll()


    ##################################################
    # run.  wrapper for the runProcess function
    ##################################################
    def run(self)->int:
        return self._runProcess()


    ##################################################
    # _runProcess.  This will block while the sub-process is running
    ##################################################
    def _runProcess(self, restart: bool = True)->int:

        # sanity checks
        if self.isRunning() == True:
            self.logger.error(f"{self.name}: Unable to run {self.name} as it's already running.") 
            return -9999

        # (re)create the sub-process configuration file
        ret = self.createConfig()

        # if there was an error creating the configuration file, the we must return
        if ret is not True:
            self.logger.error(f"{self.name}: Error creating the {self.name} configuration file.")
            return -9999

        try:
            # This is a loop because we want to restart the sub-process if it is killed (by some external means) or fails.
            while not self.stopevent.is_set():
                #try:

                # We open the logfile first, for writing
                l = open(self.logfile, "w")

                self.logger.debug(f"{self.name}: starting process with command: {self.command}")
                # the subprocess
                self.p = sb.Popen(self.command, stdout=l, stderr=l)

                self.logger.info(f"{self.name}: sub-process started pid: {self.p.pid}")

                # Wait for the sub-process to finish
                while self.p.poll() is None and not self.stopevent.is_set():
                    self.stopevent.wait(1)

                # Check if the sub-process is still running, if it is, then kill it
                self._kill(self.p)
                self.logger.info(f"{self.name}: sub-process, {self.p.pid}, ended")

                # Close the log file
                l.close()

                # if we're not being asked to restart the process then we exit
                if not restart:
                    break
        except (GracefulExit, KeyboardInterrupt, SystemExit) as e:
            self.logger.debug(f"{self.name}: caught keyboardinterrupt, {e}")
            self.stopevent.set()
            self.stop()

        finally:
            self.logger.info(f"{self.name}: sub-process has finished with retcode: {self.p.returncode}.")

        return self.p.returncode


    ##################################################
    # check if the sub-process is running.  Return the PID of the sub-process or -1 if not running
    ##################################################
    def isRunning(self)->int:

        # Iterate over all running processes
        pid = -1
        for proc in psutil.process_iter():
           # Get process detail as dictionary
           try:
               pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent', 'cmdline' ])
           except (psutil.NoSuchProcess, psutil.AccessDenied):
               pass
           else:
               if self.name in pInfoDict["name"].lower() or self.name in pInfoDict["cmdline"]:
                   pid = pInfoDict["pid"]

        return pid


    @property
    def command(self)->str:
        return [self.binary] + self.arguments + [self.config_file]

    def setArguments(self, args: list = None)->list:
        if args:
            self.arguments = args
        return self.arguments

    def setBinary(self, binary: str = None)->str:
        if binary:
            self.binary = binary
        return self.binary

    def setLogfile(self, logfile: str = None)->str:
        if logfile:
            self.logfile = logfile
        return self.logfile

    def setConfig_file(self, configfile: str = None)->str:
        if configfile:
            self.config_file = configfile
        return self.config_file

    def setName(self, name: str = None)->str:
        if name:
            self.name = name
        return self.name


##################################################
# direwolf sub-process
##################################################
@dataclass
class Direwolf(SubProcess):
    """
    This will look to start direwolf to listen to a variety of UDP network ports and optionally to an external radio via an audio interface.
    * listen to a number of UDP ports for incoming aprs packets (each UDP connection represents a differnet frequency that the gnuradio frontend is listening too)
    * listen to an external radio (via an audio device)
    * beacon our position every so often (or use smartbeaconing if this is a mobile station)
    * no digipeating is performed
    * no connections to an APRS-IS server (local or otherwise)
    * the KISS port is using the default 8001 port.
        + The connectors.py module will listen to packets that direwolf has heard over the external radio via the KISS port
    """

    # The igating filter string for when using 145.825MHz.  We only want to igate packets heard on 145.815MHz if they were digipeated prior ___or___
    # they were from one of the satellites themselves
    satfilter: str = " IG d/* | b/PSAT*/USNAP*/RS0ISS*/ARISS*/NA1ISS*/DP0ISS*"

    # default sample rate in case it's not supplied
    samplerate: int = 50000


    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:
        super().__post_init__()

        # Name of this process 
        self.setName('direwolf')
        
        # The default command string and arguments for running direwolf.
        self.setArguments(args = ["-t", "0", "-T", "%D %T", "-c"])

        # Default for the direwolf configuration file
        if not self.config_file:
            self.setConfig_file("/eosstracker/etc/direwolf.conf")

        # Default location of the direwolf binary
        if not self.binary:
            self.setBinary("/usr/local/bin/direwolf")

        # Default location of the direwolf output file
        if not self.logfile:
            self.setLogfile("/eosstracker/logs/direwolf.out")

        # check if the sample rate was included in the configuration
        self.samplerate = int(self.configuration["samplerate"]) if "samplerate" in self.configuration else self.samplerate

        # the maximum number of channels that direwolf can support
        self.maxchannels = (int(self.configuration["maxdirewolfchannels"]) if "maxdirewolfchannels" in self.configuration else 8) + (-1 if self.beaconing else 0)
        self.logger.debug(f"{self.name}: direwolf limited to a max channel count of {self.maxchannels}")


    ##################################################
    # This creates the configuration file for Direwolf
    ##################################################
    def createConfig(self)->bool:

        # if this is a fixed location station, then we need to determine our location.  Without it we can't continue.
        if self.configuration["mobilestation"] == "false":

            # get our current location
            gpsposition = self.getPosition()

            # if we're unable to get GPS coordinates for then we can't run direwolf
            if gpsposition["isvalid"] == False:
                self.logger.error(f"{self.name}: Unable to run Direwolf.  Could not obtain station location.")
                return False

            self.logger.info(f"{self.name}: Station location (meters and decimal degrees): {gpsposition}")

        try:

            # Create or overwrite the direwolf configuration file.  We don't care if we overwrite it as the configuration is created dynamically each time.
            with open(self.config_file, "w") as f:

                # write some preamble to the file
                f.write("###\n")
                f.write("# " + self.config_file + "\n")
                f.write("#\n\n\n")

                # these are the default direwolf audio and channel device numbers
                adevice = 0
                channel = 0

                # Loop through the frequency/port lists creating the audio device sections
                for freqlist in self.configuration["direwolffreqlist"]:

                    f.write("###########################################\n")
                    for freq, port, prefix, sn, idx in freqlist:

                        if adevice >= self.maxchannels:
                            self.logger.debug(f"{self.name}: max audio device channels reached with direwolf configuration build. {freq=} {port=} {prefix=} {sn=} {idx=}")
                            break

                         # This is the audio device section for this RTL, frequency, and port combination
                        f.write("# SDR Device: " + prefix + " (s/n: " + sn + ")  Frequency: " + str(round(freq/1000000.0, 3)) + "MHz\n")
                        f.write("ADEVICE" + str(adevice) + " udp:" + str(port) + " null\n")

                        # Audio sample rate
                        f.write("ARATE " + str(self.samplerate) + "\n")

                        f.write("ACHANNELS 1\n")
                        f.write("CHANNEL " + str(channel) + "\n")
                        f.write("MYCALL " + self.callsign + "\n")
                        f.write("MODEM 1200\n")
                        f.write("FIX_BITS 1\n\n")

                        # If listening to the satellite frequency and igating, then only igate if we heard the packet through a digipeater.
                        # For satellite ops we don't want to igate packets heard directly.
                        # Note:  buddy list filter is clearly a work in progress...
                        if freq == 145825000 and self.igating == True:
                            f.write("FILTER " + str(channel) + self.satfilter + "\n")

                        # Add this channel to the channel-to-frequency mapping
                        #freqmap.append({ "channel" : channel, "frequency" : freq, "sdr" : prefix + sn })

                        channel = channel + 2
                        adevice = adevice + 1

                    f.write("###########################################\n\n")

                # when beaconing the user can include the EOSSn string within their VIA path for transmitted packets.  The EOSS payloads will digipeat any 
                # packet that has this string in its VIA path.
                if self.configuration["includeeoss"] == "true" and self.configuration["eoss_string"] != "":
                    eoss = str(self.configuration["eoss_string"]) + ","
                else:
                    eoss=""

                # if the symbol for this station includes an overlay
                if self.configuration["overlay"] != "":
                    overlay = " overlay=" + str(self.configuration["overlay"])
                else:
                    overlay = ""

                # Only if we're beaconing...
                if self.beaconing == True:

                    self.logger.info(f"{self.name}: Direwolf configured for beaconing using {channel=} and {self.callsign=}")

                    f.write("###########################################\n\n")
                    f.write("# This is the external radio connection\n")
                    f.write("ADEVICE" + str(adevice) + " plughw:" + str(self.configuration["audiodev"]) + ",0\n")
                    f.write("ARATE 44100\n")
                    f.write("ACHANNELS 1\n")
                    f.write("CHANNEL " + str(channel) + "\n")
                    f.write("MYCALL " + self.callsign + "\n")
                    f.write("MODEM 1200\n")

                    # Specify the serial port for PTT control (if applicable)
                    if self.configuration["serialport"] != "none":
                        self.logger.info(f"{self.name}: Setting direwolf to use the serial port, {self.configuration['serialport']}, and protocol, {self.configuration['serialproto']}, for external radio connectivity")
                        f.write("PTT " + str(self.configuration["serialport"]) + " " + str(self.configuration["serialproto"]) + "\n")
                    f.write("\n\n")


                    f.write("######### RF beaconing configuration #########\n")

                    viapath = ""

                    # If this is a mobile station, then we want to turn on "smart" beaconing.
                    if self.configuration["mobilestation"] == "true":

                        self.logger.info(f"{self.name}: Configuring direwolf for a mobile station")

                        # If we're using AIRSS then we assuming the external radio is transmitting on 145.825MHz and we alter our path to only add WIDE2-1.
                        if str(self.configuration["eoss_string"]) == "ARISS":
                            viapath = " via=" + str(eoss) + "WIDE2-1"
                        else:
                            viapath = " via=" + str(eoss) + "WIDE1-1,WIDE2-1"

                        self.logger.debug(f"{self.name}: VIA path: {viapath}")

                        # Direwolf directives to specify the type of beaconing 
                        f.write("# This is for a mobile station\n")
                        f.write("TBEACON sendto=" + str(channel) + " delay=0:30 every=" + str(self.configuration["beaconlimit"]) + "  altitude=1 " + viapath + " symbol=" + str(self.configuration["symbol"]) + overlay + "    comment=\"" + str(self.configuration["comment"]) +  "\"\n")
                        f.write("SMARTBEACONING " + str(self.configuration["fastspeed"]) + " " + str(self.configuration["fastrate"]) + "      " + str(self.configuration["slowspeed"]) + " " + str(self.configuration["slowrate"]) + "     " + str(self.configuration["beaconlimit"]) + "     " + str(self.configuration["fastturn"]) + " " + str(self.configuration["slowturn"]) + "\n")
                    

                    else:
                        # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                        self.logger.info(f"{self.name}: Configuring direwolf for a fixed station")

                        # Only beacon our position if there is a valid GPS location
                        viapath = " via=" + str(eoss) + "WIDE2-1"

                        self.logger.debug(f"{self.name}: VIA path: {viapath}")

                        if gpsposition["isvalid"] == True:
                            f.write("# This is for a fixed station\n")
                            f.write("PBEACON sendto=" + str(channel) + " delay=0:30 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " via=" + str(eoss) + "WIDE2-1  symbol=" + str(self.configuration["symbol"]) + overlay + " comment=\"" + str(self.configuration["comment"] + "\"\n"))

                    f.write("###########################################\n\n")



                    #### Only if we're igating... 
                    #if self.igating == True:

                        # when using aprsc (running locally) we need direwolf to always be configured to igate.  If a packet makes it to the APRS-IS cloud (or not) is determined by the "ro" or "full" flag
                        # within the aprsc configuration file for its uplink definition to noam.aprs2.net.
                        #
                    #    self.logger.info(f"{self.name}: Direolf configured to igate to 127.0.0.1")
                    #    password = self.configuration["passcode"]
                    #    f.write("# APRS-IS Info\n")
                    #    f.write("IGSERVER 127.0.0.1\n")
                    #    f.write("IGLOGIN " + self.callsign + " " + str(password) + "\n\n")

                        # If this station is beaconing directly to APRS-IS...then that can only happen if we have a IGSERVER defined (just above)...AND...aprsc is configured to have a "full" connection type on 
                        # its uplink port definition to noam.aprs2.net.  That "full" flag is only set when igating is set to True, thus the "if self.igating" statement above.
                    #    if self.configuration["ibeacon"] == "true":

                    #        self.logger.info(f"{self.name}: Direwolf configured to use internet beaconing")

                    #        f.write("########## for internet beaconing #########\n");

                            # If this is a mobile station, then we want to turn on "smart" beaconing.
                    #        if self.configuration["mobilestation"] == "true":
                    #            f.write("# This is for a mobile station\n")
                    #            f.write("TBEACON sendto=IG  delay=0:40 every=" + str(self.configuration["ibeaconrate"]) + "  altitude=1  symbol=" + str(self.configuration["symbol"]) + overlay + "    comment=\"" + str(self.configuration["comment"]) +  "\"\n")

                            # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                    #        else:
                                # Only beacon our position if there is a valid GPS location
                    #            if gpsposition["isvalid"]:
                    #                f.write("# This is for a fixed station\n")
                    #                f.write("PBEACON sendto=IG delay=0:40 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " symbol=" + str(self.configuration["symbol"]) + overlay + " comment=\"" + str(self.configuration["comment"] + "\"\n"))

                    #        if self.igating == True:
                    #            f.write("IBEACON sendto=IG  delay=0:50 every=" + str(self.configuration["ibeaconrate"]) + "\n")

                    #        f.write("###########################################\n\n")

                    #else:
                        # we're not igating (to APRS-IS cloud), but direwolf still needs to upload packets to the local aprsc.
                        # does it really?  I don't think we need direwolf to upload to aprsc for any eosstracker purposes because the local kisstap will get packets decoded by direwolf.  However, 
                        # there might be external aprsc clients that will need a single consolidated stream.  
                        #
                        # commenting this out for now


                        # when using aprsc (running locally) we need direwolf to always be configured to igate.  If a packet makes it to the APRS-IS cloud (or not) is determined by the "ro" or "full" flag
                        # within the aprsc configuration file for its uplink definition to noam.aprs2.net.
                        #
                    #    basecallsign = self.callsign.split('-')[0]
                    #    numRandomDigits = 9 - len(basecallsign)
                    #    randomcallsign = basecallsign + str(random.randint(5, 10 ** numRandomDigits - 1)).zfill(numRandomDigits)

                    #    self.logger.info(f"{self.name}: Direolf configured to igate to 127.0.0.1 as {randomcallsign}")
                    #    password = aprslib.passcode(randomcallsign)
                    #    f.write("# APRS-IS Info\n")
                    #    f.write("IGSERVER 127.0.0.1\n")
                    #    f.write("IGLOGIN " + randomcallsign + " " + str(password) + "\n\n")


                # We're assuming that there's a GPS attached to this system
                f.write("GPSD\n\n")

                # The rest of the direwolf configuration
                f.write("AGWPORT 8000\n")
                f.write("KISSPORT 8001\n")
                
                # close the file
                f.close()

            return True

        except IOError as error:
            self.logger.error(f"{self.name}: Unable to create direwolf configuration file: {error}")
            return False
                


##################################################
# runSubprocess
##################################################
def runSubprocess(config: list = None, subtype: str = None):

    if not config:
        print("Unable to run subprocess, configuration not provided")
        return

    # signal handler for catching kills
    signal.signal(signal.SIGTERM, local_signal_handler)

    try:

        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logging.INFO)

        if not subtype:
            logger.error("Sub-process type not specified")
            return

        logger.info(f"Starting {subtype}")
        if subtype == "direwolf":
            k = Direwolf(configuration = config)
        else:
            logger.error("Sub-process type, {subtype}, not supported")
            return

        logger.debug(f"{subtype}: {k}")
        logger.debug(f"Running {subtype}.run()...")

        # this will block until the sub-process ends
        k.run()

    except (KeyboardInterrupt, SystemExit, GracefulExit) as e: 
        k.stop()

    finally:
        logger.info(f"{subtype} ended.")

