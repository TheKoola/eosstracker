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
import psutil
import os
import sys

##################################################
# This creates the configuration file for Direwolf
##################################################
def createDirewolfConfig(callsign, l, configdata, gpsposition):

    # Name of the direwolf configuration file
    filename = "/eosstracker/etc/direwolf.conf"

    try:

        # Create or overwrite the direwolf configuration file.  We don't care if we overwrite it as the configuration is created dynamically each time.
        with open(filename, "w") as f:
            f.write("###\n")
            f.write("# " + filename + "\n")
            f.write("#\n")
            f.write("# RTL numbers referred to in this file do not coorelate to those returned by rtl_eeprom.\n")
            f.write("#\n\n\n")
            rtl = 0
            adevice = 0
            channel = 0

            # Loop through the frequency/port lists creating the audio device sections
            for freqlist in l:
                f.write("################## RTL:  " + str(rtl) + " ################\n")
                for freq, port in freqlist:
                    # This is the audio device section for this RTL, frequency, and port combination
                    f.write("# RTL: " + str(rtl) + "   Frequency: " + str(round(freq/1000000.0, 3)) + "MHz\n")
                    f.write("ADEVICE" + str(adevice) + " udp:" + str(port) + " null\n")
                    f.write("ARATE 48000\n")
                    f.write("ACHANNELS 1\n")
                    f.write("CHANNEL " + str(channel) + "\n")
                    f.write("MYCALL " + callsign + "\n")
                    f.write("MODEM 1200\n")
                    f.write("FIX_BITS 0\n\n")

                    channel = channel + 2
                    adevice = adevice + 1

                f.write("###########################################\n\n")
                rtl = rtl + 1

            if configdata["includeeoss"] == "true" and configdata["eoss_string"] != "":
                eoss = str(configdata["eoss_string"]) + ","
            else:
                eoss=""

            if configdata["overlay"] != "":
                overlay = " overlay=" + str(configdata["overlay"])
            else:
                overlay = ""

            f.write("GPSD\n\n")

            # Are we connected to an external radio?  And are we wanting to beacon our position over RF?
            if configdata["beaconing"] == "true":
                f.write("###########################################\n\n")
                f.write("# This is the external radio connection\n")
                f.write("ADEVICE" + str(adevice) + " plughw:" + str(configdata["audiodev"]) + ",0\n")
                f.write("ARATE 48000\n")
                f.write("ACHANNELS 1\n")
                f.write("CHANNEL " + str(channel) + "\n")
                f.write("MYCALL " + callsign + "\n")
                f.write("MODEM 1200\n")
                if configdata["serialport"] != "none":
                    f.write("PTT " + str(configdata["serialport"]) + " " + str(configdata["serialproto"]) + "\n")
                f.write("\n\n")
                f.write("######### beaconing configuration #########\n")

                # If this is a mobile station, then we want to turn on "smart" beaconing.
                viapath = ""
                if configdata["mobilestation"] == "true":
                    viapath = " via=" + str(eoss) + "WIDE1-1,WIDE2-1"
                    f.write("# This is for a mobile station\n")
                    f.write("TBEACON sendto=" + str(channel) + " delay=0:30 every=" + str(configdata["beaconlimit"]) + "  altitude=1 " + viapath + " symbol=" + str(configdata["symbol"]) + overlay + "    comment=\"" + str(configdata["comment"]) +  "\"\n")
                    f.write("SMARTBEACONING " + str(configdata["fastspeed"]) + " " + str(configdata["fastrate"]) + "      " + str(configdata["slowspeed"]) + " " + str(configdata["slowrate"]) + "     " + str(configdata["beaconlimit"]) + "     " + str(configdata["fastturn"]) + " " + str(configdata["slowturn"]) + "\n")
                
                # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                else:
                    # Only beacon our position if there is a valid GPS location
                    viapath = " via=" + str(eoss) + "WIDE2-1"
                    if gpsposition["isvalid"]:
                        f.write("# This is for a fixed station\n")
                        f.write("PBEACON sendto=" + str(channel) + " delay=0:30 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " via=" + str(eoss) + "WIDE2-1  symbol=" + str(configdata["symbol"]) + overlay + " comment=\"" + str(configdata["comment"] + "\"\n"))

                if configdata["igating"] == "true":
                    f.write("IBEACON sendto=" + str(channel) + str(viapath) + " delay=0:40 every=" + str(configdata["ibeaconrate"]) + "\n")
                f.write("###########################################\n\n")


            #### Only if we're igating... 
            if configdata["igating"] == "true":
                password = configdata["passcode"]
                f.write("# APRS-IS Info\n")
                #f.write("IGSERVER noam.aprs2.net\n")
                f.write("IGSERVER 127.0.0.1\n")
                f.write("IGLOGIN " + callsign + " " + str(password) + "\n\n")
                #password = aprslib.passcode(str(callsign))

                # If this station is beaconing directly to APRS-IS...then that can only happen if we have a IGSERVER defined (just above).
                if configdata["ibeacon"] == "true":
                    f.write("########## for internet beaconing #########\n");

                    # If this is a mobile station, then we want to turn on "smart" beaconing.
                    if configdata["mobilestation"] == "true":
                        f.write("# This is for a mobile station\n")
                        f.write("TBEACON sendto=IG  delay=0:40 every=" + str(configdata["ibeaconrate"]) + "  altitude=1  symbol=" + str(configdata["symbol"]) + overlay + "    comment=\"" + str(configdata["comment"]) +  "\"\n")

                    # Otherwise, this is a fixed station so we just use the last alt/lat/lon as where this station is located at.
                    else:
                        # Only beacon our position if there is a valid GPS location
                        if gpsposition["isvalid"]:
                            f.write("# This is for a fixed station\n")
                            f.write("PBEACON sendto=IG delay=0:40 every=11:00 altitude=" + str(gpsposition["altitude"]) + " lat=" + str(gpsposition["latitude"]) + " long=" + str(gpsposition["longitude"]) + " symbol=" + str(configdata["symbol"]) + overlay + " comment=\"" + str(configdata["comment"] + "\"\n"))

                    if configdata["igating"] == "true":
                        f.write("IBEACON sendto=IG  delay=0:50 every=" + str(configdata["ibeaconrate"]) + "\n")

                    f.write("###########################################\n\n")


            # The rest of the direwolf configuration
            f.write("AGWPORT 8000\n")
            f.write("KISSPORT 8001\n")

            f.close()
        return filename

    except (KeyboardInterrupt, SystemExit):
        f.close()
        return ""
    except IOError as error:
        print "Unable to create direwolf configuration file.\n %s" % error
        return ""
            


