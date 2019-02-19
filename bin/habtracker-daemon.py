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
from gps import *
import time
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

#import local configuration items
import habconfig 


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
        self.lowpass_freq = 5000
        self.decimation = self.samp_rate / (self.direwolf_audio_rate)
        #self.scale = 32767
        self.scale = 10240
        self.quadrate = self.samp_rate / self.decimation
        self.max_deviation = 2500
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
# GpsPoller process
##################################################
def GpsPoller(e):
    gpsconn = None
    try: 
        gpsd = gps(mode=WATCH_ENABLE) 
        gpsconn = pg.connect (habconfig.dbConnectionString)
        gpscur = gpsconn.cursor()
        timeprev = datetime.datetime.now()
        prevlat = 0
        prevlon = 0
        #while True:
        while not e.is_set():
            report = gpsd.next() 
            thetime = datetime.datetime.now()
            timedelta = thetime - timeprev
            if timedelta.total_seconds() > 1.5 and (round(gpsd.fix.latitude,4) != prevlat or round(gpsd.fix.longitude,4) != prevlon):
                sql = """insert into 
                    gpsposition values (
                        (%s::timestamp at time zone 'UTC')::timestamp with time zone at time zone 'America/Denver', 
                        %s::numeric, 
                        %s::numeric, 
                        %s::numeric, 
                        ST_GeometryFromText('POINT(%s %s)', 4326), 
                        ST_GeometryFromText('POINTZ(%s %s %s)', 4326)
                    );"""
                if gpsd.fix.latitude != 0 and gpsd.fix.longitude != 0 and gpsd.fix.altitude >= 0:
                    gpscur.execute(sql, [
                        gpsd.utc, 
                        round(gpsd.fix.speed * 2.236936, 0), 
                        gpsd.fix.track, 
                        round(gpsd.fix.altitude * 3.2808399, 0), 
                        gpsd.fix.longitude, 
                        gpsd.fix.latitude, 
                        gpsd.fix.longitude, 
                        gpsd.fix.latitude, 
                        gpsd.fix.altitude 
                    ])
                    gpsconn.commit()
                    timeprev = thetime
                prevlat = round(gpsd.fix.latitude,4) 
                prevlon = round(gpsd.fix.longitude,4) 
        print "Shutting down GPS Loop..."
        gpsconn.close()
    except pg.DatabaseError as error:
        print(error)
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        gpsconn.close() 
        print "GPS poller ended"
    finally:
        if gpsconn is not None:
            gpsconn.close()




#####################################
# Function to use to determine distance between two points
#####################################
#def distance(lat1, lon1, lat2, lon2):
#    p = 0.017453292519943295     #Pi/180
#    a = 0.5 - cos((lat2 - lat1) * p)/2 + cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2
#    return 12742 * asin(sqrt(a)) #2*R*asin...
    
# This is the initial floor for the algorithm.  Prediction calculations are no longer performed for altitudes below this value.
# This will automatically adjust later on...to the elevation of the originating launch site for the given flight
floor = 4900

# This is the velocity value in ft/s at the floor.  That is, how fast is the balloon traveling when it hits ground level.  Or put 
# more mathmatically kindof our x-intercept.
adjust = 17
#####################################
# Functions to use for curve fitting
#####################################
def func_x2(x, a) :
    global floor
    global adjust
    return a * np.power(x - floor, 2) + adjust


def func_fittedline(x, a, b):
    # this is y = mx +b
    return a*x + b
    
        
