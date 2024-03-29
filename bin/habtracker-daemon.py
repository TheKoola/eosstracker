#!/usr/bin/python

##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, Jeff Deaton (N6BA)
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

from gnuradio import analog
from gnuradio import blocks
from gnuradio import eng_notation
from gnuradio import filter
from gnuradio import gr
from gnuradio.eng_option import eng_option
from gnuradio.filter import firdes
from optparse import OptionParser
import multiprocessing as mp
import subprocess as sb
import os
import math
import osmosdr
import time
import datetime 
import psycopg2 as pg
import aprslib
import logging
import usb.core
import usb.util
import threading as th
import sys
import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import *
from scipy.interpolate import *
from scipy.optimize import *
import signal
import psutil
import json
import random

#import local configuration items
import habconfig 
import landingpredictor as lp
import gpspoller
import aprsis
import infocmd

class GracefulExit(Exception):
    pass

def signal_handler(signum, frame):
    print "Caught SIGTERM..."
    raise GracefulExit()


##################################################
# aprs_receiver class:
#    This is the process that listens on various frequencies
##################################################
class aprs_receiver(gr.top_block):
    def __init__(self, freqlist=[(144390000, 12000)], rtl=0):
        gr.top_block.__init__(self, "APRS Receiver for Multiple Frequencies")

        ##################################################
        # Parameters
        ##################################################
        self.Frequencies = freqlist
        self.direwolf_audio_rate = 48000
        self.rtl_id = "rtl=" + str(rtl)

        ##################################################
        # Variables
        ##################################################
        self.mtusize = 9000
        self.samp_rate = self.direwolf_audio_rate * 42
        self.transition_width = 1000
        self.lowpass_freq = 5500
        self.decimation = self.samp_rate / (self.direwolf_audio_rate)
        self.scale = 14336
        self.quadrate = self.samp_rate / self.decimation
        self.max_deviation = 3300
        self.lowpass_filter_0 = firdes.low_pass(20, self.samp_rate, self.lowpass_freq, self.transition_width, firdes.WIN_HANN, 6.76)
        self.center_freq = 145000000

        ##################################################
        # Blocks
        ##################################################
        self.osmosdr_source_0 = osmosdr.source( args="numchan=" + str(1) + " " + self.rtl_id )
        self.osmosdr_source_0.set_sample_rate(self.samp_rate)
        self.osmosdr_source_0.set_center_freq(self.center_freq, 0)
        self.osmosdr_source_0.set_freq_corr(0, 0)
        self.osmosdr_source_0.set_dc_offset_mode(2, 0)
        self.osmosdr_source_0.set_iq_balance_mode(0, 0)
        self.osmosdr_source_0.set_gain_mode(True, 0)
        self.osmosdr_source_0.set_gain(40, 0)
        self.osmosdr_source_0.set_if_gain(20, 0)
        self.osmosdr_source_0.set_bb_gain(20, 0)
        self.osmosdr_source_0.set_antenna('', 0)
        self.osmosdr_source_0.set_bandwidth(0, 0)
 
        for freq,port in self.Frequencies:
            #print "   channel:  [%d] %dMHz" % (port, freq)
            #print "   quadrate:  %d" % (self.quadrate)
            freq_xlating_fir_filter = filter.freq_xlating_fir_filter_ccf(self.decimation, (self.lowpass_filter_0), freq-self.center_freq, self.samp_rate)
            blocks_udp_sink = blocks.udp_sink(gr.sizeof_short*1, '127.0.0.1', port, self.mtusize, True)
            blocks_float_to_short = blocks.float_to_short(1, self.scale)
            analog_nbfm_rx = analog.nbfm_rx(
        	audio_rate=self.direwolf_audio_rate,
        	quad_rate=self.quadrate,
        	tau=75e-6,
        	max_dev=self.max_deviation,
            )

            ##################################################
            # Connections
            ##################################################
            self.connect((analog_nbfm_rx, 0), (blocks_float_to_short, 0))
            self.connect((blocks_float_to_short, 0), (blocks_udp_sink, 0))
            self.connect((freq_xlating_fir_filter, 0), (analog_nbfm_rx, 0))
            self.connect((self.osmosdr_source_0, 0), (freq_xlating_fir_filter, 0))



