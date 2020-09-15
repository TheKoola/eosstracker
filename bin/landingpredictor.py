##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020 Jeff Deaton (N6BA)
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
from inspect import getframeinfo, stack
import json

#import local configuration items
import habconfig 



#####################################
## Set this to "True" to have debugging text output when running
debug = False
#####################################


#####################################
# Function for printing out debug info
def debugmsg(message):
    if debug:
        caller = getframeinfo(stack()[1][0])
        print "%s:%d - %s" % (caller.filename.split("/")[-1], caller.lineno, message)
        sys.stdout.flush()



#####################################
# The PredictorBase Class
# 
#    class PredictorBase:
#        def __init__(self):
#        def __del__(self):
#        def func_x2(self, x, a) :
#        def func_fittedline(self, x, a, b):
#        def distance(self, lat1, lon1, lat2, lon2):
#        def getLatestPackets(self, callsign = None):
#        def processPredictions(self):
#        def predictionAlgo(self, latestpackets, launch_lat, launch_lon, launch_elev, prediction_floor):
#####################################
class PredictorBase(object):

    # This is the initial floor for the algorithm.  Prediction calculations are no longer performed for altitudes below this value.
    # This will automatically adjust later on...to the elevation of the originating launch site for the given flight
    prediction_floor = 4900

    # This is the velocity value in ft/s at the floor.  That is, how fast is the balloon traveling when it hits ground level.  Or put 
    # more mathmatically kindof our x-intercept.
    adjust = 17

    # air density with altitude
    airdensities = np.array([ [0, 23.77], [5000, 20.48], [10000, 17.56], [15000, 14.96], [20000, 12.67], [25000, 10.66],    
        [30000, 8.91], [35000, 7.38], [40000, 5.87], [45000, 4.62], [50000, 3.64], [60000, 2.26], [70000, 1.39], [80000, 0.86],    
        [90000, 0.56], [100000, 0.33], [150000, 0.037], [200000, 0.0053], [250000, 0.00065]])

    # gravitational acceleration with altitude
    gravities = np.array([ [0, 32.174], [5000, 32.159], [10000, 32.143], [15000, 32.128], [20000, 32.112], [25000, 32.097], 
        [30000, 32.082], [35000, 32.066], [40000, 32.051], [45000, 32.036], [50000, 32.020], [60000, 31.990], [70000, 31.959], 
        [80000, 31.929], [90000, 31.897], [100000, 31.868], [150000, 31.717], [200000, 31.566], [250000, 31.415] ])

    # Curves representing the change in air density and gravitational acceleration with altitude
    airdensity = interpolate.interp1d(airdensities[0:, 0], airdensities[0:,1] * 10**-4, kind='cubic')
    g = interpolate.interp1d(gravities[0:, 0], gravities[0:, 1], kind='cubic')


    ################################
    # constructor
    def __init__(self):


        debugmsg("PredictorBase instance created.")

    ################################
    # destructor
    def __del__(self):
        debugmsg("PredictorBase destructor")


    #####################################
    # Function to use for curve fitting
    def func_x2(self, x, a) :
        return a * np.power(x - self.prediction_floor, 2) + self.adjust


    #####################################
    # this is y = mx +b
    def func_fittedline(self, x, a, b):
        return a*x + b


    #####################################
    # Function to use to determine distance between two points
    def distance(self, lat1, lon1, lat2, lon2):
        lon1 = math.radians(lon1)
        lon2 = math.radians(lon2)
        lat1 = math.radians(lat1)
        lat2 = math.radians(lat2)

        # Haversine formula
        dlon = lon2 - lon1
        dlat = lat2 - lat1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        #r = 6371 # Radius of earth in kilometers. Use 3956 for miles
        r = 3956 # Radius of earth in kilometers. Use 3956 for miles

        return float(c * r)


    ################################
    # Base function for getting a list of packets for a particular callsign
    # This should return at least these columns (any additional returned by a subclass, for example, should be out on the end):  
    #     altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
    def getLatestPackets(self, callsign = None):
        return None


    ################################
    # This is the main function for calculating predictions.  
    def processPredictions(self):
        debugmsg("Starting processPredictions...")


    ##########################################################
    # The landing prediction algorithm
    #     This should only be called once the flight is descending.  
    # Arguments:
    #    latestpackets:  (list) a list of points (lat, lon, altitude) of the flight path observed thus far
    #    launch_lat:  (float) the latitude (in decimal degrees) of the launch location
    #    launch_lon:  (float) the longitude (in decimal degrees) of the launch location
    #    launch_elev:  (float) the elevation (in feet) of the launch location
    #    algo_floor:  (float) the altitude below which the prediction algorithm will no longer compute predictions.  Should be ground level near the landing area.
    #    surface_winds:  (boolean) This controls if allowances for surface winds are used as a flight descends from upper wind levels to surface wind levels
    #    wind_rates:  (list) of the surface wind components
    #    airdensity_function:  (callable) this is a callback function that accepts an altitude as input and returned the air density at that altitude.
    #
    # Returns:
    #    flightpath:  (list) list of points (lat, lon, altitude) of the predicted flight path
    #    lat:  (float) latitude of the predicted landing 
    #    lon:  (float) longitude of the predicted landing 
    #    ttl:  (float) the time remaining before touchdown (in minutes)
    #    err:  (boolean) if true, then an error occured and the variables values are invalid
    #
    def predictionAlgo(self, latestpackets, launch_lat, launch_lon, launch_elev, algo_floor, surface_winds = False, wind_rates = None, airdensity_function = None):
        debugmsg("Launch params: %.3f, %.3f, %.3f, %.3f" % (launch_lat, launch_lon, launch_elev, algo_floor))
        debugmsg("latestpackets size: %d" % latestpackets.shape[0])

        # if invalid arguments then return
        if not launch_lat or not launch_lon or not launch_elev or not algo_floor:
            return None

        # Check the airdensity function
        if airdensity_function is not None:
            if callable(airdensity_function):
                debugmsg("PredictionAlgo:  using supplied air density function.")
                ad = airdensity_function
            else:
                ad = self.airdensity
        else:
            ad = self.airdensity

        # if no packets are provided then return
        if latestpackets.shape[0] <= 0:
            return None

        # Set the prediction floor
        self.prediction_floor = algo_floor

        # slice (aka list) of just the altitude columns
        altitudes = latestpackets[0:, 1]

        # find the maximum altitude and note the index position of that value
        idx = np.argmax(altitudes)
        max_altitude = altitudes[idx]
        debugmsg("Max altitude heard thus far: %d" % max_altitude)
       
        # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
        ascent_portion = np.array(latestpackets[0:(idx+1), 1:7], dtype='f')
        descent_portion = np.array(latestpackets[idx:, 1:7], dtype='f')
        debugmsg("ascent_portion.shape: %s" % str(ascent_portion.shape))
        debugmsg("descent_portion.shape: %s" % str(descent_portion.shape))

        # Loop through the ascent rates heard thus far until we find a value where the ascent rate (ft/s) is > 5ft/s.  This eliminates
        # those early packets from the beacons prior to actual launch...we don't want those.
        loop_limit = ascent_portion.shape[0] - 1
        loop_counter = 0
        if ascent_portion.shape[0] > 0:
            while ascent_portion[loop_counter, 3] < 5 and loop_counter < loop_limit:
                loop_counter += 1
        
        if loop_counter > 0:
            # We trim off those packets from the beginning of the flight that don't matter.  Only want to keep those packets from just before
            # the balloon is launched (aka the altitude starts to rise).  If this flight has yet to start ascending, then this array will only have 
            # one two packets.
            ascent_portion = ascent_portion[(loop_counter-1):,0:]

            # This sets the first packet for our ascent_rates array to have the same altitude, latitude, and longitude change rates.
            # reference:  columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
            ascent_portion[0,3] = ascent_portion[1,3]
            ascent_portion[0,4] = ascent_portion[1,4]
            ascent_portion[0,5] = ascent_portion[1,5]

        if ascent_portion.shape[0] > 0:
            debugmsg("ascent_portion[0]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[0,0], 
                ascent_portion[0,1],
                ascent_portion[0,2],
                ascent_portion[0,3],
                ascent_portion[0,4],
                ascent_portion[0,5]
                ))
        if ascent_portion.shape[0] > 1:
            debugmsg("ascent_portion[1]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[1,0], 
                ascent_portion[1,1],
                ascent_portion[1,2],
                ascent_portion[1,3],
                ascent_portion[1,4],
                ascent_portion[1,5]
                ))

        if ascent_portion.shape[0] > 0:
            debugmsg("ascent_portion[last]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[-1,0], 
                ascent_portion[-1,1],
                ascent_portion[-1,2],
                ascent_portion[-1,3],
                ascent_portion[-1,4],
                ascent_portion[-1,5]
                ))

        if descent_portion.shape[0] > 0:
            debugmsg("descent_portion[0]:  %f, %f, %f, %f, %f, %f" % (descent_portion[0,0], 
                descent_portion[0,1],
                descent_portion[0,2],
                descent_portion[0,3],
                descent_portion[0,4],
                descent_portion[0,5]
                ))
        if descent_portion.shape[0] > 1:
            debugmsg("descent_portion[1]:  %f, %f, %f, %f, %f, %f" % (descent_portion[1,0], 
                descent_portion[1,1],
                descent_portion[1,2],
                descent_portion[1,3],
                descent_portion[1,4],
                descent_portion[1,5]
                ))

        if descent_portion.shape[0] > 0:
            debugmsg("descent_portion[last]:  %f, %f, %f, %f, %f, %f" % (descent_portion[-1,0], 
                descent_portion[-1,1],
                descent_portion[-1,2],
                descent_portion[-1,3],
                descent_portion[-1,4],
                descent_portion[-1,5]
                ))

        # To determine if this flight is descending yet...
        # 1.  find max altitude
        # 2.  split array into ascending and descending portions
        # 3.  measure length of the two arrays (i.e. ascending and descending)  
        # 4.  if the descending portion is less than 1 in length, then nope, balloon is not descending yet.

        # If the index of max altitude is less than the length of the of the flight...implies we've seen an alitude "hump" and are now descending
        # ...AND we've seen at least 2 packets since the max altitude value was hit...
        # ...AND the max altitude is > 14,999 feet (sanity check)...
        # ...AND we've got at least three packets from the ascent portion (without hearing packets on the way up we can't really predict anything)...
        # ...THEN continue on and try to predict a landing location for this flight
        alt_sanity_threshold = 14999
        if idx < (latestpackets.shape[0] - 1) and descent_portion.shape[0] > 2 and altitudes[idx] > alt_sanity_threshold and ascent_portion.shape[0] > 2:
            # The flight is now descending AND we want to process a prediction...

            debugmsg("flight is descending, processing a prediction")

            ####################################
            # START:  prepend a synthetic packet to the beginning of the flight's ascent_portion
            ####################################
            # Why?
            #
            # Look at the current vertical diagram showing the balloon flight's altitude shortly after launch.
            # ...after launch the balloon has a flight path similar to this:
            #
            #         BALLOON   <=== current balloon position (packet #4)
            # A         /
            # L        /
            # T       3   <--- we received an APRS packet here, packet #3
            # I      / 
            # T     2  <--- we received an APRS packet here, packet #2
            # U     |
            # D     |  
            # E     1  <--- we received an APRS packet here, packet #1 (this is the first packet we've heard)
            #       |
            #       |
            #-------0----------   <===== launch site elevation (aka, the prediction_floor)

            # For packets greater than #2, we have change rates for altitude, latitude, and longitude calculated.  However, for packet #1 
            # and for conditions at the launch site, #0, we don't. Packet #1 is addressed up above and is assigned the change rates
            # from packet #2.  For the prediction_floor location, however, there isn't a packet in the latestpackets list.  So we need to 
            # prepend the rates observed from the several packets just afer launch (an average) to this #0 location.
            #

            # The last altitude we've heard
            last_heard_altitude = float(descent_portion[-1, 0])

            debugmsg("last_heard_altitude: %f" % last_heard_altitude)

            # If the flight is already lower than the prediction_floor then we don't bother with this, because we're not going to calculate
            # a prediction when the flight is below the floor.  Otherwise we preappend a row with updated rates for altitude, lat, lon, 
            # alt_rate, lat_rate, and lon_rate
            if last_heard_altitude > self.prediction_floor:

                # This is the location and elevation of the launch site (aka where the balloon started its trip from)
                origin_x = launch_lat
                origin_y = launch_lon
                origin_alt = launch_elev

                # Difference in the elevation at the launch site and the altitude of the balloon for the first packet we heard 
                dz = float(ascent_portion[0,0]) - origin_alt
                debugmsg("Altitude gained from launch site to first packet: %fft" % dz)

                # Calculate the mean vertical rate for the first 5 APRS packets.
                avg_ascent_rate = float(np.mean(ascent_portion[0:5, 3]))
                debugmsg("Mean ascent rate for the first 5 packets: %fft/sec" % avg_ascent_rate) 

                # Estimate how long it took the balloon to travel from the launch site elevation to the first packet we heard
                time_to_first = dz / avg_ascent_rate
                debugmsg("Time from launch to first packet: %fs" % time_to_first)

                # Estimate the latitude and longitude angular rates
                # reference:  columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
                latrate_to_first = (float(ascent_portion[0,1]) - float(origin_x)) / time_to_first
                lonrate_to_first = (float(ascent_portion[0,2]) - float(origin_y)) / time_to_first
                #latrate_to_first = (origin_x - float(ascent_portion[0,1]) ) / time_to_first
                #lonrate_to_first = (origin_y - float(ascent_portion[0,2]) ) / time_to_first
                debugmsg("latrate_to_first: (%f - %f) / %f = %f" % (ascent_portion[0,1], origin_x, time_to_first, latrate_to_first))
                debugmsg("lonrate_to_first: (%f - %f) / %f = %f" % (ascent_portion[0,2], origin_y, time_to_first, lonrate_to_first))

                # Append the entry for the prediction_floor elevation to the ascent_portion array
                tempray = np.array([ [self.prediction_floor, origin_x, origin_y, avg_ascent_rate, latrate_to_first, lonrate_to_first ]], dtype='f')
                debugmsg("Pre-pending to ascent_portion: %f, %f, %f, %f, %f, %f" % (tempray[0,0],
                    tempray[0,1],
                    tempray[0,2],
                    tempray[0,3],
                    tempray[0,4],
                    tempray[0,5]
                    ))

                # Update the initial packet with these calculated vertical, lat, and lon rates
                ascent_portion[0,3] = avg_ascent_rate
                ascent_portion[0,4] = latrate_to_first
                ascent_portion[0,5] = lonrate_to_first

                # Add a record for the launch site itself to the beginning of our list of packets
                ascent_portion = np.insert(ascent_portion, 0, tempray, axis=0)

            ####################################
            # END:  prepend a synthetic packet to the beginning of the flight's ascent_portion
            ####################################


            ####################################
            # START:  create curves to model the current descent
            ####################################
            # Slice off just the altitudes values from this balloon flight during the descent portion of the flight only
            # columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
            balloon_altitudes = np.array(descent_portion[1:, 0], dtype='f')
            debugmsg("balloon_altitudes length: %f" % balloon_altitudes.shape[0])

            # Slice off just the vertical rate values from this balloon flight during the descent portion of the flight only
            # columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
            balloon_velocities = np.abs(np.array(descent_portion[1:, 3], dtype='f'))
            debugmsg("balloon_velocities length: %f" % balloon_velocities.shape[0])

            # Here we want to compute the k-value for this parachute, weight, drag combo
            # parachute_coef - this is the constant that represents 2m/CdA for this parachute, flight-string combo
            parachute_coef = np.mean(((balloon_velocities **2) * ad(balloon_altitudes)) / self.g(balloon_altitudes))
            debugmsg("parachute_coef: %f" % parachute_coef)

            # This is a list of points with the predicted velocity for various altitudes beyond the last altitude we've seen (aka the future)
            alts = np.arange(self.prediction_floor / 2, balloon_altitudes[-1] + 10000, 500)
            debugmsg("alts length: %f" % alts.shape[0])
            pred_v = np.sqrt(parachute_coef * self.g(alts) / ad(alts))
            pred_v_curve = interpolate.interp1d(alts, pred_v, kind='cubic')

            # Perform curve fitting for predictions when in the early stages of the descent.
            p, e = curve_fit(self.func_x2, balloon_altitudes, balloon_velocities)

            ####################################
            # END:  create curves to model the current descent
            ####################################


            ####################################
            # START:  initialize loop variables
            ####################################
            # Last heard location of the flight
            x = float(descent_portion[-1, 1])
            y = float(descent_portion[-1, 2])
            debugmsg("last heard location (x,y): %f, %f" % (x, y))

            # This is basically the starting altitude for the prediction.  It's the last altitude value we received from the flight.
            backstop = float(descent_portion[-1, 0])
            debugmsg("backstop: %f" % backstop)

            # Size of the altitude chunks (in feet) that we loop through in calculating predictions for the future.  
            # Smaller = more acccurate, but longer compute times.  30 seems to be a good compromise.
            step_size = 30
            debugmsg("stepsize: %d" % step_size)

            # Length of the ascent portion of the flight
            length = ascent_portion.shape[0]

            # The weight assigned to the two different functions used for predictions.  Essentially a precentage value based on 
            # "where" in the descent a flight is at it varies from 0 to 1.  With 1 being at the max altitude, and 0 being at the prediction_floor.
            #     Shortly after burst?  ...then apply more weight to the curve fitting function
            #     Well into the descent?  ...then apply more weight to the drag caluclation function
            function_weight = (float(last_heard_altitude) - self.prediction_floor) / (float(descent_portion[0, 0]) - self.prediction_floor)

            # Adjust the weight so that it more aggressively favors the drag calculation function instead of the curve fitting model.
            function_weight = function_weight**2

            debugmsg("function_weight: %f" % function_weight)


            # The flight is at an altitude where surface winds are taking over....
            use_surface_wind = False
            surface_exponent_weight = 2
            surface_wind_threshold = 4500 + self.prediction_floor
            surface_wind_cutoff = 2000 + self.prediction_floor
            debugmsg("surface_wind_threshold: %f, surface_wind_cutoff: %f" % (surface_wind_threshold, surface_wind_cutoff))
            if last_heard_altitude < surface_wind_threshold:

                # the list of points we're concerned during the descent that are less than the surface_wind_threshold + plus some additional margin to allow for more data points
                #     for reference:  descent_portion columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
                waypoints = descent_portion[np.where(descent_portion[:,0] < (surface_wind_threshold))]

                # Number of points
                waypoints_len = waypoints.shape[0]

                # Loop through all heard altitudes and calculate the mean wind direction and magnitude
                if waypoints_len > 1:

                    i = 1
                    w_sum = 0
                    lat_sum = 0
                    lon_sum = 0

                    # Loop through each element creating a weighting for it based on it's position in the array.
                    for n in waypoints:

                        # The weight assigned to this waypoint
                        w = i ** (surface_exponent_weight * 2)
                        debugmsg("waypoint[%d]: w=%f, %f, %f, %f, %f, %f, %f" %(i-1, w, n[0], n[1], n[2], n[3], n[4], n[5]))

                        # The waypoint multipled by the weight
                        lat = w * n[4]
                        lon = w * n[5]

                        # Running sums for computing the average (later)
                        w_sum += w
                        lat_sum += lat
                        lon_sum += lon
                        
                        # loop counter.  This determines the weight of each waypoint.
                        i += 1

                    avg_lat_rate = lat_sum / w_sum
                    avg_lon_rate = lon_sum / w_sum
                    debugmsg("surface winds.  current altitude:  %.2f, avg_lat_rate: %f, avg_lon_rate: %f" % (last_heard_altitude, avg_lat_rate, avg_lon_rate))
                    if surface_winds:
                        use_surface_wind = True
                    else:
                        debugmsg("Not using surface winds in prediction calculations")
                        use_surface_wind = False
                else:
                    use_surface_wind = False

            # Loop params
            k_idx = 0
            first_time = True

            # this is the list of points that comprise the flight path, setting to empty values prior to entering the loop
            flightpath_deltas = []
            flightpath_altitudes = []

            # This is the time to live until landing, in seconds
            ttl = 0

            ####################################
            # END:  initialize loop variables
            ####################################


            ####################################
            # START:  primary prediction calculation loop
            ####################################
            # We're here because:  a) the flight is descending, and b) conditions are such that we want to calculate a prediction.

            # Lambda function that represents our velocity prediction curve
            v = lambda altitude : function_weight * self.func_x2(altitude, *p) + (1 - function_weight) * pred_v_curve(altitude)

            # Loop through all of the heard altitudes (from the ascent portion of the flight), from lowest to highest (aka burst) 
            #for k in ascent_portion[np.where(ascent_portion[:,0] <= last_heard_altitude)]:
            #for k in ascent_portion:
            k_len = ascent_portion.shape[0]
            while k_idx < k_len and first_time:

                # The row
                k = ascent_portion[k_idx,]

                # We want to skip this section the first time through the loop.  That is for the first value of "k[0]" which should be the
                # prediction_floor, we don't want to run any calculations.  The "backstop" is therefore set to the last_heard_altitude (up above)
                # to ensure this happens.
                if k[0] >= self.prediction_floor and k_idx > 0 and k[0] > backstop:

                   # If the prior heard altitude (i.e. during the ascent) is lower than the last heard position of the flight then continue 
                   # with calcuations from one ascent waypoint to the next higher one.
                   if k[0] < last_heard_altitude:

                       upper_idx = k_idx + 5
                       lower_idx = k_idx - 5

                       if upper_idx > length:
                           upper_idx = length
                       if lower_idx < 0:
                           lower_idx = 0

                       avg_asc_rate = np.mean(ascent_portion[lower_idx:upper_idx, 3])
                       delta = avg_asc_rate - k[3] 

                       t = 0
                       h_range = []
                       if k[0] - backstop <= step_size:
                           v_0 =  v(backstop)
                           v_1 =  v(k[0])
                           v_avg = (v_0 + v_1) / 2.0
                           t = abs((k[0] - backstop) / v_avg)

                       else:
                           h_range = np.arange(backstop + step_size, k[0], step_size)
                           for h in h_range:
                               v_0 =  v(h - step_size)
                               v_1 =  v(h)
                               v_avg = (v_0 + v_1) / 2.0
                               t += abs(step_size / v_avg)

                           v_0 =  v(h_range[-1])
                           v_1 =  v(k[0])
                           v_avg = (v_0 + v_1) / 2.0
                           t += abs((k[0] - h_range[-1]) / v_avg)


                       if surface_winds:

                           # Which wind vector to use?
                           if wind_rates is None:
                               lat_wind_rate = k[4]
                               lon_wind_rate = k[5]
                               debugmsg("No wind rates given")
                           else:
                               surface_weight = (1 - (k[0] - surface_wind_cutoff) / float(surface_wind_threshold - surface_wind_cutoff))**surface_exponent_weight
                               if surface_weight > 1:
                                   surface_weight = 1
                               if surface_weight < 0:
                                   surface_weight = 0

                               if k[0] >= surface_wind_threshold:
                                   surface_weight = 0


                               lat_wind_rate = surface_weight * wind_rates[0] + (1 - surface_weight) * k[4]
                               lon_wind_rate = surface_weight * wind_rates[1] + (1 - surface_weight) * k[5]
                               debugmsg("latest alt: %f, wind[0]: %f, wind[1]: %f, k[0]: %f, surface_weight: %f, latwr: %f, lonwr: %f" % (last_heard_altitude, wind_rates[0], wind_rates[1], k[0], surface_weight, lat_wind_rate, lon_wind_rate))


                           # If this is true then the flight is already descending below the surface_wind_threshold
                           if use_surface_wind:
                               # Weighting for surface winds components.  The closer to landing, the more weight surface winds have.
                               surface_weight = (1 - (last_heard_altitude - surface_wind_cutoff) / float(surface_wind_threshold - surface_wind_cutoff))**surface_exponent_weight

                               if surface_weight > 1:
                                   surface_weight = 1
                               if surface_weight < 0:
                                   surface_weight = 0

                               # compute weighted avg of wind vectors
                               lat_rate = surface_weight * avg_lat_rate + (1 - surface_weight) * lat_wind_rate
                               lon_rate = surface_weight * avg_lon_rate + (1 - surface_weight) * lon_wind_rate
                               debugmsg("///////> surface wind weighting: %f, alt: %f, lat_rate: %f, lon_rate: %f, avg_lat_rate: %f, avg_lon_rate: %f" % (surface_weight, k[0], lat_rate, lon_rate, avg_lat_rate, avg_lon_rate))

                           # the flight has yet to descend below the surface_wind_threshold
                           else:
                               lat_rate = lat_wind_rate
                               lon_rate = lon_wind_rate 

                           dx = t * lat_rate
                           dy = t * lon_rate
                       else:
                           dx = t * k[4]
                           dy = t * k[5]

                       x += dx
                       y += dy
                       ttl += t
                       debugmsg("TOP:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
                       if k_idx == 0:
                           a = self.prediction_floor
                       else:
                           a = ascent_portion[k_idx - 1,0]
                       flightpath_deltas.append((dx, dy, ttl, a))

                   
                   else:
                       if first_time and last_heard_altitude > backstop:
                           first_time = False

                           upper_idx = k_idx + 5
                           lower_idx = k_idx - 5

                           if upper_idx > length:
                               upper_idx = length
                           if lower_idx < 0:
                               lower_idx = 0

                           avg_asc_rate = np.mean(ascent_portion[lower_idx:upper_idx, 3])
                           delta = avg_asc_rate - k[3]

                           t = 0
                           h_range = []
                           if last_heard_altitude - backstop <= step_size and last_heard_altitude > backstop:
                               v_0 =  v(backstop)
                               v_1 =  v(last_heard_altitude)
                               v_avg = (v_0 + v_1) / 2.0
                               t = abs((last_heard_altitude - backstop) / v_avg)
                           else:
                               h_range = np.arange(backstop + step_size, last_heard_altitude, step_size)
                               for h in h_range:
                                   v_0 =  v(h - step_size)
                                   v_1 =  v(h)
                                   v_avg = (v_0 + v_1) / 2.0
                                   t += abs(step_size / v_avg)

                               v_0 =  v(h_range[-1])
                               v_1 =  v(last_heard_altitude)
                               v_avg = (v_0 + v_1) / 2.0
                               t += abs((last_heard_altitude - h_range[-1]) / v_avg)

                           if surface_winds:

                               # Which wind vector to use?
                               if wind_rates is None:
                                   lat_wind_rate = k[4]
                                   lon_wind_rate = k[5]
                               else:
                                   surface_weight = (1 - (k[0] - surface_wind_cutoff) / float(surface_wind_threshold - surface_wind_cutoff))**surface_exponent_weight
                                   if surface_weight > 1:
                                       surface_weight = 1
                                   if surface_weight < 0:
                                       surface_weight = 0

                                   if k[0] >= surface_wind_threshold:
                                       surface_weight = 0

                                   lat_wind_rate = surface_weight * wind_rates[0] + (1 - surface_weight) * k[4]
                                   lon_wind_rate = surface_weight * wind_rates[1] + (1 - surface_weight) * k[5]

                               # If this is true then the flight is already descending below the surface_wind_threshold
                               if use_surface_wind:
                                   # Weighting for surface winds components.  The closer to landing, the more weight surface winds have.
                                   surface_weight = (1 - (last_heard_altitude - surface_wind_cutoff) / float(surface_wind_threshold - surface_wind_cutoff))**surface_exponent_weight

                                   if surface_weight > 1:
                                       surface_weight = 1
                                   if surface_weight < 0:
                                       surface_weight = 0

                                   # compute weighted avg of wind vectors
                                   lat_rate = surface_weight * avg_lat_rate + (1 - surface_weight) * lat_wind_rate
                                   lon_rate = surface_weight * avg_lon_rate + (1 - surface_weight) * lon_wind_rate
                                   debugmsg("///////> surface wind weighting: %f, alt: %f, lat_rate: %f, lon_rate: %f, avg_lat_rate: %f, avg_lon_rate: %f" % (surface_weight, k[0], lat_rate, lon_rate, avg_lat_rate, avg_lon_rate))

                               # the flight has yet to descend below the surface_wind_threshold
                               else:
                                   lat_rate = lat_wind_rate
                                   lon_rate = lon_wind_rate

                               dx = t * lat_rate
                               dy = t * lon_rate
                           else:
                               dx = t * k[4]
                               dy = t * k[5]

                           x += dx
                           y += dy
                           ttl += t
                           debugmsg("BOTTOM:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
                           if k_idx == 0:
                               a = self.prediction_floor
                           else:
                               a = ascent_portion[k_idx - 1,0]
                           flightpath_deltas.append((dx, dy, ttl, a))

                   # END:  if k[0] < last_heard_altitude:


                else:
                   debugmsg("NO RUN:  backstop: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, k[0], k[1], k[2], k[3], k[4], k[5]))

                # END:  if k[0] >= prediction_floor and k_idx > 0 and k[0] > backstop:


                backstop = k[0]
                k_idx += 1

            # END:  for k in ascent_portion:
                
            ####################################
            # END:  primary prediction calculation loop
            ####################################

            # The first point in the predicted flight path is the latest position of the flight
            flightpath_points = [(descent_portion[-1,1], descent_portion[-1,2], ttl, last_heard_altitude)]

            # Set the previous lat/lon points to the last value of the flightpath_points array, which should be 
            # the last position of the flight.
            prev_x = flightpath_points[-1][0] 
            prev_y = flightpath_points[-1][1]

            # Collect the points determined along the way
            # This is reversed because the prediction loop (above) runs from the prediction_floor up to the last_heard_altitude, basically calculating
            # the delta points in reverse.
            for u,v,t,a in flightpath_deltas[::-1]:
                pos_x = prev_x + u 
                pos_y = prev_y + v 
                flightpath_points.append((pos_x, pos_y, t, a))
                prev_x = pos_x
                prev_y = pos_y

            return flightpath_points

        else:
            debugmsg("Not processing a prediction, sanity checks failed")
            return None




#####################################
# The LandingPredictor Class
# 
#    class LandingPredictor:
#        def __init__(self, dbConnectionString = None, timezone = 'America/Denver', timeout = 60):
#        def __del__(self):
#        def func_x2(self, x, a) :
#        def func_fittedline(self, x, a, b):
#        def setDBConnection(self, dbstring):
#        def distance(self, lat1, lon1, lat2, lon2):
#        def setTimezone(self, timezone = 'America/Denver'):
#        def connectToDatabase(self, dbstring = None):
#        def db_getFlights(self):
#        def getLatestPackets(self, callsign = None):
#        def getGPSPosition(self):
#        def db_getPredictFile(self, flightid = '', launchsite = ''):
#        def processPredictions(self):
#        def predictionAlgo(self, latestpackets, launch_lat, launch_lon, launch_elev, prediction_floor):
#####################################
class LandingPredictor(PredictorBase):

    ################################
    # constructor
    def __init__(self, dbConnectionString = None, timezone = 'America/Denver', timeout = 60):
        super(PredictorBase, self).__init__()

        # The database connection string
        self.dbstring = dbConnectionString

        # The database connection object
        self.landingconn = None
        self.landingconn = pg.extensions.connection

        # The timezone
        self.timezone = 'America/Denver'
        if timezone:
            self.timezone = timezone

        # Time limit in minutes for when to stop calculating predictions.  If this much or greater time has eplapsed since the last packet from the 
        # flight, then don't perform a prediction.
        # Default is set to 60 mins.
        self.timeout = 60
        if timeout:
            self.timeout = timeout

        debugmsg("LandingPredictor instance created.")

    ################################
    # destructor
    def __del__(self):
        try:
            if not self.landingconn.closed:
                debugmsg("LandingPredictor destructor:  closing database connection.")
                self.landingconn.close()
        except pg.DatabaseError as error:
            print error


    ################################
    # Set the database connection string
    def setDBConnection(self, dbstring):
        # Set the database connection 
        self.dbstring = dbstring


    ################################
    # Set the timezone string for the database queries
    def setTimezone(self, timezone = 'America/Denver'):
        # set the timezone
        if timezone:
            self.timezone = timezone


    ################################
    # Function for connecting to the database
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            return False

        try:

            # If not already connected to the database, then try to connect
            if self.landingconn != None:
                if self.landingconn.closed:
                    debugmsg("Connecting to the database: %s" % self.dbstring)
                    self.landingconn = pg.connect (self.dbstring)
                    self.landingconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.landingconn.close()
            print error
            return False


    ################################
    # Function for querying the database to get a list of active flightids and the beacon's callsigns assigned to those flights.
    # The resulting list of flights and callsigns is returned
    def db_getFlights(self):

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
        try:
            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return np.array([])

            landingcur = self.landingconn.cursor()
            landingcur.execute(flightids_sql)
            rows = landingcur.fetchall()
            landingcur.close()

            if debug:
                flightlist = ""
                for r in rows:
                    flightlist += " " + r[0] + ":" + r[1]
                debugmsg("List of flights[%d]:%s" % (len(rows), flightlist))

            # columns for returned array:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
            return np.array(rows)

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            landingcur.close()
            self.landingconn.close()
            print error
            return np.array([])
        

    ################################
    # Function for querying the database to get a list of latest packets for the provided callsign
    # The resulting list of packets is returned if no callsign is given then an empty list is returned
    # columns returned in the list:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
    def getLatestPackets(self, callsign = None):

        # if a callsign wasn't provided, then return a empty numpy array
        if not callsign:
            return []
    
        # Check latest packets query.  We want to run this query first as it is much lower cost to be repeatedly running.  The 
        # idea being that we quickly check if there are any recent (< 20mins ago) packets for this callsign, if there are then continue
        # on.  Otherwise, return an empty list.  Doing this saves a lot of load on the backend database as the "get flight packets" query
        # below is much more expensive.
        check_sql = """
            select
            coalesce(extract (epoch from now() - max(a.tm)), 999999) as elapsed_secs

            from 
            packets a

            where 
            a.callsign = %s
            and a.tm > (now() - interval '06:00:00')
            and a.location2d != ''
            ;
        """

        # Execute the SQL statment and get all rows returned
        checkcur = self.landingconn.cursor()
        checkcur.execute(check_sql, [ callsign.upper() ])
        checkrows = checkcur.fetchall()
        checkcur.close()

        if len(checkrows) > 0:
            elapsed_mins = checkrows[-1][0] / 60.0
            # If the last heard packet is > 20mins old, return zero rows.  We don't want to process a landing prediction for a flight that is over/stale/lost/etc.
            if elapsed_mins > 20:
                debugmsg("Last packet for %s is > 20mins old: %dmins." % (callsign, elapsed_mins))
                return []
        else:
            return []


        # The SQL statement to get the latest packets for this callsign
        # columns:  timestamp, altitude, latitude, longitude
        # Note:  only those packetst that might have occured within the last 6hrs are queried.
        latestpackets_sql = """
            select
                y.packet_time,
                round(y.altitude) as altitude,
                round(y.lat, 6) as latitude,
                round(y.lon, 6) as longitude,
                case when y.delta_secs > 0 then
                    (y.altitude - y.previous_altitude) / y.delta_secs
                else
                    0
                end as vert_rate,
                case when y.delta_secs > 0 then
                    (y.lat - y.previous_lat) / y.delta_secs
                else
                    0
                end as lat_rate,
                case when y.delta_secs > 0 then
                    (y.lon - y.previous_lon) / y.delta_secs
                else
                    0
                end as lon_rate,
                round(y.elapsed_secs / 60.0) as elapsed_mins,
                round(y.temperature_k, 6) as temperature_k,
                round(y.pressure_pa, 6) as pressure_pa,

                -- Air density (for our purposes needs to be in English units...i.e. slugs/ft^3)
                case when y.temperature_k > 0 then
                    round((y.pressure_pa / (287.05 * y.temperature_k)) / 515.2381961366, 8)
                else
                    NULL
                end as air_density_slugs_per_ft3

                from 
                (
                    select
                        c.thetime,
                        c.packet_time,
                        c.callsign,
                        c.flightid,
                        c.altitude,
                        c.comment,
                        c.symbol,
                        c.speed_mph,
                        c.bearing,
                        c.location2d,
                        c.lat,
                        c.lon,
                        c.temperature_k,
                        c.pressure_pa,
                        c.ptype, 
                        c.hash,
                        c.raw,
                        lag(c.altitude, 1) over(order by c.packet_time)  as previous_altitude,
                        lag(c.lat, 1) over (order by c.packet_time) as previous_lat,
                        lag(c.lon, 1) over (order by c.packet_time) as previous_lon,
                        extract ('epoch' from (c.packet_time - lag(c.packet_time, 1) over (order by c.packet_time))) as delta_secs,
                        extract ('epoch' from (now()::timestamp - c.thetime)) as elapsed_secs,
                        c.sourcename,
                        c.heardfrom,
                        c.freq,
                        c.channel,
                        c.source

                        from (
                                select 
                                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                                case
                                    when a.raw similar to '%%[0-9]{6}h%%' then
                                        date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone %s)::time)::time without time zone
                                    else
                                        date_trunc('milliseconds', a.tm)::time without time zone
                                end as packet_time,
                                a.callsign, 
                                f.flightid,
                                a.altitude,
                                a.comment, 
                                a.symbol, 
                                a.speed_mph,
                                a.bearing,
                                a.location2d,
                                cast(ST_Y(a.location2d) as numeric) as lat,
                                cast(ST_X(a.location2d) as numeric) as lon,
                                NULL as sourcename,
                                NULL as heardfrom,
                                a.frequency as freq,
                                a.channel,

                                -- The temperature (if available) from any KC0D packets
                                case when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                    round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                                else
                                    NULL
                                end as temperature_k,

                                -- The pressure (if available) from any KC0D packets
                                case
                                    when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                        round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                                    else
                                        NULL
                                end as pressure_pa,
                                a.ptype,
                                a.hash,
                                a.raw,
                                a.source,
                                dense_rank () over (partition by 
                                    a.hash,
                                    date_trunc('minute', a.tm)
                                    --floor(extract(epoch from a.tm) / 30) * 30

                                    order by 
                                    a.tm asc
                                )

                                from 
                                packets a,
                                flights f,
                                flightmap fm

                                where 
                                a.location2d != '' 
                                and a.tm > (now() - interval '06:00:00')
                                and fm.flightid = f.flightid
                                and f.active = 'y'
                                and a.callsign = fm.callsign
                                and a.altitude > 0
                                and a.callsign = %s

                                order by a.tm asc

                        ) as c
                        
                        where 
                        c.dense_rank = 1

                    ) as y
                    left outer join
                    (
                        select
                        r.tm, 
                        r.flightid,
                        r.callsign, 
                        r.ttl

                        from 
                        (
                            select
                            l.tm,
                            l.flightid,
                            l.callsign,
                            l.ttl,
                            dense_rank() over (partition by l.flightid, l.callsign order by l.tm desc)

                            from
                            landingpredictions l

                            where
                            l.tm > now() - interval '00:10:00'
                            and l.ttl is not null

                            order by

                            l.flightid,
                            l.callsign
                        ) as r

                        where 
                        r.dense_rank = 1

                        order by
                        r.flightid, 
                        r.callsign,
                        r.tm
                    ) as lp
                    on lp.flightid = y.flightid and lp.callsign = y.callsign

                order by
                    y.callsign,
                    y.packet_time asc
            ;
        """
                          
        try:
            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return []

            # Execute the SQL statment and get all rows returned
            landingcur = self.landingconn.cursor()
            landingcur.execute(latestpackets_sql, [ self.timezone, callsign.upper() ])
            rows = landingcur.fetchall()
            landingcur.close()

            if len(rows) > 0:
                # If the last heard packet is > 20mins old, return zero rows....because we don't want to process a landing prediction for a flight that is over/stale/lost/etc.
                if rows[-1][7] > 20:
                    debugmsg("Last packet for %s is > 20mins old: %dmins." % (callsign, rows[-1][7]))
                    return []

            return rows

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            landingcur.close()
            self.landingconn.close()
            print error
            return []


    ################################
    # This will query the database looking for weather stations near the latest landing prediction and/or the current
    # location (from GPS).  
    # This will return a list containing two surface wind values:
    #    returned tuple:  [ lat_wind_rate, lon_wind_rate ], validity
    #
    def getSurfaceWinds(self, flightid):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase() or flightid is None:
            return ([], False)

        try: 
            validity = False

            # Execute the SQL statment and get all rows returned
            wxcur = self.landingconn.cursor()

            # Get the latest GPS coords for a flight
            lastlandingprediction_sql = """
                select 
                    l.tm as thetime,
                    st_y(l.location2d) as lat,
                    st_x(l.location2d) as lon

                from
                    landingpredictions l

                where 
                    l.flightid = %s
                    and l.tm > (now() - interval '06:00:00')
                    and l.tm > now()::date

                order by
                    l.tm desc 
                
                limit 1
                ;
            """

            wxcur.execute(lastlandingprediction_sql, [ flightid ])
            rows = wxcur.fetchall()

            # notes on wind directions...
            # wind heading:  this is the direction the wind is blowing "from".  Basically the direction a weather vane will point when placed in the wind.
            # wind bearing:  this is the direction the wind is blowing "to".  
            windrates = []

            # if there were rows returned then proceed to get the surface winds at that location
            if len(rows) > 0:
                position = [ float(rows[0][1]), float(rows[0][2]) ]
                #print "position: ", position
                wx_sql = """
                    select 
                        d.weighted_avg_lat / (5280 * 24901.461 / 360) as lat_s,
                        d.weighted_avg_lon / (5280 * 2 * pi() * 3963.0 * cos(radians(%s)) / 360) as lon_s,
                        round(sqrt(d.weighted_avg_lat^2 + d.weighted_avg_lon^2), 2) as wind_magnitude_fts,
                        round(sqrt(d.weighted_avg_lat^2 + d.weighted_avg_lon^2) * 3600.0/5280.0, 2) as wind_magnitude_mph,

                        case
                        -- Quadrant I
                        when d.weighted_avg_lat > 0 and d.weighted_avg_lon > 0 then
                            round(degrees(atan(d.weighted_avg_lon / d.weighted_avg_lat))+ 180.0)

                       -- Quadrant II
                        when d.weighted_avg_lat < 0 and d.weighted_avg_lon > 0 then
                            round(degrees(atan(-d.weighted_avg_lat / d.weighted_avg_lon)) + 90.0 + 180.0)

                       -- Quadrant III
                        when d.weighted_avg_lat < 0 and d.weighted_avg_lon < 0 then
                            round(degrees(atan(d.weighted_avg_lon / d.weighted_avg_lat)) + 180.0 - 180.0)

                       -- Quadrant IV
                        when d.weighted_avg_lat > 0 and d.weighted_avg_lon < 0 then
                            round(degrees(atan(d.weighted_avg_lat / -d.weighted_avg_lon)) + 270.0 - 180.0)
                        else
                            NULL
                        end as wind_heading,

                        case
                        -- Quadrant I
                        when d.weighted_avg_lat > 0 and d.weighted_avg_lon > 0 then
                            round(degrees(atan(d.weighted_avg_lon / d.weighted_avg_lat)))

                        -- Quadrant II
                        when d.weighted_avg_lat < 0 and d.weighted_avg_lon > 0 then
                            round(degrees(atan(-d.weighted_avg_lat / d.weighted_avg_lon)) + 90.0)

                        -- Quadrant III
                        when d.weighted_avg_lat < 0 and d.weighted_avg_lon < 0 then
                            round(degrees(atan(d.weighted_avg_lon / d.weighted_avg_lat)) + 180.0)

                        -- Quadrant IV
                        when d.weighted_avg_lat > 0 and d.weighted_avg_lon < 0 then
                            round(degrees(atan(d.weighted_avg_lat / -d.weighted_avg_lon)) + 270.0)
                        else
                            NULL
                        end as wind_bearing

                    from 
                    (select 
                        avg(c.wind_fts_lat) as wind_avg_fts_lat,
                        avg(c.wind_fts_lon) as wind_avg_fts_lon,
                        sum(c.wind_fts_lat * 100 / (1.12 ^ c.distance_miles)) / sum(100 / (1.12 ^ c.distance_miles)) as weighted_avg_lat,
                        sum(c.wind_fts_lon * 100 / (1.12 ^ c.distance_miles)) / sum(100 / (1.12 ^ c.distance_miles)) as weighted_avg_lon

                    from
                        (select
                            b.thetime,
                            b.callsign,
                            b.lat,
                            b.lon,
                            round(b.distance, 3) as distance_miles,
                            b.wind_magnitude_mph,
                            b.wind_angle_bearing,
                            b.wind_angle_heading,
                            round((b.wind_magnitude_mph * (5280.0 / 3600.0) * cos(radians(b.wind_angle_bearing)))::numeric, 6) as wind_fts_lat,
                            round((b.wind_magnitude_mph * (5280.0 / 3600.0) * sin(radians(b.wind_angle_bearing)))::numeric, 6) as wind_fts_lon

                            from
                                (select
                                    date_trunc('second', a.tm)::time without time zone as thetime,
                                    a.callsign, 
                                    round(ST_Y(a.location2d)::numeric, 6) as lat,
                                    round(ST_X(a.location2d)::numeric, 6) as lon,
                                    cast(ST_DistanceSphere(ST_GeomFromText('POINT(%s %s)',4326), a.location2d)*.621371/1000 as numeric) as distance,
                                    case
                                        when a.ptype = '@' and a.raw similar to '%%_[0-9]{3}/[0-9]{3}g%%' then 
                                            case when to_number(substring(a.raw from position('_' in a.raw) + 1 for 3), '999') <= 180 then
                                                to_number(substring(a.raw from position('_' in a.raw) + 1 for 3), '999') + 180
                                            else
                                                to_number(substring(a.raw from position('_' in a.raw) + 1 for 3), '999') - 180
                                            end
                                        else
                                            NULL
                                    end as wind_angle_bearing,
                                    case
                                        when a.ptype = '@' and a.raw similar to '%%_[0-9]{3}/[0-9]{3}g%%' then 
                                            to_number(substring(a.raw from position('_' in a.raw) + 1 for 3), '999')
                                        else
                                            NULL
                                    end as wind_angle_heading,
                                    case
                                        when a.ptype = '@' and a.raw similar to '%%_[0-9]{3}/[0-9]{3}g%%' then 
                                            to_number(substring(a.raw from position('_' in a.raw) + 5 for 3), '999')
                                        else
                                            NULL
                                    end as wind_magnitude_mph,
                                    a.raw

                                from
                                    packets a
                                    left outer join 
                                        (select
                                            max(a.tm) as thetime,
                                            a.callsign

                                        from
                                            packets a

                                        where 
                                            a.tm > (now() - interval '02:00:00')
                                            and a.ptype = '@'
                                            and a.raw similar to '%%_[0-9]{3}/[0-9]{3}g%%' 

                                        group by
                                            a.callsign

                                        order by
                                            thetime asc
                                        ) as a1
                                        on a.tm = a1.thetime and a.callsign = a1.callsign

                                where 
                                    a1.callsign is not null
                                    and a.ptype = '@'
                                    and a.tm > (now() - interval '02:00:00')

                                order by
                                    a.tm asc
                                ) as b

                            where 
                                b.wind_angle_bearing is not null
                                and b.wind_magnitude_mph is not null
                                and b.distance < 75 

                            order by 
                                distance_miles asc

                        ) as c
                    ) as d
                    ;
                """
                wxcur.execute(wx_sql, [ position[0], position[1], position[0] ])
                wxrows = wxcur.fetchall()
                if len(wxrows) > 0:
                    if wxrows[0][0] is not None and wxrows[0][1] is not None and wxrows[0][3] is not None and wxrows[0][4] is not None and wxrows[0][5] is not None:
                        windrates = [ float(wxrows[0][0]), float(wxrows[0][1]), float(wxrows[0][3]), float(wxrows[0][4]), float(wxrows[0][5]) ]
                        validity = True
                        debugmsg("windrates[0]: %f, windrates[1]: %f " % (windrates[0], windrates[1]))
                    else:
                        windrates = []
                        validity = False

            wxcur.close()
            return (windrates, validity)

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            wxcur.close()
            self.landingconn.close()
            print error
            return ([], False)


    ################################
    # Function to query the database for those stations nearest to a predicted landing location (ranked by distance), 
    # and compute a weighted average of the estimated elevation at the predicted landing 
    def getLandingElevation(self, balloon_callsign, distance):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase() or balloon_callsign is None or distance is None: 
            return 0.0

        if distance <= 0:
            return 0.0

        try: 
            # database cursor
            elev_cur = self.landingconn.cursor()

            # Get estimated elevation near the predicted landing
            elevation_sql = """
                select
                    z.balloon,
                    round(sum(z.altitude * z.weight) / sum(z.weight)) as avg_weighted_elevation,
                    round(avg(z.altitude)) as avg_elevation

                from
                    (
                    select
                        date_trunc('second', a.tm)::timestamp without time zone as station_time,
                        lp.callsign as balloon,
                        a.callsign,
                        a.altitude,
                        round(cast(st_y(a.location2d) as numeric), 4) as station_lat,
                        round(cast(st_x(a.location2d) as numeric), 4) as station_lon,
                        round(cast(st_y(lp.location2d) as numeric), 4) as landing_lat,
                        round(cast(st_x(lp.location2d) as numeric), 4) as landing_lon,
                        round(cast(ST_DistanceSphere(lp.location2d, a.location2d)*.621371/1000 as numeric),4) as dist,
                        10000 / exp(cast(ST_DistanceSphere(lp.location2d, a.location2d)*.621371/1000 as numeric)) as weight,
                        rank () over (partition by 
                            lp.callsign,
                            a.callsign
                            order by
                            ST_DistanceSphere(lp.location2d, a.location2d) asc,
                            a.tm desc
                        ) as station_rank

                    from
                        (
                            select
                                c.tm,
                                c.callsign,
                                c.location2d,
                                c.altitude,
                                c.symbol

                                from (
                                        select 
                                        t.tm,
                                        t.callsign, 
                                        t.altitude,
                                        t.location2d,
                                        t.symbol,
                                        dense_rank () over (partition by 
                                            t.callsign

                                            order by 
                                            t.tm desc
                                        )

                                        from 
                                        packets t

                                        where 
                                        t.location2d != ''
                                        and t.altitude > 0
                                        and t.tm > (now() - interval '06:00:00')
                                        and t.symbol not in ('/''', '/O', '/S', '/X', '/^', '/g', '\O', 'O%%', '\S', 'S%%', '\^', '^%%')

                                        order by 
                                        t.tm asc

                                ) as c

                                where
                                c.dense_rank = 1
                        ) as a,
                        flights f,
                        flightmap fm
                        left outer join
                        (
                            select
                                l.tm as thetime,
                                l.flightid,
                                l.callsign,
                                l.location2d,
                                rank () over (partition by l.flightid, l.callsign order by l.tm desc)

                            from
                                landingpredictions l

                            where
                                l.tm > (now() - interval '06:00:00')

                            order by
                                thetime desc,
                                l.flightid,
                                l.callsign
                        ) as lp
                        on lp.flightid = fm.flightid and lp.callsign = fm.callsign

                    where
                        lp.callsign is not null
                        and lp.rank = 1
                        and a.tm > (now() - interval '23:59:59')
                        and fm.flightid = f.flightid
                        and f.active = 'y'
                        and a.callsign != fm.callsign
                        and fm.callsign = %s
                        and cast(ST_DistanceSphere(lp.location2d, a.location2d)*.621371/1000 as numeric) < %s

                    order by
                        lp.callsign,
                        a.callsign,
                        station_rank
                    ) as z

                where
                    z.station_rank = 1
                    
                group by
                    z.balloon

                order by
                    z.balloon
                ;
            """

            # Execute the SQL query
            # Parameters:  balloon callsign, maximum distance a station can be from the predicted landing to be computed in the estimated elevation
            debugmsg("Executing nearby station query with balloon_callsign=%s and distance=%f" % (balloon_callsign, distance))
            #debugmsg("Nearby station query" + elevation_sql % (balloon_callsign, str(distance)))
            elev_cur.execute(elevation_sql, [ balloon_callsign, distance ])

            # fetch all the rows returned
            rows = elev_cur.fetchall()
            
            if debug:
                print "landing elevation rows[", len(rows), "]: ", rows

            # if there were rows returned then proceed to return the estimated elevation near the landing location
            if len(rows) > 0:
                elevation = rows[0][1]
            else:
                elevation = 0

            # Close the database cursor
            elev_cur.close()

            # return the elevation
            return elevation

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            elev_cur.close()
            self.landingconn.close()
            print error
            return 0.0


    ################################
    # Function to query the database for latest GPS position and return an object containing alt, lat, lon.
    def getGPSPosition(self):
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


        gpsposition = {
                "altitude" : 0.0,
                "latitude" : 0.0,
                "longitude" : 0.0,
                "isvalid" : False
                }
        try:

            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return gpsposition

            # Execute the SQL statment and get all rows returned
            landingcur = self.landingconn.cursor()
            landingcur.execute(gps_sql)
            gpsrows = landingcur.fetchall()
            landingcur.close()

            # There should only be one row returned from the above query, but just in case we loop through each row saving our 
            # last altitude, latitude, and longitude
            if len(gpsrows) > 0:
                for gpsrow in gpsrows:
                    my_alt = round(float(gpsrow[3]) / 100.0) * 100.0 - 50.0
                    my_lat = gpsrow[4]
                    my_lon = gpsrow[5]

                gpsposition = {
                        "altitude" : float(my_alt),
                        "latitude" : float(my_lat),
                        "longitude" : float(my_lon),
                        "isvalid" : True
                        }

                debugmsg("GPS position: %f, %f, %f, isvalid: %d" % (gpsposition["altitude"], gpsposition["latitude"], gpsposition["longitude"], gpsposition["isvalid"]))

            return gpsposition

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            landingcur.close()
            self.landingconn.close()
            print error
            return gpsposition


    ################################
    # Get a list of rows from a predict file, if it was loaded into the database
    def db_getPredictFile(self, flightid = '', launchsite = ''):

        # if the flightid or the launchsite wasn't given, then return an empty list
        if not flightid or not launchsite:
            return []

        # SQL to query flight prediction records for the flightid
        prediction_sql = """
            select 
            d.altitude, 
            d.latitude, 
            d.longitude 

            from 
            predictiondata d,
                (select 
                f.flightid, 
                p.launchsite, 
                max(p.thedate) as thedate 
            
                from 
                flights f, 
                predictiondata p 
            
                where 
                p.flightid = f.flightid 
                and f.active = 't' 
                and p.launchsite = f.launchsite

                group by 
                f.flightid, 
                p.launchsite 

                order by 
                f.flightid) as l

            where 
            d.flightid = %s
            and d.launchsite = %s
            and d.thedate = l.thedate
            and l.flightid = d.flightid
            and l.launchsite = d.launchsite


            order by 
            d.thedate, 
            d.thetime asc
            ;
        """

        try:
            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return np.array([])

            # Execute the SQL statment and get all rows returned
            #     For reference: columns for flightids: flightid, callsign, launchsite, lat, lon, alt
            landingcur = self.landingconn.cursor()
            landingcur.execute(prediction_sql, [ flightid, launchsite ])
            rows = landingcur.fetchall()
            landingcur.close()

            debugmsg("Predict file length: %d" % len(rows))
            if len(rows) > 0:
                debugmsg("Predict file last: %f, %f, %f" % (rows[-1][0], rows[-1][1], rows[-1][2]))

            return np.array(rows)

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            landingcur.close()
            self.landingconn.close()
            print error
            return np.array([])


    ################################
    # This is the main function for calculating predictions.  It will loop through all callsigns on active flights creating landing predictions for each.
    def processPredictions(self):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return False

        if self.landingconn.closed:
            return False

        # Database cursor
        landingcur = self.landingconn.cursor()

        # get list of active flightids/callsign combo records
        # columns:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
        flightids = self.db_getFlights()

        try:

            # Grab the configuration and check if "Use payload air density" key has been enabled
            try:
                with open('/eosstracker/www/configuration/config.txt') as json_data:
                    config = json.load(json_data)
            except:
                # Otherwise, we don't use the air density from the KC0D payloads
                config = { "airdensity" : "off" }

            # Make sure the airdensity key is present, otherwise set it to "off"
            if "airdensity" not in config:
                config["airdensity"] = "off"


            # Loop through each record creating a prediction
            for rec in flightids:
            
                # this is the flightid
                fid = rec[0]

                # callsign
                callsign = rec[1]

                debugmsg("============ start processing: %s : %s ==========" % (fid, callsign))

                # launchsite particulars
                launchsite = { 
                        "flightid" : str(fid), 
                        "name" : str(rec[2]),
                        "lat" : float(rec[3]),
                        "lon" : float(rec[4]),
                        "elevation" : float(rec[5])
                        }
                if debug:
                    print "Launchsite info: ", launchsite

                # This is the default for where the prediction "floor" is placed.  Landing predictions won't use altitude values below this.
                debugmsg("Setting initial landing prediction elevation to launchsite elevation: %d" % launchsite['elevation'])
                landingprediction_floor = launchsite['elevation']

                # Get a list of the latest packets for this callsign
                # latestpackets columns:  
                #    timestamp, 
                #    altitude, 
                #    latitude, 
                #    longitude, 
                #    altitude_change_rate, 
                #    latitude_change_rate, 
                #    longitude_change_rate, 
                #    elapsed_mins
                latestpackets =  np.array(self.getLatestPackets(callsign))
                debugmsg("latestpackets.shape: %s" % str(latestpackets.shape))

                # Have there been any packets heard from this callsign yet? 
                if latestpackets.shape[0] > 0:
                    debugmsg("latestpackets[0]:  %s, %f, %f, %f, %f, %f, %f, %f" % (latestpackets[0,0], 
                        latestpackets[0,1],
                        latestpackets[0,2],
                        latestpackets[0,3],
                        latestpackets[0,4],
                        latestpackets[0,5],
                        latestpackets[0,6],
                        latestpackets[0,7]
                        ))
                    debugmsg("latestpackets[-1]:  %s, %f, %f, %f, %f, %f, %f, %f" % (latestpackets[-1,0], 
                        latestpackets[-1,1],
                        latestpackets[-1,2],
                        latestpackets[-1,3],
                        latestpackets[-1,4],
                        latestpackets[-1,5],
                        latestpackets[-1,6],
                        latestpackets[-1,7]
                        ))
                # ...if no packets heard, then return.
                else:
                    debugmsg("No packets heard from this callsign: %s" % callsign)
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # Timestamp of the last packet we've heard from the flight
                elapsed_mins = latestpackets[-1, 7]
                debugmsg("Elapsed time since last packet[%s:%s]: %d mins" %(fid, callsign, elapsed_mins))

                # If amount of elapsed time since the last packet from the flight is greater than our timeout value, then we abort and exit.
                # No sense in creating a prediction for a flight that is over.
                if elapsed_mins > self.timeout:
                    debugmsg("Elapsed time (%d mins) greater than timeout (%d mins), not processing prediction." %(elapsed_mins, self.timeout))
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # slice (aka list) of just the altitude columns
                altitudes = latestpackets[0:, 1]

                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
                debugmsg("processPredictions: Max altitude heard thus far: %d" % max_altitude)

                # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
                ascent_portion = np.array(latestpackets[0:(idx+1), 1:], dtype='f')
                descent_portion = np.array(latestpackets[idx:, 1:], dtype='f')
                debugmsg("processPredictions: ascent_portion.shape: %s" % str(ascent_portion.shape))
                debugmsg("processPredictions: descent_portion.shape: %s" % str(descent_portion.shape))
     
                if descent_portion.shape[0] > 2:
                    is_descending = True
                else:
                    is_descending = False


                # The flight is descending...and we want to process a prediction
                if is_descending:

                    ####################################
                    # START:  adjust the prediction floor
                    ####################################
                    # If we're close to the balloon (ex. < 35 miles), then we want to adjust our prediction_floor to our current elevation.  
                    # The idea being that if we're close to the balloon, then our current elevation is likely close to the elevation of the 
                    # balloon's ultimate landing location.  ...and we want to have the prediction algorithm calculate predicitons down to 
                    # that elevation.  This should increase landing prediction accuracy a small amount.

                    # Get our latest position
                    gpsposition = self.getGPSPosition()

                    gps_estimate = False
                    if gpsposition['isvalid']:
                        # Calculate the distance between this system (wherever it might be...home...vehicle...etc.) and the last packet 
                        # received from the balloon
                        dist_to_balloon = self.distance(
                                gpsposition['latitude'], 
                                gpsposition['longitude'], 
                                descent_portion[-1, 1], 
                                descent_portion[-1, 2]
                                )

                        # If we're close to the balloon, then set the prediction floor to that elevation
                        if dist_to_balloon < 30:
                            debugmsg("Current location < 30 miles from the current flight, using GPS for landing prediction elevation")
                            landingprediction_floor = float(gpsposition['altitude'])
                            gps_estimate = True

                    # If we were unable to get an estimate elevation from the brick's GPS, then then query the database for nearby stations
                    if gps_estimate == False:
                        debugmsg("Checking for stations near the landing prediction to estimate landing prediction elevation")
                        estimate = self.getLandingElevation(callsign, 30)
                        if estimate > 0:
                            landingprediction_floor = float(estimate)

                    debugmsg("Prediction floor set to: %f" % landingprediction_floor)

                    ####################################
                    # END:  adjust the prediction floor
                    ####################################


                    ####################################
                    # START:  get surface winds 
                    ####################################
                    # This will get an estimate of the surface winds in the area of a prior landing prediction.
                    # If this is the first time through (aka there isn't a prior landing prediction), then the 
                    # getSurfaceWinds function retuns "None" for winds.

                    # Get the surface winds at the landing location:
                    winds, validity = self.getSurfaceWinds(fid)

                    ####################################
                    # END:  get surface winds
                    ####################################
                    


                    ####################################
                    # START:  Check if there were KC0D airdensity values
                    ####################################

                    # Only use the air density from the kc0d payloads if the option is explictly set to true
                    if config["airdensity"] == "on":

                        debugmsg("Airdensity option was set to ON.")

                        # slice (aka list) off just the altitude and air_density columns
                        ad = np.array(ascent_portion[0:, [0,9]], dtype='float64')

                        # Check that the values aren't just a bunch of NULL's
                        num = 0
                        for alt, d in ad:
                            if np.isnan(d):
                                num += 1

                        debugmsg("Percentage of NULL data points from payload measured air density: %.2f%%." % (100 * num / ad.shape[0]))

                        # Check that the number of NULLs is minimal (ex. < 5%)
                        if num / ad.shape[0] < .05 and ad.shape[0] > 3:

                            debugmsg("Using payload measured air density.")

                            # Beginning and ending altitudes for flight air densities
                            beginning_alt = ad[0,0]
                            ending_alt = ad[-1, 0]

                            # now find the splice points for inserting the air densities from the flight in to the standard engineering defined ones.
                            # starting splice point
                            start_splice_idx = 0
                            for alt, d in self.airdensities:
                                if alt > beginning_alt:
                                    break
                                start_splice_idx += 1

                            # ending splice point
                            end_splice_idx = self.airdensities.shape[0]
                            for alt, d in self.airdensities[::-1]:
                                if alt < ending_alt:
                                    break
                                end_splice_idx -= 1

                            # Adjust for the fact that self.airdensities is in 10^-4 values.
                            temp_ad = np.copy(self.airdensities)
                            temp_ad[:,1] *= 10**-4

                            # splice together the various pieces to build the array of air densities 
                            temp1 = temp_ad[0:start_splice_idx, 0:]
                            temp2 = np.concatenate((temp1, ad), axis=0)
                            if end_splice_idx < self.airdensities.shape[0] - 1:
                                temp3 = np.concatenate((temp2, temp_ad[end_splice_idx:, 0:]), axis=0)

                            # Remove duplicate values from the array
                            temp4 = []
                            prev_alt = -99
                            for alt,den in temp3:
                                if alt != prev_alt:
                                    temp4.append([alt, den])
                                prev_alt = alt

                            # Finally convert the resulting list to a numpy array
                            final_air_densities = np.array(temp4)

                            # Catch any values errors that occur and fallback to using the pre-calculated air desnsity values.
                            try:
                                # Create a curve that represents the air density
                                airdensity_curve = interpolate.interp1d(final_air_densities[0:,0], final_air_densities[0:,1], kind='cubic')

                            except ValueError as e:
                                debugmsg("ValueError in creating interpolated curve for air density: {}".format(e))
                                debugmsg("Falling back to using pre-calculated air density instead of payload measured values.")
                                airdensity_curve = self.airdensity


                        # Otherwise, we just use the standard engineering air densities
                        else:
                            debugmsg("Using pre-calculated air density instead of payload measured values.")
                            airdensity_curve = self.airdensity
                    else:
                        debugmsg("kc0dairdensity configuration setting set not true, skipping airdensity calcs.")
                        airdensity_curve = self.airdensity


                    ####################################
                    # END:  airdensity section
                    ####################################



                    ####################################
                    # START:  compute the landing prediction
                    ####################################
                    # If we're unable to estimate the surface winds, then just run a "regular" prediction without winds
                    # However, in either case (surface winds or not) we only want to process a single landing prediction so the javascript/map display
                    # will only display a single 'X' on the map.

                    if not validity:
                        winds = None
                        wind_text = None
                        predictiontype = "predicted"

                        # Call the prediction algo
                        debugmsg("Running prediction regular prediction")
                        flightpath = self.predictionAlgo(latestpackets, launchsite["lat"], launchsite["lon"], launchsite["elevation"], landingprediction_floor, surface_winds = True, airdensity_function = airdensity_curve)
                    else:
                        wind_text = "ARRAY[" + str(round(winds[2])) + ", " + str(round(winds[3])) + ", " + str(round(winds[4])) + "]"
                        predictiontype = "wind_adjusted"

                        # Call the prediction algo
                        debugmsg("Running prediction that indludes calcualted surface winds.  winds[0]: %f, winds[1]: %f" % (winds[0], winds[1]))
                        flightpath = self.predictionAlgo(latestpackets, launchsite["lat"], launchsite["lon"], launchsite["elevation"], landingprediction_floor, surface_winds = True, wind_rates = winds, airdensity_function = airdensity_curve)

                    ####################################
                    # END:  compute the landing prediction
                    ####################################



                    ####################################
                    # START:  insert predicted landing record into the database
                    ####################################
                    # Set the initial value of the LINESTRING text to nothing.
                    linestring_text = ""
                    array_text = ""
                    m = 0


                    # If there was a prediction calculated
                    if flightpath:
                        # Now loop through each of these points and create the LINESTRING
                        for u,v,t,a in flightpath:
                            if m > 0:
                                linestring_text = linestring_text + ", "
                                array_text = array_text + ", "
                            linestring_text = linestring_text + str(round(v, 6)) + " " + str(round(u, 6))
                            array_elem = "[" + str(round(u,6)) + ", " + str(round(v,6)) + ", " + str(round(t,4)) + ", " + str(round(a)) + "]"
                            array_text = array_text + array_elem
                            m += 1
                        linestring_text = "LINESTRING(" + linestring_text + ")"
                        array_text = "ARRAY[" + array_text + "]"
                        if m < 2:
                            linestring_text = None
                            array_text = None

                        # The SQL for inserting this prediction record into the database
                        landingprediction_sql = """ insert into landingpredictions (tm, flightid, callsign, thetype, coef_a, location2d, flightpath, ttl """ + (", patharray " if array_text else "") + (", winds " if wind_text else "") + """) values (now(), %s, %s, %s, %s::numeric, ST_GeometryFromText('POINT(%s %s)', 4326), ST_GeometryFromText(%s, 4326), %s::numeric """ + (", " + array_text if array_text else "") + (", " + wind_text if wind_text else "") +  """);"""

                        ts = datetime.datetime.now()

                        #debugmsg("SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2])))))
                        #print "SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2]))))

                        debugmsg("Landing prediction: %f, %f" % (flightpath[-1][0], flightpath[-1][1]))
                        debugmsg("Inserting record into database: %s" % ts.strftime("%Y-%m-%d %H:%M:%S"))

                        # execute the SQL insert statement
                        landingcur.execute(landingprediction_sql, [ fid, callsign, predictiontype, 0.00, float(flightpath[-1][1]), float(flightpath[-1][0]), linestring_text, round(float(flightpath[0][2]))])
                        self.landingconn.commit()


                    ####################################
                    # END:  insert predicted landing record into the database
                    ####################################

                else:
                    # The flight is still ascending OR conditions are such that we don't want to process a prediction (i.e. immediately post-burst).
                    ####################################
                    # START:  Check if predict file is uploaded, then upload a landing prediction to the database based on that predict.
                    ####################################
                    debugmsg("Flight, %s, isn't descending yet and/or less than 2 packets post-burst have been heard" % fid)

                    # If here, then the flight is NOT descending yet.  Or at least, it's not registered 2 packets post-burst.
                    # In this case then we:
                    #   1.  Determine if there is a prediction file loaded for this flight and perform a SQL query to get all
                    #       of those lat, lon, alt records.
                    #   2.  Determine the delta between the last position of the flight vs. the closest, altitude-wise, record 
                    #       from the prediciton file.
                    #   3.  Then insert a landing prediction record back into the landingpredictions table.

                    ##  columns for balloon_data:  timestamp, altitude, latitude, longitude
                    # Latest altitude, lat, and lon for the flight
                    #
                    # reference:  latestpackets columns:  
                    #    timestamp, 
                    #    altitude, 
                    #    latitude, 
                    #    longitude, 
                    #    altitude_change_rate, 
                    #    latitude_change_rate, 
                    #    longitude_change_rate
                    
                    # Get any prediction file rows (if loaded in the database)
                    rows = self.db_getPredictFile(fid, launchsite["name"])
                    predictiondata = rows
                    predictiondata_rev = predictiondata[::-1]

                    latest_altitude = latestpackets[-1, 1]
                    x = float(latestpackets[-1, 2])
                    y = float(latestpackets[-1, 3])

                    #if idx < (balloon_data.shape[0] - 1) and descent_portion.shape[0] > 2 and altitude_slice[idx] > alt_sanity_threshold:
                    if len(rows) > 0:
                        # if there are rows returned, then we run through them finding the "splice" point, the closest point, altitude-wise, 
                        # to the current flight location.

                        predictiondata_slice = []
                        predictiondata_slice = np.array(predictiondata_slice)
                        alt_sanity_threshold = 14999

                        if descent_portion.shape[0] > 1 and latest_altitude > alt_sanity_threshold:
                            # Are we descending and just not enough packets yet to perform a normal landing prediction?

                            # Loop through the prediction data in reverse order to find the closest altitude
                            loop_counter = 0
                            l = predictiondata_rev.shape[0]
                            prev_pred_alt = 0
                            while predictiondata_rev[loop_counter,0] < latest_altitude and loop_counter < l - 1:
                                if prev_pred_alt > predictiondata_rev[loop_counter, 0]:
                                    # we've hit the top in the pred data and we need to stop
                                    if loop_counter > 0:
                                        loop_counter -= 1
                                    break
                                prev_pred_alt = predictiondata_rev[loop_counter, 0]
                                loop_counter += 1

                            # Now slice off the predictiondata we care about
                            l = len(predictiondata_rev)
                            predictiondata_slice = predictiondata_rev[0:loop_counter, 0:]
                            
                            # reverse this back in HIGH to LOW altitude order
                            predictiondata_slice = predictiondata_slice[::-1]

                        else:
                            # we're still ascending

                            #if latest_altitude > float(flightids[i,5])*1.10:
                            if latest_altitude > float(rec[5])*1.10:
                                loop_counter = 0
                                l = predictiondata.shape[0]
                                prev_pred_alt = 0
                                while predictiondata[loop_counter,0] < latest_altitude and loop_counter < l - 1:
                                    if prev_pred_alt > predictiondata[loop_counter, 0]:
                                        # we've hit the top in the pred data and we need to stop
                                        if loop_counter > 0:
                                            loop_counter -= 1
                                        break
                                    prev_pred_alt = predictiondata[loop_counter, 0]
                                    loop_counter += 1

                                # Now slice off the predictiondata we care about
                                predictiondata_slice = predictiondata[loop_counter:, 0:]

                        if predictiondata_slice.shape[0] > 0:
                            # Determine the delta between the last heard packet and the prediction data
                            dx = x - float(predictiondata_slice[0, 1]) 
                            dy = y - float(predictiondata_slice[0, 2])

                            # Apply that delta to the prediction data, translating that curve and create the linestring string in the process
                            m = 0
                            linestring_text = ""
                            for k,u,v in predictiondata_slice:
                                if m > 0:
                                    linestring_text = linestring_text + ", "
                                linestring_text = linestring_text + str(round(float(v)+dy, 6)) + " " + str(round(float(u)+dx, 6))
                                m += 1
                            linestring_text = "LINESTRING(" + linestring_text + ")"

                            # Now we construct the GIS linestring string for the database insert
                            landingprediction_sql = """
                                 insert into landingpredictions (tm, flightid, callsign, thetype, coef_a, location2d, flightpath)
                                 values (now(),
                                     %s, 
                                     %s, 
                                     'translated', 
                                     %s::numeric, 
                                     ST_GeometryFromText('POINT(%s %s)', 4326), 
                                     ST_GeometryFromText(%s, 4326));
                            """

                            #debugmsg("SQL: " + landingprediction_sql % 
                            #        (   fid, 
                            #            callsign, 
                            #            str(-1), 
                            #            str(float(predictiondata_slice[-1,2])+dy), 
                            #            str(float(predictiondata_slice[-1,1])+dx), 
                            #            linestring_text 
                            #        ))

                            ts = datetime.datetime.now()
                            debugmsg("Inserting record into database: %s" % ts.strftime("%Y-%m-%d %H:%M:%S"))

                            landingcur.execute(landingprediction_sql, 
                                    [   fid, 
                                        callsign, 
                                        float(-1), 
                                        float(predictiondata_slice[-1,2])+dy, 
                                        float(predictiondata_slice[-1,1])+dx, 
                                        linestring_text 
                                    ]
                            )
                            self.landingconn.commit()

                    ####################################
                    # END:  Check if predict file is uploaded and upload a landing prediction to the database based on that predict.
                    ####################################
    
                debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))


        except pg.DatabaseError as error:
            landingcur.close()
            self.landingconn.close()
            print error
        except (KeyboardInterrupt, SystemExit):
            landingcur.close()
            self.landingconn.close()

        # Close the database connection
        debugmsg("Closing database connections...")
        landingcur.close()
        self.landingconn.close()

    ################################
    #END processPredictions()
    ################################




##################################################
# Landing Predictor Process
##################################################
def runLandingPredictor(schedule, e, config):
    try:
        # we need to see if the existing landing predictions table has the flightpath column and add it if not.
        try:
            # Database connection 
            dbconn = None
            dbconn = pg.connect (habconfig.dbConnectionString)
            dbconn.set_session(autocommit=True)
            dbcur = dbconn.cursor()

            # This is the list of columns we need to check as older versions of the software/database might not have been updated.
            check_columns = [ ("flightpath", "geometry(LINESTRING, 4326)"), ("ttl", "numeric"), ("patharray", "numeric[][]"), ("winds", "numeric[]") ]

            for column, coltype in check_columns:
                # SQL to check if the column exists or not
                check_column_sql = "select column_name from information_schema.columns where table_name='landingpredictions' and column_name=%s;"
                dbcur.execute(check_column_sql, [ column ])
                rows = dbcur.fetchall()

                # If the number of rows returned is zero, then we need to create the column
                if len(rows) == 0:
                    print "Column, %s, does not exist within the 'landingpredictions' table.  Adding now." % column
                    
                    # SQL to alter the "landingpredictions" table and add the "flightpath" column
                    alter_table_sql = "alter table landingpredictions add column " + column + " " + coltype + ";";
                    dbcur.execute(alter_table_sql)
                    dbconn.commit()

            # SQL to add an index on the time column of the packets table
            sql_exists = "select exists (select * from pg_indexes where schemaname='public' and tablename = 'packets' and indexname = 'packets_tm');"
            dbcur.execute(sql_exists)
            rows = dbcur.fetchall()
            if len(rows) > 0:
                if rows[0][0] == False:
                    # Add the index since it didn't seem to exist.
                    sql_add = "create index packets_tm on packets(tm);"
                    print "Adding packets_tm index to the packets table"
                    debugmsg("Adding packets_tm index to the packets table: %s" % sql_add)
                    dbcur.execute(sql_add)
                    dbconn.commit()

            # Close DB connection
            dbcur.close()
            dbconn.close()
        except pg.DatabaseError as error:
            dbcur.close()
            dbconn.close()
            print error


        # Create a new LandingPredictor object
        lp = LandingPredictor(habconfig.dbConnectionString, timezone=config['timezone'], timeout = 20)

        # run the landing predictor function continuously, every "schedule" seconds.
        while not e.is_set():
            lp.processPredictions()
            e.wait(schedule)

        print "Prediction scheduler ended"

    except (KeyboardInterrupt, SystemExit): 
        print "Prediction scheduler ended"
        pass