#####################################
# Primary landing prediction function
#####################################
def landingPredictor(altitude_floor):
    global floor
    global adjust
    try:
        floor = altitude_floor
        
        # Database connection 
        landingconn = None
        landingconn = pg.connect (habconfig.dbConnectionString)
        landingcur = landingconn.cursor()
        
        # SQL for getting active flights and callsigns
        flightids_sql = """
            select distinct 
            f.flightid, 
            fm.callsign,
            l.launchsite,
            l.lat,
            l.lon,
            l.alt

            from 
            flights f, 
            flightmap fm,
            launchsites l

            where 
            fm.flightid = f.flightid 
            and l.launchsite = f.launchsite
            and f.active = 't' 

            order by 
            f.flightid, 
            fm.callsign;"""
        
        # Execute the query and get the list of flightids
        landingcur.execute(flightids_sql)
        rows = landingcur.fetchall()
        flightids = np.array(rows)
        
        descent_arrays = []
        ### Now...
        #   1.  Loop through each callsign,  flightid (from above)
        #   2.  Query the database to get all recent packets for those callsigns that makeup this flight
        #   3.  Create a curve fitting for the incoming packets
        #   4.  Loop through the prediction data for this flightid, adding up all of the lat/long deltas to get a predicted landing location
        #   5.  Insert the predicted landing location into the database. 
        
        i = 0
        while (i < len(flightids)):
        #for fid, callsign in flightids:
            # this is the flightid name
            fid = flightids[i,0]
            callsign = flightids[i,1]

            # set the floor for predictions to the elevation of the launch site
            floor = float(flightids[i,5])
            #print "Setting algorithm floor to: %.2f ft for %s:%s" % (floor, fid, callsign)

            #print "fid: %s, callsign: %s" %(fid, callsign)
            #print "fid = %s, str: %s,  type: %s" %(fid, fid[0], type(fid))
        
            # The SQL statement to get the latest packets for this flightid
            # This data is used for two purposes:  
            #    1) to get the ascent data for this flight which is used for prediction purposes
            #    2) and for getting the current packets when the balloon is descending so we can use that as the starting point for curve fitting 
            #
        #                           --date_trunc('second', a.tm)::timestamp without time zone as thetime,
            # columns:  timestamp, altitude, latitude, longitude
            latestpackets_sql = """select distinct 
                                   --date_trunc('second', a.tm)::timestamp without time zone as thetime,
                                   case
                                       when a.ptype = '/' and a.raw similar to '%%[0-9]{6}h%%' then 
                                           date_trunc('second', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone 'America/Denver')::timestamp)::timestamp without time zone
                                       else
                                           date_trunc('second', a.tm)::timestamp without time zone
                                   end as thetime,
                                   a.altitude,
                                   ST_Y(a.location2d) as lat,
                                   ST_X(a.location2d) as long
        
                                   from 
                                   packets a
        
                                   where 
                                   ST_X(a.location2d) != 0 
                                   and ST_Y(a.location2d) != 0 
                                   and a.altitude > %s
                                   and a.callsign = %s
                                   and a.tm > now()::date
        
                                   order by 
                                   thetime asc,
                                   a.altitude
                                   ; """
          
            # Execute the SQL statment and get all rows returned
            landingcur.execute(latestpackets_sql, [ floor, callsign ])
            rows = landingcur.fetchall()
        
            if len(rows) > 1:
                #print "fid: %s, callsign: %s, number of rows:  %g" %(fid, callsign, len(rows))
                ##  balloon_data contains a list of all rows (i.e. packets) received for this callsign thus far
                ##  columns:  timestamp, altitude, latitude, longitude
                # balloon_data = np.array(rows, dtype='f')
                balloon_data = np.array(rows)
                alt_prev = 0
                lat_prev = 0
                long_prev = 0
                alt_rate = 0
                lat_rate = 0
                lon_rate = 0
        
                current_packets = []
                first_packet = []
                firsttime = 0
                for row in rows:
                    thetime = row[0]
                    if firsttime == 0:
                        time_delta = thetime
                        firsttime = 1
                        first_packet = row
                    else:
                        time_delta = thetime - time_prev
                        if time_delta.total_seconds() > 0:
                            alt_rate = float(row[1] - alt_prev) / float(time_delta.total_seconds())
                            lat_rate = float(row[2] - lat_prev) / float(time_delta.total_seconds())
                            lon_rate = float(row[3] - lon_prev) / float(time_delta.total_seconds())
                            #alt_rate = float(alt_prev - row[1]) / float(time_delta.total_seconds())
                            #lat_rate = float(lat_rate - row[2]) / float(time_delta.total_seconds())
                            #lon_rate = float(lon_rate - row[3]) / float(time_delta.total_seconds())
                            current_packets.append([row[1], row[2], row[3],  alt_rate, lat_rate, lon_rate])
                    time_prev = row[0]
                    alt_prev = row[1]
                    lat_prev = row[2]
                    lon_prev = row[3]
                d = np.array(current_packets)
                #print "len(d):  %d" % len(d)
        
                # list of just the altitude columns
                altitudes = d[0:, 0]
        
                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
               
                # slice off the ascending portion of the flight using the index just determined
                ascent_rates = d[0:(idx+1),0:]
                ascent_rates_pristine = d[0:(idx+1),0:]
        
                # Need to find out if this flight is descending yet...
                # 1.  find max altitude
                # 2.  split array into ascending and descending portions
                # 3.  measure length of the two arrays (i.e. ascending and descending)  
                # 4.  if the descending portion is less than 1 in length, then nope, balloon is not descending yet.
                # This slices off just the altitude column
                #  reminder, balloon_data columns:  timestamp, altitude, latitude, longitude
                altitude_slice = balloon_data[0:, 1]
                
                # Determine the maximum altitude and the index of that value
                idx = np.argmax(altitude_slice)
         
                # split the balloon_data list into two portions based on the index just discovered
                ascent_portion = balloon_data[0:(idx+1), 0:]
                descent_portion = balloon_data[(idx+1):, 0:]
        
                np.set_printoptions(threshold=np.nan)
        
                #####
                # Now we need to determine if we're missing values at the beginning of this flight because of radio limitations, noise, whatever.
                # ...if that's the case, then we append the "missing values" to the end of this array by using the predicted flight path data.
                # Get a list of the prediction values from the predicted flight path.
                predictiondata_sql = """select 
                    p.altitude, 
                    p.latitude, 
                    p.longitude, 
                    p.altrate, 
                    p.latrate, 
                    p.longrate 
                    
                    from predictiondata p inner join  
                        (select 
                            f.flightid, 
                            p.launchsite, 
                            max(p.thedate) as thedate 
                            
                            from 
                            flights f, 
                            predictiondata p 
    
                            where 
                            p.flightid = f.flightid 
                            and f.active='t' 
    
                            group by 
                            f.flightid, 
                            p.launchsite 
    
                            order by 
                            f.flightid
                        ) as a on p.flightid = a.flightid and p.launchsite = a.launchsite and p.thedate = a.thedate 
       
                    where 
                    p.flightid = %s 
                    and p.thedate = a.thedate
    
                    order by 
                    p.thedate, 
                    p.thetime asc
                ;"""
        
                # Columns:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                # Execute the SQL statement
                landingcur.execute(predictiondata_sql, [ fid ])
         
                # stuff all returned rows into an array
                rows = landingcur.fetchall()

                # We only want to slice/append/concatenate in data from prediction data IF there is actually prediction data...duh..
                if len(rows) > 2:

                    # reverse the ascent rate list so that the maximum value is first....i.e. so it "looks like" a descending list of altitudes
                    # ascent_rates:  this array contains wind vector values that this callsign experienced during the ascent portion of its flight.
                    # columns: altitude, latitude, longitude, elevation change rate , latitude change rate, longitude change rate
                    # change rates are in ft/s and decimal degrees per sec.
                    #
                    # this array is reversed here because we'll use it below to get wind vector data for the prediction
                    ascent_rates = ascent_rates[::-1]       
        
                    # Convert that array to a Numpy array
                    predictiondata = np.array(rows, dtype='f')
            
                    # find the maximum altitude and note the index position of that value
                    idx = np.argmax(predictiondata[0:,0])
        
                    # slice off the ascending portion of the flight using the index just determined, and reverse the array
                    prediction_ascent_portion = predictiondata[0:(idx+1),0:]
                    prediction_altitudes = prediction_ascent_portion[0:,0]
                    prediction_altitudes = prediction_altitudes[::-1]
         
                    # Determine the index of the altitude within the prediction data that is closest to the smallest value from the received ascent data.
                    # ...aka, the value of where our heard ascent packets started
                    lowest_heard_altitude = ascent_rates[-1:, 0]
                    #print prediction_altitudes
                
                    idx = 0
                    for alt in prediction_altitudes:
                        #print "alt:  %g, lowest_heard_altitude:  %g" % (alt, lowest_heard_altitude)
                        if alt < lowest_heard_altitude:
                            break 
                        idx += 1
        
                    # slice off the missing values and append them to our ascent_rates array, and reverse the array back to normal order
                    newidx = prediction_ascent_portion.shape[0] - (idx + 1)
                    preddata_portion = prediction_ascent_portion[0:newidx,0:]
                    preddata_portion = preddata_portion[::-1]
            
                    ascent_rates = np.concatenate((ascent_rates, preddata_portion), axis=0)

                else:
                    # If we're here, then there wasn't a prediction file uploaded for this flight.  That means we need to estimate some things and will use
                    # the launch site location and elevation to estimate wind vectors for the first portion of the flight during which we didn't hear packets.

                    # ascent_rates Columns:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                    # Reverse the ascent rates heard thus far...
                    ascent_rates = ascent_rates[::-1]

                    #print "======== ascent_rates (pre append) =========="
                    #z = 0
                    #for a in ascent_rates:
                    #    print "ascent_rates[%d]:  " % z, ascent_rates[z]
                    #    z += 1
                    #print "================================"


                    # Determine the index of the altitude within the prediction data that is closest to the smallest value from the received ascent data.
                    # ...aka, the value of where our heard ascent packets started
                    lowest_heard_altitude = float(ascent_rates[-1:, 0][0])

                    # if the floor is still lower than this lowest heard altitude then we append a row with updated rates for lat, lon, and altitude...
                    if floor < lowest_heard_altitude:

                        # flightid | callsign | launchsite |  lat   |   lon    | alt
                        #----------+----------+------------+--------+----------+------
                        # TEST-001 | AE0SS-13 | Wiggins    | 40.228 | -104.075 | 4500
                        # TEST-001 | KC0D-1   | Wiggins    | 40.228 | -104.075 | 4500

                        # This is the location and elevation of the launch site (aka the balloon started its trip here)
                        origin_x = float(flightids[i, 3])
                        origin_y = float(flightids[i, 4])
                        origin_alt = float(flightids[i, 5])

                        # Different in the elevation at the launch site and the altitude of the balloon for the first packet we heard
                        # first_packet columns:  timestamp, altitude, latitude, longitude
                        dz = float(first_packet[1]) - origin_alt

                        # Using the vertical rate observed from the first two packets heard from the balloon, we estimate the amount of time the balloon took
                        # from the launch site, to the first packet we heard from it.  This is a comprimise (obviously), but it's better than not having an origin point
                        # in the first place.
                        time_to_first = dz / float(ascent_rates[-1:, 3][0])

                        # The latitude and longitude angular rates
                        latrate_to_first = (float(first_packet[2]) - origin_x) / time_to_first
                        lonrate_to_first = (float(first_packet[3]) - origin_y) / time_to_first

                        # Prepend our calculated entries for the first part of the flgiht to the ascent_rates numpy array
                        tempray = []
                        # ascent_rates Columns:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                        #tempray.append([first_packet[1], first_packet[2], first_packet[3], ascent_rates[-1:, 3][0], latrate_to_first, lonrate_to_first])

                        j = float(floor)
                        jx = origin_x
                        jy = origin_y
                        while j < lowest_heard_altitude:

                            tempray.append([j, jx, jy, ascent_rates[-1:, 3][0], latrate_to_first, lonrate_to_first])

                            # Different in the elevation at the launch site and the altitude of the balloon for the first packet we heard
                            # first_packet columns:  timestamp, altitude, latitude, longitude
                            dz = float(first_packet[1]) - j

                            # Using the vertical rate observed from the first two packets heard from the balloon, we estimate the amount of time the balloon took
                            # from the launch site, to the first packet we heard from it.  This is a comprimise (obviously), but it's better than not having an origin point
                            # in the first place.
                            time_to_first = dz / float(ascent_rates[-1:, 3][0])
                            
                            jx = jx + latrate_to_first * time_to_first
                            jy = jy + latrate_to_first * time_to_first
    
                            j += 500

                        #tempray.append([origin_alt, origin_x, origin_y, ascent_rates[-1:, 3][0], latrate_to_first, lonrate_to_first])
                        tempray = np.array(tempray)
                        #current_altitude = altitude_slice[-1]
                        #if current_altitude < lowest_heard_altitude * 1.25:
                        ascent_rates = np.concatenate((ascent_rates, tempray[::-1]), axis=0)
                     
        
                        #print "======== variables =========="
                        #print "lowest_heard_altitude: ", lowest_heard_altitude
                        #print "time_to_first: ", time_to_first
                        #print "dz: ", dz
                        #print "origin_x: ", origin_x
                        #print "origin_y: ", origin_y
                        #print "dx: ", float(first_packet[2]) - origin_x
                        #print "dy: ", float(first_packet[3]) - origin_y
                        #print "origin_alt: ", origin_alt
                        #print "================================" 


        
                # If the index of max altitude is less than the length of the of the flight...implies we've seen an alitude "hump" and are now descending
                # ...AND we've seen at least 1 packet since the max altitude value was hit...
                # ...AND the max altitude is > 14,999 feet (sanity check)...
                # ...THEN continue on and try to predict a landing location for this flight
                alt_sanity_threshold = 14999
                if idx < (balloon_data.shape[0] - 1) and descent_portion.shape[0] > 1 and altitude_slice[idx] > alt_sanity_threshold:
            
                   # Slice off just the altitudes values from this balloon flight during the descent portion of the flight only
                   balloon_altitudes = descent_portion[1:, 1]
                
                   # Calcuate the descent rates for the APRS packets received thus far
                   balloon_velocities = []
                   time_seconds_prev = 0
                   alt_prev = 0
                   thetime_prev = 0
                   firsttime = 0
                   for row in descent_portion:
                        #thetime = datetime.datetime.strptime(row[0], "%d %b %Y  %H:%M:%S.%f")
                        thetime = row[0]
                        if firsttime == 0:
                            time_delta = thetime
                            firsttime = 1
                        else:
                            time_delta = thetime - thetime_prev
                            balloon_velocities.append(abs(float(row[1] - alt_prev))/float(time_delta.total_seconds()))
                        alt_prev = row[1]
                        thetime_prev = thetime
        
                   # Convert these two arrays to be numpy arrays of type "float".
                   # balloon_velocities:  contains a list of velocity values for this callsign during the descent portion of the flight
                   # balloon_altitudes:  contains a list of altitude values for this callsign during the descent portion of the flight
                   balloon_velocities = np.array(balloon_velocities, dtype='f')
                   balloon_altitudes = np.array(balloon_altitudes, dtype='f')
                 


                   ### Here we need to determine the z-component of wind vectors by fitting a line to the vertical rate vs altitude  data.
                   # this allows us to do two things:
                   #    1) account for any upward or downward wind that is impacting (or will impact) the parachute as it's descending.
                   #    2) and ultimately make the landing location prediction more accuruate for the given flight/callsign.
                   # ascent_rates Columns:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                   arates_velocities = np.array(ascent_rates[0:, 3], dtype='f')
                   arates_altitudes = np.array(ascent_rates[0:, 0], dtype='f')
                   M, B = curve_fit(func_fittedline, arates_altitudes, arates_velocities)[0]
                   #print "%s:%s  M, B: %.3f, %.3f" % (fid, callsign, M, B)
                   p, e = curve_fit(func_x2, balloon_altitudes, balloon_velocities)
        
                   # this converts the ascent_rates array (calculated above) to be a Numpy array of "floats".
                   # Columns for prediction data:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                   # this is the array that is used for obtaining wind vectors at various altitude levels.
                   # columns:  altitude, lat, long, alt_rate, lat_rate, long_rate
                   prediction_descent_data = np.array(ascent_rates, dtype='f')
                   #print "======== ascent_rates (pre append) =========="
                   #z = 0
                   #for a in prediction_descent_data[0:5]:
                   #    print "ascent_rates[%d]:  " % z, prediction_descent_data[z]
                   #    z += 1
                   #print "================================"
        
        	   # Columns for balloon data and descent_portion:  timestamp, altitude, latitude, longitude
        	   x = balloon_data[-1, 2] 
        	   y = balloon_data[-1, 3] 
                   
                   # This is basically the starting altitude for the prediction.  It's the last altitude value we received from the balloon.
        	   backstop = float(descent_portion[-1, 1])


                   #print "================== %s : %s ===================" % (fid, callsign)
        
        	   # Loop through adding up the lat/long changes, culminating in a predicted landing location
                   last_heard_altitude = descent_portion[-1, 1]
        	   for k in prediction_descent_data:
        	       if k[0] < last_heard_altitude and k[0] >= floor:
                           #drate = (adjust if k[0] == floor else func_x2(k[0], *p))
                           #drate = func_x2(k[0], *p)
                           delta = func_fittedline(k[0], M, B) - k[3] 
                           drate = func_x2(k[0], *p) + delta
        		   t = abs((k[0] - backstop) / drate)
           		   dx = t * k[4]
        		   dy = t * k[5]
        		   #print "predloop:  alt: %g, backstop: %g, time_in_alt_level: %g, pred_descent_rate: %g, delta: %g" %(k[0], backstop, t, drate, delta)
        		   x = x + dx
        		   y = y + dy
        		   backstop = k[0]

                       # if we still have prediction data values to run through, but this first one is below our floor....
                       # ...well, we still want to process lat/lon changes one more iteration to get our predictions to the floor level...then we quit the loop.
