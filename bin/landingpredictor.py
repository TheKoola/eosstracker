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

import os
import math
from math import radians, cos, sin, asin, sqrt
import time
import datetime 
import psycopg2 as pg
import sys
import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import *
from scipy.interpolate import *
from scipy.optimize import *

#import local configuration items
import habconfig 


class GracefulExit(Exception):
    pass

def signal_handler(signum, frame):
    print "Caught SIGTERM..."
    raise GracefulExit()


# This is the initial floor for the algorithm.  Prediction calculations are no longer performed for altitudes below this value.
# This will automatically adjust later on...to the elevation of the originating launch site for the given flight
prediction_floor = 4900

# This is the velocity value in ft/s at the floor.  That is, how fast is the balloon traveling when it hits ground level.  Or put 
# more mathmatically kindof our x-intercept.
adjust = 17

# Launch site elevation starting point
launchsite_elev = 4900


#####################################
# Functions to use for curve fitting
#####################################
def func_x2(x, a) :
    global prediction_floor
    global adjust
    return a * np.power(x - prediction_floor, 2) + adjust


def func_fittedline(x, a, b):
    # this is y = mx +b
    return a*x + b


#####################################
# Curve representing the change in air density with altitude
#####################################
airdensities = np.array([ [0, 23.77], [5000, 20.48], [10000, 17.56], [15000, 14.96], [20000, 12.67], [25000, 10.66],    
    [30000, 8.91], [35000, 7.38], [40000, 5.87], [45000, 4.62], [50000, 3.64], [60000, 2.26], [70000, 1.39], [80000, 0.86],    
    [90000, 0.56], [100000, 0.33], [150000, 0.037], [200000, 0.0053], [250000, 0.00065]])
airdensity = interpolate.interp1d(airdensities[0:, 0], airdensities[0:,1], kind='cubic')


#####################################
# Curve representing the change in gravitational acceleration with altitude
#####################################
gravities = np.array([ [0, 32.174], [5000, 32.159], [10000, 32.143], [15000, 32.128], [20000, 32.112], [25000, 32.097], [30000, 32.082], [35000, 32.066], [40000, 32.051], [45000, 32.036], [50000, 32.020], [60000, 31.990], [70000, 31.959], [80000, 31.929], [90000, 31.897], [100000, 31.868], [150000, 31.717], [200000, 31.566], [250000, 31.415] ])
g = interpolate.interp1d(gravities[0:, 0], gravities[0:, 1], kind='cubic')


#####################################
# Function to use to determine distance between two points
#####################################
def distance(lat1, lon1, lat2, lon2):
    #p = 0.017453292519943295     #Pi/180
    #a = 0.5 - math.cos((lat2 - lat1) * p)/2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    #return * math.asin(math.sqrt(a)) #2*R*asin...

    lon1 = radians(lon1)
    lon2 = radians(lon2)
    lat1 = radians(lat1)
    lat2 = radians(lat2)

    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    #r = 6371 # Radius of earth in kilometers. Use 3956 for miles
    r = 3956 # Radius of earth in kilometers. Use 3956 for miles

    return float(c * r)

    
        
