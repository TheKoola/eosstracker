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

##################################################
# This creates the configuration file for Direwolf
##################################################
def createDirewolfConfig(callsign, l, configdata):

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
            if configdata["beaconing"] == "true":
                f.write("###########################################\n\n")
                f.write("# This is for beaconing our position\n")
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
                f.write("TBEACON sendto=" + str(channel) + " delay=0:30 every=" + str(configdata["beaconlimit"]) + "  altitude=1    via=" + str(eoss) + "WIDE1-1,WIDE2-1  symbol=" + str(configdata["symbol"]) + overlay + "    comment=\"" + str(configdata["comment"]) +  "\"\n")
                f.write("SMARTBEACONING " + str(configdata["fastspeed"]) + " " + str(configdata["fastrate"]) + "      " + str(configdata["slowspeed"]) + " " + str(configdata["slowrate"]) + "     " + str(configdata["beaconlimit"]) + "     " + str(configdata["fastturn"]) + " " + str(configdata["slowturn"]) + "\n")
                f.write("###########################################\n\n")

            if configdata["igating"] == "true" and configdata["ibeacon"] == "true":
                f.write("########## for internet beaconing #########\n");
                f.write("TBEACON sendto=IG  delay=0:40 every=" + str(configdata["ibeaconrate"]) + "  altitude=1  symbol=" + str(configdata["symbol"]) + overlay + "    comment=\"" + str(configdata["comment"]) +  "\"\n")
                f.write("IBEACON sendto=IG  delay=0:40 every=" + str(configdata["ibeaconrate"]) + "\n")
                #if configdata["beaconing"] == "false":
                #    f.write("SMARTBEACONING " + str(configdata["fastspeed"]) + " " + str(configdata["fastrate"]) + "      " + str(configdata["slowspeed"]) + " " + str(configdata["slowrate"]) + "     " + str(configdata["beaconlimit"]) + "     " + str(configdata["fastturn"]) + " " + str(configdata["slowturn"]) + "\n")
                f.write("###########################################\n\n")


            # The rest of the direwolf configuration
            # We're using the localhost address because that's where aprsc is running
            f.write("# APRS-IS Info\n")
            f.write("IGSERVER 127.0.0.1\n")

            # Login info for aprsc
            # If igating is enabled, then the user has supplied their own callsign-ssid along with APRS-IS passcode for use as the APRS-IS login name that direwolf uses.
            # Note that this APRS-IS login name is different than the callsign-ssid that is tagged as having "igated" a packet.  That is defined above with the MYCALL parameter.
            if configdata["igating"] == "true":
                password = configdata["passcode"]
            else:
                # Okay, we're not igating, so we need to generate a passcode for this callsign.
                password = aprslib.passcode(str(callsign))

            f.write("IGLOGIN " + callsign + " " + str(password) + "\n\n")

            # The rest of the direwolf configuration
            f.write("AGWPORT 8000\n")
            f.write("KISSPORT 8001\n")

            f.close()
        return filename

    except (KeyboardInterrupt, SystemExit):
        f.close()
        return ""
    except IOError as error:
        print("Unable to create direwolf configuration file.\n %s" % error)
        return ""
            


##################################################
# Run direwolf
##################################################
def direwolf(e, callsign, freqlist, config):
    # Location of the direwolf binary
    df_binary = "/usr/local/bin/direwolf"

    # The location of the direwolf log file
    logfile = "/eosstracker/logs/direwolf.out"

    # (re)create the direwolf configuration file without database support
    configfile = createDirewolfConfig(callsign, freqlist, config)

    # The command string and arguments for running direwolf.
    df_command = [df_binary, "-t", "0", "-T", "%D %T", "-c", configfile]

    # Now run direwolf...
    try:
        # We open the logfile first, for writing
        l = open(logfile, "w")

        # Run the direwolf command
        p = sb.Popen(df_command, stdout=l, stderr=l)

        # Wait for it to finish
        e.wait()

        # Direwolf should not be running, but if it is, we need to kill it
        if p.poll() is None:
            print("Terminating direwolf...")
            p.terminate()
            print("Waiting for direwolf to end..")
            p.wait()
            print("Direwolf ended")

        # Close the log file
        l.close()

    except (KeyboardInterrupt, SystemExit):
        if p.poll() is None:
            print("Terminating direwolf...")
            p.terminate()
            print("Waiting for direwolf to end..")
            p.wait()
            print("Direwolf ended")

        # Close the log file
        l.close()