#                       elif k[0] < last_heard_altitude and k[0] <= floor: 
#                           #print "One last calculation at %.2f ft for %s:%s" % (k[0], fid, callsign)
#        		   t = abs((floor - backstop) / func_x2(floor, *p))
#           	           dx = t * k[4]
#        	           dy = t * k[5]
#        		   print "predloop2:  alt: %g, time_in_alt_level: %g, pred_descent_rate: %g" %(k[0], t, func_x2(k[0], *p))
#        		   x = x + dx
#        		   y = y + dy
#        		   #backstop = k[0]
        		   
        	   # construct SQL for inserting the landing prediction into the landingpredictions table
        	   landingprediction_sql = """insert into landingpredictions values (date_trunc('second', now())::timestamp, %s, %s, 'predicted', %s::numeric, ST_GeometryFromText('POINT(%s %s)', 4326));"""
        	   landingcur.execute(landingprediction_sql, [ fid, callsign, np.float(p[0]), np.float(y), np.float(x) ])
        	   landingconn.commit()
        
            i += 1
        
        
        landingcur.close()
        landingconn.close()
    except pg.DatabaseError as error:
        landingcur.close()
        landingconn.close()
        print(error)
    except (GracefulExit, KeyboardInterrupt, SystemExit):
        landingcur.close()
        landingconn.close()
        print "Landing predictor ended"