#####################################
# Primary landing prediction function
#####################################
def landingPredictor(altitude_floor, configuration):
    global prediction_floor
    global launchsite_elev
    global adjust
    try:
        
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
            launchsite_elev = float(flightids[i,5])
            #print "Setting algorithm launchsite_elev to: %.2f ft for %s:%s" % (launchsite_elev, fid, callsign)

            #print "fid: %s, callsign: %s" %(fid, callsign)
            #print "fid = %s, str: %s,  type: %s" %(fid, fid[0], type(fid))
        
            # The SQL statement to get the latest packets for this flightid
            # This data is used for two purposes:  
            #    1) to get the ascent data for this flight which is used for prediction purposes
            #    2) and for getting the current packets when the balloon is descending so we can use that as the starting point for curve fitting 
            #
            # columns:  timestamp, altitude, latitude, longitude
            latestpackets_sql = """select distinct on (thetime)
                                   case
                                       when a.ptype = '/' and a.raw similar to '%%[0-9]{6}h%%' then 
                                           date_trunc('second', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone %s)::timestamp)::timestamp without time zone
                                       else
                                           date_trunc('second', a.tm)::timestamp without time zone
                                   end as thetime,
                                   round(a.altitude::numeric) as altitude,
                                   round(ST_Y(a.location2d)::numeric, 6) as lat,
                                   round(ST_X(a.location2d)::numeric, 6) as long
        
                                   from 
                                   packets a
        
                                   where 
                                   ST_X(a.location2d) != 0 
                                   and ST_Y(a.location2d) != 0 
                                   and a.altitude > 0
                                   and a.callsign = %s
                                   and a.tm > now()::date
        
                                   order by 
                                   thetime asc
                                   ; """
          
            # Execute the SQL statment and get all rows returned
            landingcur.execute(latestpackets_sql, [ configuration["timezone"], callsign ])
            rows = landingcur.fetchall()


            #print callsign, ", rows: ", rows
        
            if len(rows) > 1:
                #print "fid: %s, callsign: %s, number of rows:  %g" %(fid, callsign, len(rows))
                ##  balloon_data contains a list of all rows (i.e. packets) received for this callsign thus far
                ##  columns:  timestamp, altitude, latitude, longitude
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
                    #thetime = datetime.datetime.strptime(str(row[0]), "%H:%M:%S")
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
                    time_prev = thetime
                    alt_prev = row[1]
                    lat_prev = row[2]
                    lon_prev = row[3]
                d = np.array(current_packets, dtype='f')
                #print "len(d):  %d" % len(d)
        
                # list of just the altitude columns
                altitudes = d[0:, 0]
        
                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
               
                # slice off the ascending portion of the flight using the index just determined
                ascent_rates = d[0:(idx+1),0:]
                ascent_rates_pristine = d[0:(idx+1),0:]

                # Loop through the ascent rates heard thus far until we find a value where the ascent rate (ft/s) is > 5.  This eliminates
                # those early packets from the beacons prior to actual launch...we don't want those.
                loop_limit = ascent_rates.shape[0] - 1
                loop_counter = 0
                if ascent_rates.shape[0] > 0:
                    while ascent_rates[loop_counter, 3] < 5 and loop_counter < loop_limit:
                        loop_counter += 1
                
                if loop_counter > 0:
                    # We trim off those packets from the beginning of the flight that don't matter.  Only want to keep those packets from just before
                    # the balloon is launched (aka the altitude starts to rise).  If this flight has yet to start ascending, then this array will only have 
                    # one two packets.
                    ascent_rates = ascent_rates[(loop_counter-1):,0:]

                    # ascent_rates columns: altitude, latitude, longitude, elevation change rate , latitude change rate, longitude change rate
                    # This sets the first packet for our ascent_rates array to have the same altitude, latitude, and longitude change rates.
                    ascent_rates[0,3] = ascent_rates[1,3]
                    ascent_rates[0,4] = ascent_rates[1,4]
                    ascent_rates[0,5] = ascent_rates[1,5]

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
                descent_portion = balloon_data[idx:, 0:]
        
                np.set_printoptions(threshold=np.nan)
                
                # If the index of max altitude is less than the length of the of the flight...implies we've seen an alitude "hump" and are now descending
                # ...AND we've seen at least 2 packets since the max altitude value was hit...
                # ...AND the max altitude is > 14,999 feet (sanity check)...
                # ...THEN continue on and try to predict a landing location for this flight
                alt_sanity_threshold = 14999
                if idx < (balloon_data.shape[0] - 1) and descent_portion.shape[0] > 2 and altitude_slice[idx] > alt_sanity_threshold:

                    # We want to determine our last known position (from the GPS) for determining how close to the balloon/parachute we are.
                    gps_sql = """select 
                        tm::timestamp without time zone as time, 
                        round(speed_mph) as speed_mph, 
                        bearing, 
                        round(altitude_ft) as altitude_ft, 
                        round(cast(ST_Y(location2d) as numeric), 6) as latitude, 
                        round(cast(ST_X(location2d) as numeric), 6) as longitude 
                       
                        from 
                        gpsposition 
                      
                        order by 
                        tm desc 
                        limit 1;"""

                    # Execute the SQL statment and get all rows returned
                    landingcur.execute(gps_sql)
                    gpsrows = landingcur.fetchall()

                    # There should only be one row returned from the above query, but just in case we loop through each row saving our last altitude, latitude, and longitude
                    for gpsrow in gpsrows:
                        my_alt = round(float(gpsrow[3]) / 100.0) * 100.0 - 50.0
                        my_lat = gpsrow[4]
                        my_lon = gpsrow[5]

                    # Calculate the distance between this system (wherever it might be...home...vehicle...etc.) and the last packet received from the balloon
                    dist_to_balloon = distance(my_lat, my_lon, descent_portion[-1,2], descent_portion[-1, 3])

                    # If we're close to the balloon (ex. < 75 miles), then we want to adjust our prediction_floor to our current elevation.  The idea being that if 
                    # we're close to the balloon, then our current elevation is likely close to the elevation of the balloon's ultimate landing location.  ...and we 
                    # want to have the prediction algorithm calculate predicitons down to that elevation.  This should increase landing prediction accuracy a small amount.
                    if dist_to_balloon < 75:
                        prediction_floor = float(my_alt)
                    else:
                        prediction_floor = float(launchsite_elev)

                    #print callsign, ":  distance_to_balloon: ", dist_to_balloon, ",  setting prediction floor to: ", prediction_floor
                    # The last altitude we've heard
                    last_heard_altitude = float(descent_portion[-1, 1])

                    # if the launch site elevation or the prediction_floor is lower than this lowest heard altitude which includes any appended data from the prediction file 
                    # then we append a row with updated rates for altitude, lat, lon, alt_rate, lat_rate, and lon_rate
                    if prediction_floor < last_heard_altitude:

                        # Reverse the ascent_rates array so the highest altitude is first and the lowest altitude is last
                        ascent_rates_rev = ascent_rates[::-1]

                        # Some example rows from the launch site table in the database...
                        # flightid | callsign | launchsite |  lat   |   lon    | alt
                        #----------+----------+------------+--------+----------+------
                        # TEST-001 | AE0SS-13 | Wiggins    | 40.228 | -104.075 | 4500
                        # TEST-001 | KC0D-1   | Wiggins    | 40.228 | -104.075 | 4500

                        # This is the location and elevation of the launch site (aka where the balloon started its trip from)
                        origin_x = float(flightids[i, 3])
                        origin_y = float(flightids[i, 4])
                        origin_alt = float(flightids[i, 5])

                        # Difference in the elevation at the launch site and the altitude of the balloon for the first packet we heard 
                        # first_packet columns:  timestamp, altitude, latitude, longitude
                        dz = float(ascent_rates_rev[0,0]) - origin_alt

                        # calculate the mean vertical rate for the first 5 APRS packets.
                        # columns: altitude, latitude, longitude, elevation change rate , latitude change rate, longitude change rate
                        avg_ascent_rate = float(np.mean(ascent_rates_rev[0:5, 3]))

                        #print "callsign: ", callsign, "idx2: ", idx2, "   ascent_rates: ", ascent_rates[idx2:, 0:][0]
                        time_to_first = dz / avg_ascent_rate

                        # The latitude and longitude angular rates
                        latrate_to_first = (float(ascent_rates_rev[0,1]) - origin_x) / time_to_first
                        lonrate_to_first = (float(ascent_rates_rev[0,2]) - origin_y) / time_to_first

                        # columns: altitude, latitude, longitude, elevation change rate , latitude change rate, longitude change rate
                        # Append the entry for the launchsite elevation to the ascent_rates array
                        tempray = np.array([ [prediction_floor, origin_x, origin_y, avg_ascent_rate, latrate_to_first, lonrate_to_first]], dtype='f')
                        #print callsign, "   last_heard_altitude: ", last_heard_altitude, "  Appending:  ", tempray
                        ascent_rates = np.insert(ascent_rates, 0, tempray, axis=0)
                     
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
                         #thetime = datetime.datetime.strptime(str(row[0]), "%H:%M:%S")
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

                    # Here we want to compute the k-value for this parachute, weight, drag combo
                    # parachute_coef - this is the constant that represents 2m/CdA for this parachute  
                    #if last_heard_altitude < 15000:
                    #    parachute_coef = np.mean(((balloon_velocities[-1] **2) * (airdensity(balloon_altitudes[-1]) / 1000)) / g(balloon_altitudes[-1]))
                    #else:
                    parachute_coef = np.mean(((balloon_velocities **2) * (airdensity(balloon_altitudes) / 1000)) / g(balloon_altitudes))

                    # This is a list of points with the predicted velocity for various altitudes beyond the last altitude we've seen (aka the future)
                    alts = np.arange(prediction_floor / 2, balloon_altitudes[-1] + 10000, 500)
                    pred_v = np.sqrt(parachute_coef * g(alts) / (airdensity(alts) / 1000))
                    pred_v_curve = interpolate.interp1d(alts, pred_v, kind='cubic')

                    # Perform curve fitting for predictions when in the early stages of the descent.
                    p, e = curve_fit(func_x2, balloon_altitudes, balloon_velocities)

                    # Columns for prediction data:   altitude, latitude, longitude, altitude_rate, latitude_rate, longitude_rate
                    # This array is used for obtaining wind vectors at various altitude levels.
                    prediction_descent_data = np.array(ascent_rates, dtype='f')
        
                    # Columns for balloon data and descent_portion:  timestamp, altitude, latitude, longitude
                    x = float(balloon_data[-1, 2])
                    y = float(balloon_data[-1, 3])

                    # This is basically the starting altitude for the prediction.  It's the last altitude value we received from the balloon.
                    backstop = float(descent_portion[-1, 1])

                    # Loop through adding up the lat/long changes, culminating in a predicted landing location
                    step_size = 30
                    length = prediction_descent_data.shape[0]
                    function_weight = (float(last_heard_altitude) - prediction_floor) / (float(descent_portion[0, 1]) - prediction_floor)
                    k_idx = 0
                    first_time = 0
                    for k in prediction_descent_data:
                        if k[0] >= prediction_floor and k_idx > 0 and k[0] > backstop:
                           if k[0] < last_heard_altitude:
                               upper_idx = k_idx + 5
                               lower_idx = k_idx - 5
   
                               if upper_idx > length:
                                   upper_idx = length
                               if lower_idx < 0:
                                   lower_idx = 0
   
                               avg_asc_rate = np.mean(prediction_descent_data[lower_idx:upper_idx, 3])
                               delta = avg_asc_rate - k[3] 
                               #print "averaging: ", lower_idx, ":", upper_idx, "  ",  np.round(prediction_descent_data[lower_idx:upper_idx, 3])
                               #print "altitudes: ", lower_idx, ":", upper_idx, "  ",  np.round(prediction_descent_data[lower_idx:upper_idx, 0])
    
                               t = 0
                               h_range = []
                               if k[0] - backstop <= step_size:
                                   t = abs( (k[0] - backstop) / ((function_weight * func_x2(k[0], *p) + (1 - function_weight) * pred_v_curve(k[0])) + delta))
                                   #print "        alt: ", last_heard_altitude, "  k[0]: ", k[0], "  backstop: ", backstop

                               else:
                                   h_range = np.arange(backstop + step_size, k[0], step_size)
                                   for h in h_range:
                                       t += abs( (step_size) / ((function_weight * func_x2(h, *p) + (1 - function_weight) * pred_v_curve(h)) + delta))
                                   t += abs( (k[0] - h_range[-1]) / ((function_weight * func_x2(k[0], *p) + (1 - function_weight) * pred_v_curve(k[0])) + delta))
                                   #print "        alt: ", last_heard_altitude, "  k[0]: ", k[0], "  backstop: ", backstop, "  h_range[-1]: ", h_range[-1],  "  h_range: ", h_range
                            
                               dx = t * k[4]
                               dy = t * k[5]
                               x = x + dx
                               y = y + dy
                           else:
                               #print "else k[0]: ", k[0], "   first_time: ", first_time
                               if first_time == 0 and last_heard_altitude > backstop:
                                   first_time = 1

                                   upper_idx = k_idx + 5
                                   lower_idx = k_idx - 5

                                   if upper_idx > length:
                                       upper_idx = length
                                   if lower_idx < 0:
                                       lower_idx = 0

                                   avg_asc_rate = np.mean(prediction_descent_data[lower_idx:upper_idx, 3])
                                   delta = avg_asc_rate - k[3]

                                   t = 0
                                   h_range = []
                                   if last_heard_altitude - backstop <= step_size and last_heard_altitude > backstop:
                                       t = abs( (last_heard_altitude - backstop) / (balloon_velocities[-1] + delta))
                                       #print "        END:  alt: ", last_heard_altitude, "  t: ", t, "  backstop: ", backstop
                                       #print "        END:  alt: ", last_heard_altitude, "  t: ", t, "  backstop: ", backstop 
                                   else:
                                       h_range = np.arange(backstop + step_size, last_heard_altitude, step_size)
                                       for h in h_range:
                                           t += abs( (step_size) / ((function_weight * func_x2(h, *p) + (1 - function_weight) * pred_v_curve(h)) + delta))
                                       t += abs( (last_heard_altitude - h_range[-1]) / (balloon_velocities[-1] + delta))
                                       #print "        END:  alt: ", last_heard_altitude, "  t: ", t, "  backstop: ", backstop, "  h_range: ", h_range
                                       #print "        END:  alt: ", last_heard_altitude, "  t: ", t, "  backstop: ", backstop, "  h_range[-1]: ", h_range[-1],  "  h_range: ", h_range

                                   dx = t * k[4]
                                   dy = t * k[5]
                                   x += dx
                                   y += dy

                        backstop = k[0]
                        k_idx += 1
                        
                    # construct SQL for inserting the landing prediction into the landingpredictions table
                    landingprediction_sql = """insert into landingpredictions values (date_trunc('second', now())::timestamp, %s, %s, 'predicted', %s::numeric, ST_GeometryFromText('POINT(%s %s)', 4326));"""
                    landingcur.execute(landingprediction_sql, [ fid, callsign, float(parachute_coef), float(y), float(x) ])
                    landingconn.commit()

                    #print callsign, " [", descent_portion[-1,0], " alt: ", descent_portion[-1,1],  " v: ", round(balloon_velocities[-1], 2), "],   pred_floor: ", prediction_floor, "  coef: ", str(parachute_coef), "  est. lat/lon:  ", round(float(x),6), ", ", round(float(y), 6)
        
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
def runLandingPredictor(schedule, altitude_floor, e, config):
    try:
        # run the landing predictor function continuously, every "schedule" seconds.
        #while True:
        while not e.is_set():
            landingPredictor(altitude_floor, config)
            #time.sleep(schedule)
            e.wait(schedule)
        print "Prediction scheduler ended"
    except (GracefulExit, KeyboardInterrupt, SystemExit): 
        print "Prediction scheduler ended"
        pass