##################################################
# GRProcess:
#    - Then starts up an instance of the aprs_receiver class 
##################################################
def GRProcess(flist=[(144390000, 12000)], rtl=0, e = None):
    try:
  
        #print "GR [%d], listening on: " % rtl, flist
 
        # create an instance of the aprs receiver class
        tb = aprs_receiver(freqlist=flist, rtl=rtl)

        # call its "run" method...this blocks until done
        tb.start()
        e.wait()
        print "Stopping GnuRadio..."
        tb.stop()
        print "GnuRadio ended"

    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        tb.stop()
        print "GnuRadio ended"



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
        #print("aprsFilter1: %s\n" % aprsFilter)


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
 
        print("Using this filter for APRS-IS uplink: %s\n" % aprsFilter)
        sys.stdout.flush()

        # Return the resulting APRS-IS filter string
        return aprsFilter

    except pg.DatabaseError as error:
        pgCursor.close()
        pgConnection.close()
        print "Database error:  ", error
    except (StopIteration, GracefulExit, KeyboardInterrupt, SystemExit): 
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
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        tap.close()
        print "Tap ended: ", aprsserver


##################################################
# Get the number of RTL-SDR dongles that are attached via USB
##################################################
def getNumberOfSDRs():
    i = 0
    sdrs = []
    devices = usb.core.find(idVendor=0x0bda, idProduct=0x2838, find_all=True)
    if devices is None:
        return 0
    else:
        for dev in devices:
            m = usb.util.get_string(dev, dev.iManufacturer)
            p = usb.util.get_string(dev, dev.iProduct)
            s = usb.util.get_string(dev, dev.iSerialNumber)
            rtl = { "rtl" : i, "manufacturer" : m, "product" : p, "serialnumber" : s }

            # Check if the RTLSDR is using a serial number string that contains "adsb".  
            #     The idea being, not to use any SDR attached that is to be used for ADS-B reception instead.
            if "adsb" in s.lower():
                print "Skipping SDR: ", rtl
            else:
                sdrs.append(rtl)

            i = i+1
        #print json.dumps(sdrs)
        return sdrs
        #return i


##################################################
# This creates the configuration file for Direwolf
##################################################
def createDirewolfConfig(callsign, l, configdata, dbsupport = False):

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
            freqmapstring = "";
           
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
                    
                    # this string is used for the dbsupport capability (if enabled) below
                    freqmapstring = freqmapstring + " " + str(rtl) + " " + str(channel) + " " + str(freq)

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

            # Database connection parameters
            if dbsupport:
                f.write("\n### Database connection parameters if running custom direwolf\n")
                f.write("INSTANCE 0\n");
                f.write("PGUSER " + str(habconfig.dbUser) + "\n");
                f.write("PGPASSWORD " + str(habconfig.dbPassword) + "\n");
                f.write("PGDBNAME " + str(habconfig.dbName) + "\n");
                f.write("FREQMAP " + freqmapstring + "\n");

            f.close()
        return filename

    except (GracefulExit, KeyboardInterrupt, SystemExit):
        f.close()
        return ""
    except IOError, error: 
        print "Unable to create direwolf configuration file.\n %s" % error
        return ""


##################################################
# Run direwolf
##################################################
def direwolf(e, callsign, freqlist, config):
    # Location of the direwolf binary
    df_binary = "/usr/local/bin/direwolf"

    # The location of the direwolf log file
    logfile = "/eosstracker/logs/direwolf.out"

    # The command string and arguments for running direwolf.  This is will get assigned values below.
    df_command = []

    # Direwolf command to test for "-Q" functionality
    df_test_Q = [df_binary, "-Q", "-U" ]


    # Run direwolf to test for support of the -Q parameter
    try:
        # Run the direwolf command, but we redirect output to /dev/null because we only care about the return code
        devnull = open(os.devnull, "w")
        p = sb.Popen(df_test_Q, stdout=devnull, stderr=sb.STDOUT)
        
        # Wait for it to finish and grab the return code.
        r = p.wait()

        # Make sure devnull is closed
        devnull.close()

        # If the return code is zero, then we can continue on using the custom filter on the Uplink connection.  If not zero, then
        # there was an error with the aprsc configuration file syntax, presumably because of our custom filter on the uplink port.
        if r != 0:
            print "INFO:  direwolf doesn't support the -Q paramter, running without"
            sys.stdout.flush()

            # (re)create the direwolf configuration file without database support
            configfile = createDirewolfConfig(callsign, freqlist, config)

            # The command string and arguments for running direwolf without the -Q parameter
            df_command = [df_binary, "-t", "0", "-T", "%D %T", "-c", configfile]
            
        else:
            print "INFO:  direwolf seems to support the -Q parameter"
            sys.stdout.flush()

            # (re)create the direwolf configuration file with database support
            configfile = createDirewolfConfig(callsign, freqlist, config, True)

            # The command string and arguments for running direwolf without the -Q parameter
            df_command = [df_binary, "-t", "0", "-T", "%D %T", "-Q", "-c", configfile]


        # The direwolf process should NOT be running, but if it is, we need to kill it.
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"

    # Now run direwolf for real...
    try:
        # We open the logfile first, for writing
        l = open(logfile, "w")

        # Run the direwolf command
        p = sb.Popen(df_command, stdout=l, stderr=l)

        # Wait for it to finish
        e.wait()

        # Direwolf should not be running, but if it is, we need to kill it
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"

        # Close the log file
        l.close()

    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"

        # Close the log file
        l.close()


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
    except (GracefulExit, KeyboardInterrupt, SystemExit):
        return -1
    except IOError, error: 
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
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
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
        
        # Wait for it to finish
        r = p.wait()

        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        if p.poll() is None:
            print "aprsc is still running..."
            killem = ["sudo", "pkill", "aprsc"]
            print "killing aprsc..."
            sb.Popen(killem)
            print "Waiting for aprsc to end..."
            p.wait()
            print "aprsc ended"