##################################################
# Landing Predictor Process
##################################################
def runLandingPredictor(schedule, altitude_floor, e):
    try:
        # run the landing predictor function continuously, every "schedule" seconds.
        #while True:
        while not e.is_set():
            landingPredictor(altitude_floor)
            time.sleep(schedule)
            #e.wait(schedule)
        print "Prediction scheduler ended"
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        print "Prediction scheduler ended"
        pass



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
        print(error)
        return None
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        grcur.close()
        grconn.close()
        return None
    


##################################################
# Return the hash of a ham callsign.  This is the passcode used with APRS-IS
##################################################
#def hashCall(call):
#    thehash = 0x73e2
#
#    localCall = call.upper().split("-")[0]
#    
#    i = 0
#    thelen = len(localCall)
#    while i < thelen:
#        thehash = thehash ^ (ord(localCall[i]) << 8) # xor high byte with accumulated hash
#        thehash = thehash ^ (ord(localCall[i+1])) # xor low byte with accumulated hash
#        i += 2
#
#    return (thehash & 0x7fff) # mask off the high bit so number is always positive



##################################################
# Create an APRS-IS filter string
##################################################
def getAPRSFilter(aprsRadius, callsign):
    try:
        # Adjust inital APRS-IS filter if a callsign was given.
        # ...we do this so that we ingest packets that were heard directly as well as those via a radius, etc..
        #if callsign == "E0SS" or callsign == "":
        #    aprsFilter = ""
        #else:
        aprsFilter = "e/" + callsign + "*"

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

    
        # Loop through the first 9 beacons adding 50km friend filters for each one. 
        friendFilter = ""
        for beacon in rows[0:9]:
            friendFilter = friendFilter + " f/" + beacon[1] + "/50"
        if len(rows) > 0:
            aprsFilter = aprsFilter + friendFilter 


        # SQL query to fetch the callsigns for trackers 