##################################################
# Run direwolf
##################################################
def direwolf(e, callsign, freqlist, config, position):
    # Location of the direwolf binary
    df_binary = "/usr/local/bin/direwolf"

    # The location of the direwolf log file
    logfile = "/eosstracker/logs/direwolf.out"

    # (re)create the direwolf configuration file without database support
    configfile = createDirewolfConfig(callsign, freqlist, config, position)

    # The command string and arguments for running direwolf.
    df_command = [df_binary, "-t", "0", "-T", "%D %T", "-c", configfile]

    # The direwolf process
    p = None

    # Now run direwolf...
    # This is a loop because we want to restart direwolf if it is killed or fails.
    while not e.is_set():
        try:

            # We open the logfile first, for writing
            l = open(logfile, "w")

            # Run the direwolf command
            print "Starting direwolf."
            sys.stdout.flush()
            p = sb.Popen(df_command, stdout=l, stderr=l)

            # Wait for it to finish
            while p.poll() is None and not e.is_set():
                #print "Waiting for direwolf to end..."
                e.wait(1)

            # Direwolf should not be running, but if it is, we need to kill it
            if p.poll() is None:
                print "Terminating direwolf..."
                p.terminate()
                print "Waiting for direwolf to end.."
                p.wait()
                print "Direwolf ended"

            # Close the log file
            l.close()

        except (KeyboardInterrupt, SystemExit):
            if p.poll() is None:
                print "Terminating direwolf..."
                p.terminate()
                print "Waiting for direwolf to end.."
                p.wait()
                print "Direwolf ended"


            # Close the log file
            l.close()
            
            # exit out of this loop
            break

    print "Direwolf process has finished."



##################################################
# check if the direwolf process is running
##################################################
def isDirewolfRunning():

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
