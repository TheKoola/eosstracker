##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, 2020, 2021  Jeff Deaton (N6BA)
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
from dataclasses import dataclass
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
# class to encapculate the direwolf sub-process (sortof)
##################################################
@dataclass
class Direwolf:
    """
    This will look to start direwolf to listen to a variety of UDP network ports and optionally to an external radio via an audio interface.
    * listen to a number of UDP ports for incoming aprs packets (each UDP connection represents a differnet frequency that the gnuradio frontend is listening too)
    * listen to an external radio (via an audio device)
    * beacon our position every so often (or use smartbeaconing if this is a mobile station)
    * igating is performed (if configured to do so...typically to the aprsc instance listening to 127.0.0.1)
    * no digipeating is performed
    * the KISS port is using the default 8001 port.
        + The kisstap.py module will listen to packets that direwolf has heard over the external radio via the KISS port
        + ..And those packets will be igated if they pass igating criteria (seperate process)
    """

    # The direwolf configuration file
    config_file: str = "/eosstracker/etc/direwolf.conf"

    # the logging queue
    loggingqueue: mp.Queue = None

    # the configuration dictionary
    configuration: dict = None

    # Location of the direwolf binary
    df_binary: str = "/usr/local/bin/direwolf"

    # The location of the direwolf log file
    df_logfile: str = "/eosstracker/logs/direwolf.out"


    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.configuration["loggingqueue"] is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.configuration["loggingqueue"])
            self.logger.addHandler(handler)

        # check if there is an ssid given
        self.ssid = self.configuration["ssid"] if "ssid" in self.configuration else 0

        # the callsign of the user running this
        self.callsign = self.configuration["callsign"] + ("-" + str(self.ssid) if self.ssid > 0 else "")

        # does the configuration indicate we're RF beaconing?
        self.beaconing = True if self.configuration["beaconing"] == "true" else False

        # the Event object that the main program will signal us with, that we should stop running
        self.stopevent = self.configuration["stopevent"]

        # the direwolf process
        self.p = None

        # The igating filter string for when using 145.825MHz.  We only want to igate packets heard on 145.815MHz if they were digipeated prior ___or___
        # they were from one of the satellites themselves
        self.satfilter = " IG d/* | b/PSAT*/USNAP*/RS0ISS*/ARISS*/NA1ISS*/DP0ISS*"

        # The default keys for the configuration data
        self.defaultkeys = {
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

        # default sample rate in case it's not supplied
        self.samplerate = int(self.configuration["samplerate"]) if "samplerate" in self.configuration else 50000

        self.logger.debug("Created a direwolf instance")


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

                self.logger.info(f"Waiting on GPS fix: {trycount}s")


        # if we still don't have a GPS fix, then we query the database for our last known location
        if nofix == True:

            self.logger.info("Unable to acqure 3D fix from GPS, querying database for last known location")

            # connect to the database
            dbconn = queries.connectToDatabase(dbstring = habconfig.dbConnectionString, logger = self.logger)

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
    def createDirewolfConfig(self)->bool:

        # If we're not beaconing over RF, then there's no reason to build a direwolf configuration file as we won't start the direwolf process
        #if self.beaconing == False:
        #    return False

        # if this is a fixed location station, then we need to determine our location.  Without it we can't continue.
        if self.configuration["mobilestation"] == "false":

            # get our current location
            gpsposition = self.getPosition()

            # if we're unable to get GPS coordinates for a fixed station then we can't run direwolf
            if gpsposition["isvalid"] == False:
                self.logger.error("Unable to run Direwolf.  Could not obtain station location.")
                return False

            self.logger.info(f"Station location (meters and decimal degrees): {gpsposition}")

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
                        if freq == 145825000 and self.configuration["igating"] == True:
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
                if self.configuration["beaconing"] == "true":

                    self.logger.info(f"Direwolf configured for beaconing using {channel=} and {self.callsign=}")

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
                        self.logger.info(f"Setting direwolf to use the serial port, {self.configuration['serialport']}, and protocol, {self.configuration['serialproto']}, for external radio connectivity")
                        f.write("PTT " + str(self.configuration["serialport"]) + " " + str(self.configuration["serialproto"]) + "\n")
                    f.write("\n\n")


                    f.write("######### beaconing configuration #########\n")

                    viapath = ""

                    # If this is a mobile station, then we want to turn on "smart" beaconing.
                    if self.configuration["mobilestation"] == "true":

                        self.logger.info(f"Configuring direwolf for a mobile station")

                        # If we're using AIRSS then we assuming the external radio is transmitting on 145.825MHz and we alter our path to only add WIDE2-1.
                        if str(self.configuration["eoss_string"]) == "ARISS":
                            viapath = " via=" + str(eoss) + "WIDE2-1"
                        else:
                            viapath = " via=" + str(eoss) + "WIDE1-1,WIDE2-1"

                        self.logger.debug(f"VIA path: {viapath}")

                        # Direwolf directives to specify the type of beaconing 
                        f.write("# This is for a mobile station\n")
                        f.write("TBEACON sendto=" + str(channel) + " delay=0:30 every=" + str(self.configuration["beaconlimit"]) + "  altitude=1 " + viapath + " symbol=" + str(self.configuration["symbol"]) + overlay + "    comment=\"" + str(self.configuration["comment"]) +  "\"\n")
                        f.write("SMARTBEACONING " + str(self.configuration["fastspeed"]) + " " + str(self.configuration["fastrate"]) + "      " + str(self.configuration["slowspeed"]) + " " + str(self.configuration["slowrate"]) + "     " + str(self.configuration["beaconlimit"]) + "     " + str(self.configuration["fastturn"]) + " " + str(self.configuration["slowturn"]) + "\n")
                    

                    else:
                        # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                        self.logger.info(f"Configuring direwolf for a fixed station")

                        # Only beacon our position if there is a valid GPS location
                        viapath = " via=" + str(eoss) + "WIDE2-1"

                        self.logger.debug(f"VIA path: {viapath}")

                        if gpsposition["isvalid"] == True:
                            f.write("# This is for a fixed station\n")
                            f.write("PBEACON sendto=" + str(channel) + " delay=0:30 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " via=" + str(eoss) + "WIDE2-1  symbol=" + str(self.configuration["symbol"]) + overlay + " comment=\"" + str(self.configuration["comment"] + "\"\n"))

                    f.write("###########################################\n\n")


                    #### Only if we're igating... 
                    if self.configuration["igating"] == "true":
                        self.logger.info(f"Direolf configured to igate to 127.0.0.1")

                        password = self.configuration["passcode"]
                        f.write("# APRS-IS Info\n")
                        #f.write("IGSERVER noam.aprs2.net\n")
                        f.write("IGSERVER 127.0.0.1\n")
                        f.write("IGLOGIN " + self.callsign + " " + str(password) + "\n\n")
                        #password = aprslib.passcode(str(callsign))

                        # If this station is beaconing directly to APRS-IS...then that can only happen if we have a IGSERVER defined (just above).
                        if self.configuration["ibeacon"] == "true":

                            self.logger.info(f"Direwolf configured to use internet beaconing")

                            f.write("########## for internet beaconing #########\n");

                            # If this is a mobile station, then we want to turn on "smart" beaconing.
                            if self.configuration["mobilestation"] == "true":
                                f.write("# This is for a mobile station\n")
                                f.write("TBEACON sendto=IG  delay=0:40 every=" + str(self.configuration["ibeaconrate"]) + "  altitude=1  symbol=" + str(self.configuration["symbol"]) + overlay + "    comment=\"" + str(self.configuration["comment"]) +  "\"\n")

                            # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                            else:
                                # Only beacon our position if there is a valid GPS location
                                if gpsposition["isvalid"]:
                                    f.write("# This is for a fixed station\n")
                                    f.write("PBEACON sendto=IG delay=0:40 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " symbol=" + str(self.configuration["symbol"]) + overlay + " comment=\"" + str(self.configuration["comment"] + "\"\n"))

                            if self.configuration["igating"] == "true":
                                f.write("IBEACON sendto=IG  delay=0:50 every=" + str(self.configuration["ibeaconrate"]) + "\n")

                            f.write("###########################################\n\n")

                # We're assuming that there's a GPS attached to this system
                f.write("GPSD\n\n")

                # The rest of the direwolf configuration
                f.write("AGWPORT 8000\n")
                f.write("KISSPORT 8001\n")
                
                # close the file
                f.close()

            return True

        except IOError as error:
            self.logger.error(f"Unable to create direwolf configuration file: {error}")
            return False
                

    ##################################################
    # terminate a process 
    ##################################################
    def stop(self, process = None)->bool:

        # sanity check
        if process is None and self.p is None:
            return False

        # if we were called without a pid, the use our own
        if process is None:
            process = self.p
        
        # Check if this direwolf process is running
        if process.poll() is None:

            self.logger.info(f"Terminating direwolf sub-process, {process.pid}.")

            # try to terminate it with a SIGTERM
            process.terminate()

            # now wait for the direwolf process to end
            try:

                self.logger.info(f"Waiting for direwolf sub-process, {process.pid}, to end..")

                # wait a few seconds for the process to end
                process.wait(6)

            except (sb.TimeoutExpired):

                # direwolf didn't end so we now send a SIGKILL signal instead
                self.logger.info(f"Killing direwolf process {process.pid}...")
                process.kill()

        # return the process state
        return process.poll()



    ##################################################
    # run.  This will block while direwolf is running
    ##################################################
    def run(self)->bool:

        # sanity checks
        if self.isRunning() == True:
            self.logger.error("Unable to run Direwolf as it's already running.") 
            return False

        # sanity checks
        #if self.beaconing == False:
        #    self.logger.info("Beaconing is disabled, not running Direwolf.")
        #    return False

        # (re)create the direwolf configuration file without database support
        ret = self.createDirewolfConfig()

        # if there was an error creating the configuration file, the we must return
        if ret is not True:
            self.logger.error("Error creating the Direwolf configuration file.")
            return False

        # The command string and arguments for running direwolf.
        df_command = [self.df_binary, "-t", "0", "-T", "%D %T", "-c", self.config_file]

        # The direwolf process
        p = None

        # Now run direwolf...
        # This is a loop because we want to restart direwolf if it is killed (by some external means) or fails.
        while not self.stopevent.is_set():
            #try:

            # We open the logfile first, for writing
            l = open(self.df_logfile, "w")

            # the direwolf subprocess
            self.p = sb.Popen(df_command, stdout=l, stderr=l)

            self.logger.info(f"Direwolf sub-process started pid: {self.p.pid}")

            # Wait for direwolf to finish
            while self.p.poll() is None and not self.stopevent.is_set():
                self.stopevent.wait(1)

            # Check if the Direwolf process is still running, if it is, then kill it
            self.stop(self.p)
            self.logger.info(f"Direwolf sub-process, {self.p.pid}, ended")

            # Close the direwolf log file
            l.close()

            #except (KeyboardInterrupt, SystemExit, GracefulExit) as e:

                # Check if the Direwolf is running, if it is, then kill it
            #    self.stop(self.p)
            #    self.logger.info(f"Direwolf sub-process, {self.p.pid}, ended")

                # Close the direwolf log file
            #    l.close()

                # exit out of this loop because we're ending
            #    break

        self.logger.info("Direwolf sub-process has finished.")

        return True



    ##################################################
    # check if the direwolf process is running.  Return the PID of the direwolf process or -1 if not running
    ##################################################
    def isRunning(self):

        # Iterate over all running processes
        pid = -1
        for proc in psutil.process_iter():
           # Get process detail as dictionary
           try:
               pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent', 'cmdline' ])
           except (psutil.NoSuchProcess, psutil.AccessDenied):
               pass
           else:
               if "direwolf" in pInfoDict["name"].lower() or "direwolf" in pInfoDict["cmdline"]:
                   pid = pInfoDict["pid"]

        return pid


##################################################
# runDirewolf
##################################################
def runDirewolf(config):

    # signal handler for catching kills
    signal.signal(signal.SIGTERM, local_signal_handler)

    try:

        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logging.INFO)

        # Create a new direwolf object
        logger.info("Starting direwolf")
        k = Direwolf(configuration = config)

        logger.debug(f"Direwolf: {k}")
        logger.debug("Running Direwolf.run()...")

        # this will block until the process ends
        k.run()

    except (KeyboardInterrupt, SystemExit, GracefulExit): 
        logger.info("Stopping direwolf")
        k.stop()

    finally:
        logger.info("Direwolf ended.")