#        trackerSql = """select 
#            t.callsign
#
#            from 
#            trackers t
#  
#            order by
#            t.callsign asc;
#        """
#      
#        # Execute the SQL query and fetch the results
#        pgCursor.execute(trackerSql)
#        rows = pgCursor.fetchall() 
#
#
#        # Loop through each tracker callsign, building the APRS-IS filter string
#        trackerFilter = ""
#        for tracker in rows:
#            trackerFilter = trackerFilter + "/" + tracker[0] + "*"
#        if len(rows) > 0:
#            aprsFilter = aprsFilter + " b" + trackerFilter 
#
        # Close database connection
        pgCursor.close()
        pgConnection.close()
 
        #print("aprsFilter2: %s\n" % aprsFilter)

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
# Write an incoming packet to the database
##################################################
tapcur = None
def writeToDatabase(x): 
    # Note:  we don't want to open/close the database connection within this function because that would add a LOT of overhead 
    #        as this function is called for every incoming packet.  DB connections are opened/closed in the calling function. 

    global tapcur
    try:
        # Parse the raw APRS packet
        packet = aprslib.parse(x)
        
        # The list of key names from the APRS packet structure (parsed above) that we're insterested in when inserting this packet into the database (down below).
        keys = ["object_name", "comment", "latitude", "longitude", "altitude", "course", "symbol", "symbol_table", "speed"]

        # Set those field values to NULL if this packet does not include them....this allows us to insert a NULL value for this database field later down below. 
        for a in keys:
            if a not in packet:
                packet[a] = ""

        # Decipher the APRS symbol...
        # The usual stuff about if the symbol type for an APRS packet starts with a / or a \, then we need to choose the appropriate symbol table, etc..
        # ...basically getting the symbol returned from packet parsing (up above) consolidated down to just to characters as prep to inserting into the DB.
        if packet["symbol_table"] != "/" and packet["symbol_table"] != "":
            packet["symbol"] = packet["symbol_table"] + packet["symbol"]  
        elif packet["symbol_table"] == "/":
            packet["symbol"] = "/" + packet["symbol"]

        # For those values within the packet that are numeric, we set them to zero instead of NULL if this packet does not include them.
        for a in ["speed", "course", "altitude"]:
            if packet[a] == "":
                packet[a] = 0

        # We want to split off the information part of the APRS packet for the following reasons:
        #    1.  So we can upload just that part of the packet into the database
        #    2.  Get the packet type (i.e. message, location, status, telemetry, mic-e, etc.)
        #    3.  Break this out so we can compute an MD5 hash for determining packet uniqueness (downstream functionality)
        #
        # Split this the packet at the ":"
        ppart = packet["raw"].partition(":")
        if ppart[2] != "":
            ptype = ppart[2][0]
            info = ppart[2][1:] 
        else:
            ptype = ""
            info = ""
        
        # For those APRS packets that have an "object name" (presumably for an APRS "object") then we set the "from" field to the "object name".
        # ...even though the object packet was likely transmitted from a different callsign/station, sitting the from field to this object name
        # makes for niceness downstream when displaying APRS items on the map.
        if packet["object_name"] != "":
            packet["from"] = packet["object_name"]

        #print("from:%s ptype:%s info:%s\n" % (packet["from"], ptype, info))

        # If the packet includes a location (some packets do not) then we form our SQL insert statement differently
        if packet["latitude"] == "" or packet["longitude"] == "":
            # SQL insert statement for packets that contain a location (i.e. lat/lon)
            sql = """insert into packets values (
                now()::timestamp with time zone, 
                %s, 
                %s, 
                (%s::numeric) * 0.6213712, 
                %s::numeric, 
                (%s::numeric) * 3.28084, 
                %s, 
                NULL, 
                NULL, 
                %s, 
                %s, 
                md5(%s)
            );"""

            # Execute the SQL statement
            tapcur.execute(sql, [
                packet["from"], 
                packet["symbol"], 
                packet["speed"], 
                packet["course"], 
                packet["altitude"], 
                packet["comment"], 
                packet["raw"], 
                ptype, 
                info
            ])

        else:
            # SQL insert statement for packets that DO NOT contain a location (i.e. lat/lon)
            sql = """insert into packets values (
                now()::timestamp with time zone, 
                %s, 
                %s, 
                (%s::numeric) * 0.6213712, 
                %s::numeric, 
                (%s::numeric) * 3.28084, 
                %s, 
                ST_GeometryFromText('POINT(%s %s)', 4326), 
                ST_GeometryFromText('POINTZ(%s %s %s)', 4326), 
                %s, 
                %s, 
                md5(%s)
            );"""

            # Execute the SQL statement
            tapcur.execute(sql, [
                packet["from"], 
                packet["symbol"], 
                packet["speed"], 
                packet["course"], 
                packet["altitude"], 
                packet["comment"], 
                packet["longitude"], 
                packet["latitude"], 
                packet["longitude"], 
                packet["latitude"], 
                packet["altitude"], 
                packet["raw"], 
                ptype,
                info
            ])
         

    except (ValueError, UnicodeEncodeError) as error:
        print "Encoding error: ", error
        print "Skipping DB insert for: ", x
        pass

    except pg.DatabaseError as error:
        print "[writeToDatabase] Database error:  ", error
        print "[writeToDatabase] raw packet: ", x
        tapcur.close()
    except (aprslib.ParseError, aprslib.UnknownFormat) as exp:
        #print "Unknown packet format:  %s, %s" % (datetime.datetime.now(), x)
        pass
    except (StopIteration, GracefulExit, KeyboardInterrupt, SystemExit): 
        tapcur.close()