##################################################
# argument_parser function...This will parse through any command line options given and return the options
##################################################
def argument_parser():
    description = 'Backend daemon for the HAB Tracker application'
    parser = OptionParser(usage="%prog: [options]", option_class=eng_option, description=description)
    parser.add_option(
        "", "--callsign", dest="callsign", type="string", default='E0SS',
        help="Provide your callsign (this is optional) [default=%default]")
    parser.add_option(
        "", "--aprsisRadius", dest="aprsisRadius", type="intx", default=50,
        help="Set the radius (in kilometers) for filtering packets from APRS-IS [default=%default]")
    parser.add_option(
        "", "--algoInterval", dest="algoInterval", type="intx", default=10,
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
        print(error)


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
            if perms & 0777 != 0777:
                try:
                    print "Setting permissions to 777 on:", thedir 
                    os.chmod(thedir, 0777)
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

    for the_key, the_value in defaultkeys.iteritems():
        if the_key not in configuration:
            configuration[the_key] = the_value

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

        # Get the RTL-SDR USB dongles that are attached
        sdrs = getNumberOfSDRs()

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
        aprscprocess = mp.Process(target=aprsc, args=(configuration, stopevent))
        aprscprocess.daemon = True
        aprscprocess.name = "aprc"
        processes.append(aprscprocess) 

        status = {}
        antennas = []

        # If USB SDR dongles are attached, then we're going to start in RF mode and start GnuRadio and Direwolf processes
        if i > 0:
            # For each SDR dongle found, start a separate GnuRadio listening process
            total_freqs = 0
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
                    total_freqs += 1
                antennas.append(ant) 

                # append this frequency/UDP port list to the list for Direwolf
                direwolfFreqList.append(freqlist)

                # This is the GnuRadio process
                grprocess = mp.Process(target=GRProcess, args=(freqlist, int(k["rtl"]), stopevent))
                grprocess.daemon = True
                grprocess.name = "GnuRadio_" + str(k["rtl"])
                processes.append(grprocess)


            status["direwolfcallsign"] = str(configuration["callsign"]) + "-" + str(configuration["ssid"])

            # The direwolf process
            dfprocess = mp.Process(target=direwolf, args=(stopevent, str(configuration["callsign"]) + "-" +  str(configuration["ssid"]), direwolfFreqList, configuration))
            dfprocess.daemon = True
            dfprocess.name = "Direwolf"
            processes.append(dfprocess)


            print "objectbeaconing: ", configuration["objectbeaconing"]
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
        aprstap = mp.Process(name="APRS-IS Tap", target=tapProcess, args=(configuration, "127.0.0.1", "aprs", options.aprsisRadius, stopevent))
        aprstap.daemon = True
        aprstap.name = "APRS-IS Tap"
        processes.append(aprstap)

        # This is the CWOP connection tap.  This is the process that is responsible for inserting CWOP packets into the database
        cwoptap = mp.Process(name="CWOP Tap", target=tapProcess, args=(configuration, "cwop.aprs.net", "cwop", 200, stopevent))
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

    except (GracefulExit, SystemExit): 
        # Set this event to be as graceful as we can for shutdown...
        print "Setting stop event..."

        stopevent.set()
        # For catching a kill signal, we need to tell the individual processes to terminate
        for p in processes:
            print "Waiting for [%s] %s to end..." % (p.pid, p.name)
            p.terminate()
            p.join()

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