##################################################
# Thread for updating the APRS-IS filter
##################################################
def aprsFilterThread(callsign, a, r, e):
    
    # The time in seconds in between updating the APRS-IS filter.
    # 
    delta = 15 

    try:
        # Loop forever (until this thread/process is killed) sleeping each time for "delta" seconds.
        #while True:
        while not e.is_set():
            # Sleep for delta seconds
            time.sleep(delta)
            #e.wait(delta)

            # Get a new APRS-IS filter string (i.e. our lat/lon location could have changed, beacon callsigns could have changed, etc.)
            filterstring = getAPRSFilter(r, callsign) 
 
            #print "setting aprs filter:  ", filterstring

            # Put this filter into effect
            a.set_filter(filterstring)
            #print "Filter now: ", a.filter

    except (StopIteration, GracefulExit, KeyboardInterrupt, SystemExit): 
        pass



##################################################
# Process for connecting to APRS-IS
##################################################
def aprsTapWatchDog(a, e):
    e.wait()
    print "Watchdog closing APRS-IS tap..."
    raise StopIteration("telling aprslib to stop")


##################################################
# Process for connecting to APRS-IS
##################################################
def aprsTapProcess(callsign, radius, e):
    global tapcur

    try:
 
        #logging.basicConfig(level=0)
        
        # Connect to the aprsc process 
        # We always append "03" to callsign to ensure were connecting with a reasonably unique callsign (i.e. so we don't conflict with direwolf or other).
        ais = aprslib.IS(callsign + "03", aprslib.passcode(str(callsign) + "03"), host='127.0.0.1', port='14580')

        # database connection
        # the writeToDatabase function uses these connect variables
        tapconn = pg.connect(habconfig.dbConnectionString)
        tapconn.set_session(autocommit=True)
        tapcur = tapconn.cursor()

        # ...see the getAPRSFilter function
        ais.set_filter(getAPRSFilter(radius, callsign))
 
        # wait for 5 seconds to give aprsc time to start
        # Future note:  need to change this to use Lock's....
        time.sleep(5)
        #e.wait(5)
        
        ais.connect()

        # This is the thread which updates the filter used with the APRS-IS connectipon
        aprsfilter = th.Thread(name="APRS-IS Filter", target=aprsFilterThread, args=(callsign, ais, radius, e))
        aprsfilter.setDaemon(True)
        aprsfilter.start()

        watchdog = th.Thread(name="APRS-IS Tap Watchdog", target=aprsTapWatchDog, args=(ais, e))
        watchdog.setDaemon(True)
        watchdog.start()

        # The consumer function blocks forever, calling the writeToDatabase function upon receipt of each APRS packet
        ais.consumer(writeToDatabase, blocking=True, raw=True)
            
    except (StopIteration, aprslib.ConnectionDrop, aprslib.ConnectionError, aprslib.LoginError, aprslib.ParseError) as error:
        print "Closing APRS Tap: ", error
        ais.close()
        tapcur.close()
        tapconn.close()
        print "aprsTap ended"

    except pg.DatabaseError as error:
        print "[aprsTapProcess] Database error:  ", error
        tapcur.close()
        tapconn.close()
        ais.close()
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        tapcur.close()
        tapconn.close()
        ais.close()
        print "aprsTap ended 2"


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
            sdrs.append(rtl)
            i = i+1
        #print json.dumps(sdrs)
        return sdrs
        #return i


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
            f.write("# " + filename + "\n\n\n")
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

            if configdata["includeeoss"] == "true":
                eoss = ",EOSS"
            else:
                eoss=""

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
                f.write("TBEACON sendto=" + str(channel) + " delay=0:30 every=" + str(configdata["beaconlimit"]) + "  altitude=1    via=WIDE1-1,WIDE2-1" + str(eoss) + "      symbol=" + str(configdata["symbol"]) + "    comment=\"" + str(configdata["comment"]) +  "\"\n")
                f.write("SMARTBEACONING " + str(configdata["fastspeed"]) + " " + str(configdata["fastrate"]) + "      " + str(configdata["slowspeed"]) + " " + str(configdata["slowrate"]) + "     " + str(configdata["beaconlimit"]) + "     " + str(configdata["fastturn"]) + " " + str(configdata["slowturn"]) + "\n")
                f.write("###########################################\n\n")
            
            if configdata["igating"] == "true":
                f.write("########## for internet beaconing #########\n");
                f.write("TBEACON sendto=IG  delay=0:40 every=" + str(configdata["beaconlimit"]) + "  altitude=1    via=WIDE1-1,WIDE2-1" + str(eoss) + "      symbol=" + str(configdata["symbol"]) + "    comment=\"" + str(configdata["comment"]) +  "\"\n")
                f.write("IBEACON sendto=IG  delay=5:00 every=5:00 via=WIDE1-1,WIDE2-1" + str(eoss) + "\n")
                if configdata["beaconing"] == "false":
                    f.write("SMARTBEACONING " + str(configdata["fastspeed"]) + " " + str(configdata["fastrate"]) + "      " + str(configdata["slowspeed"]) + " " + str(configdata["slowrate"]) + "     " + str(configdata["beaconlimit"]) + "     " + str(configdata["fastturn"]) + " " + str(configdata["slowturn"]) + "\n")
                f.write("###########################################\n\n")


            # The rest of the direwolf configuration
            # We're using the localhost address because that's where aprsc is running
            f.write("# APRS-IS Info\n")
            f.write("IGSERVER 127.0.0.1\n")
        
            # Login info for aprsc
            if configdata["igating"] == "true":
                password = configdata["passcode"]
            else:
                password = aprslib.passcode(str(callsign))
            f.write("IGLOGIN " + callsign + " " + str(password) + "\n\n")
 
            # The rest of the direwolf configuration
            f.write("AGWPORT 8000\n")
            f.write("KISSPORT 8001\n")
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
def direwolf(configfile="", logfile="", e = None):
    # Location of the direwolf binary
    df_binary = "/usr/local/bin/direwolf"

    # if we don't have a proper configfile or logfile then we can't run Direwolf.  This should never happen, but just in case.
    # The "logfile" referenced here is really just the redirected STDOUT from the direwolf instance.  This is different from the CSV log file... 
    # ...that is selectable from the direwolf command line.  
    if configfile == "" or configfile is None or logfile == "" or logfile is None:
        return -1

    # The command string and arguments for running direwolf
    df_command = [df_binary, "-t", "0", "-c", configfile]

    try:
        # We open the logfile first, for writing
        l = open(logfile, "w")

        # Run the direwolf command
        p = sb.Popen(df_command, stdout=l, stderr=l)

        # Wait for it to finish
        #p.wait()
        e.wait()
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"
        l.close()
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        if p.poll() is None:
            print "Terminating direwolf..."
            p.terminate()
            print "Waiting for direwolf to end.."
            p.wait()
            print "Direwolf ended"
        l.close()


##################################################
# Build the aprsc configuration file
##################################################
def createAprscConfig(filename, callsign, igate):

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
                f.write("Uplink \"Core rotate\" full  tcp  noam.aprs2.net 10152\n")
            else:
                # This is set to be a read only connection to APRS-IS.  That is, we're not going to upload packets to any defined Uplink connections.
                f.write("Uplink \"Core rotate\" ro  tcp  noam.aprs2.net 10152\n")

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
def aprsc(configfile, e):
    # Location of the aprsc binary
    aprsc_binary = "/opt/aprsc/sbin/aprsc"

    # if we don't have a proper configfile then we can't run aprsc.  This should never happen, but just in case.
    if configfile == "" or configfile is None:
        return -1

    # get just the filename without any path, but prefix that with "etc/"....because aprsc runs in a chroot environment (aka no absolute paths).
    config_file = "etc/" + os.path.basename(configfile)

    # For reference we must run aprsc as root (thus the need for sudo) so that it can chroot to the /opt/aprsc path.
    # For example:
    #     sudo /opt/aprsc/sbin/aprsc -u aprsc -t /opt/aprsc -e info -o file -r logs -c etc/aprsc-tracker.conf
 
    # To run aprsc, we must be root, so we're going to use sudo to do that.  This assumes, that the user running this script has 
    # been given permission to start and stop (i.e. kill) the aprsc process without a password.
    # The command string and arguments for running aprsc
    aprsc_command = ["sudo", aprsc_binary, "-u", "aprsc", "-t", "/opt/aprsc", "-e", "info", "-o", "file", "-r", "logs", "-c", config_file]

    try:
        # Run the aprsc command
        p = sb.Popen(aprsc_command)
        
        # Wait for it to finish
        #p.wait()
        e.wait()
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
        "", "--algoFloor", dest="algoFloor", type="intx", default=4900,
        help="Set the elevation floor (in feet) for how low the landing predictor will compute landing locations  [default=%default]")
    parser.add_option(
        "", "--algoInterval", dest="algoInterval", type="intx", default=13,
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


    # --------- Read in the configuration file (if it exists) --------
    # This is normally in ../www/configuration/config.txt
    try:
        with open('/eosstracker/www/configuration/config.txt') as json_data:
            configuration = json.load(json_data)
    except:
        # Otherwise, we assume the callsign from the command line and do NOT perform igating or beaconing
        configuration = { "callsign" : options.callsign, "igating" : "false", "beaconing" : "false" }

    ## Now check for default values for all of the configuration keys we care about.  Might need to expeand this to be more robust/dynamic in the future.
    defaultkeys = {"timezone":"America\/Denver","callsign":"","lookbackperiod":"180","iconsize":"24","plottracks":"off", "ssid" : "9", "igating" : "false", "beaconing" : "false", "passcode" : "", "fastspeed" : "45", "fastrate" : "01:00", "slowspeed" : "5", "slowrate" : "10:00", "beaconlimit" : "00:35", "fastturn" : "20", "slowturn": "60", "audiodev" : "0", "serialport": "none", "serialproto" : "RTS", "comment" : "EOSS Tracker", "includeeoss" : "true", "symbol" : "\/k"}

    for the_key, the_value in defaultkeys.iteritems():
        if the_key not in configuration:
            configuration[the_key] = the_value

    # If the callsign is empty, we use the default one from the command line.
    if configuration["callsign"] == "":
        configuration["callsign"] = options.callsign

    if configuration["igating"] == "true":
        if str(aprslib.passcode(str(configuration["callsign"]))) != str(configuration["passcode"]):
            print "Inocorrect passcode, ", str(configuration["passcode"]), " != ", aprslib.passcode(str(configuration["callsign"])), ", provided, igating disabled."
            configuration["igating"] = "false"


    print "Starting HAB Tracker backend daemon"
    print "Callsign:  %s" % str(configuration["callsign"])
    print "APRS-IS Radius: %dkm" % options.aprsisRadius
    print "Algorithm Floor: %dft (this will auto-adjust)" % options.algoFloor
    print "Algorithm Interval: %ds" % options.algoInterval


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
 
        print "Number of SDRs: ", i

        #  RF mode:  
        #      - we do start aprsc, but only have it connect as "read-only" to APRS-IS (regardless if we want to igate or not)
        #      - we don't start GnuRadio processes
        #      - we don't start Direwolf
        #   
        #  Online-only mode: 
        #      - we do start aprsc, and connect in "read-only" mode (unless, future-tense here, we want to upload packets to the internet)
        #      - we do start GnuRadio processes
        #      - we do start Direwolf and have it connect to the aprsc instance via "localhost" 

        # Create the aprsc configuration file
        # We're assuming the path to this is the standard install path for aprsc, /opt/aprsc/etc/...
        # We always append "01" to the callsign to ensure that it's unique for APRS-IS
        aprsc_configfile = "/opt/aprsc/etc/tracker-aprsc.conf"
        if createAprscConfig(aprsc_configfile, str(configuration["callsign"]) + "01", configuration["igating"]) < 0:
            sys.exit()
       
        # This is the aprsc process
        aprscprocess = mp.Process(target=aprsc, args=(aprsc_configfile, stopevent))
        aprscprocess.daemon = True
        aprscprocess.name = "aprc"
        processes.append(aprscprocess) 

        status = {}
        antennas = []

        # If USB SDR dongles are attached, then we're going to start in RF mode and start GnuRadio and Direwolf processes
        if i > 0:
            # For the first SDR dongle found, start a separate GnuRadio listening process
            # We only want to start a single GnuRadio process so that we're only going to use the first USB dongle present. This
            # will prevent us from consuming all USB sticks attached to a system.
            k = 0

            print "Using SDR:  ", sdrs[0]

            status["rf_mode"] = 1
            # Get the frequencies to be listened to (ex. 144.39, 144.34, etc.) and UDP port numbers for xmitting the audio over
            freqlist = getFrequencies(k)

            # Append this frequency list to our list for later json output
            ant = {}
            ant["rtl_id"] = k
            ant["frequencies"] = []
            ant["rtl_serialnumber"] = sdrs[k]["serialnumber"]
            ant["rtl_manufacturer"] = sdrs[k]["manufacturer"]
            ant["rtl_product"] = sdrs[k]["product"]
            for freq,udpport in freqlist:
                ant["frequencies"].append({"frequency": round(freq/1000000.0, 3), "udp_port": udpport})
            antennas.append(ant) 

            # append this frequency/UDP port list to the list for Direwolf
            direwolfFreqList.append(freqlist)

            # This is the GnuRadio process
            grprocess = mp.Process(target=GRProcess, args=(freqlist, k, stopevent))
            grprocess.daemon = True
            grprocess.name = "GnuRadio_" + str(k)
            processes.append(grprocess)

            # Create Direwolf configuration file
            #if callsign == "E0SS":
            if configuration["igating"] == "false" and configuration["beaconing"] == "false":
                filename = createDirewolfConfig(str(configuration["callsign"]) + "02", direwolfFreqList, configuration)
            else:
                filename = createDirewolfConfig(str(configuration["callsign"]) + "-" +  str(configuration["ssid"]), direwolfFreqList, configuration)

            logfile = "/eosstracker/logs/direwolf.out"

            dfprocess = mp.Process(target=direwolf, args=(filename, logfile, stopevent))
            dfprocess.daemon = True
            dfprocess.name = "Direwolf"
            processes.append(dfprocess)
        else:
            status["rf_mode"] = 0
           
        status["antennas"] = antennas 
        status["igating"] = configuration["igating"]
        status["beaconing"] = configuration["beaconing"]
        print "\n"
        print "JSON:", json.dumps(status)
        print "\n"


        # This is the APRS-IS connection tap.  This is the process that is respoonsible for inserting APRS packets into the database
        aprstap = mp.Process(name="APRS-IS Tap", target=aprsTapProcess, args=(str(configuration["callsign"]), options.aprsisRadius, stopevent))
        aprstap.daemon = True
        aprstap.name = "APRS-IS Tap"
        processes.append(aprstap)

        # This is the GPS position tracker process
        gpsprocess = mp.Process(target=GpsPoller, args=(stopevent,))
        gpsprocess.daemon = True
        gpsprocess.name = "GPS Position Tracker"
        processes.append(gpsprocess)

        # This is the landing predictor process
        landingprocess = mp.Process(target=runLandingPredictor, args=(options.algoInterval, options.algoFloor, stopevent))
        landingprocess.daemon = True
        landingprocess.name = "Landing Predictor"
        processes.append(landingprocess)



        # Loop through each process starting it
        for p in processes:
            #print "Starting:  %s" % p.name
            p.start()
    
        # Join each process (which blocks until the sub-process ends)
        for p in processes:
            p.join()

    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        print "Setting stop event..."
        stopevent.set()
        for p in processes:
            print "Waiting for [%s] %s to end..." % (p.pid, p.name)
            p.join()

    print "\nDone."



if __name__ == '__main__':
    main()
