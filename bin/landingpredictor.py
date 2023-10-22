##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2021 Jeff Deaton (N6BA)
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
from scipy.integrate import *
from scipy.interpolate import *
from scipy.optimize import *
from inspect import getframeinfo, stack
import json
import logging
import multiprocessing as mp
from dataclasses import dataclass
from logging.handlers import QueueHandler

#import local configuration items
import habconfig 
import queries

class GracefulExit(Exception):
    pass

#####################################
# The PredictorBase Class
# 
#    class PredictorBase:
#        def __init__(self):
#        def __del__(self):
#        def func_x2(self, x, a) :
#        def func_fittedline(self, x, a, b):
#        def distance(self, lat1, lon1, lat2, lon2):
#        def processPredictions(self):
#        def predictionAlgo(self, latestpackets, launch_lat, launch_lon, launch_elev, prediction_floor):
#####################################
@dataclass
class PredictorBase(object):

    # This is the initial floor for the algorithm.  Prediction calculations are no longer performed for altitudes below this value.
    # This will automatically adjust later on...to the elevation of the originating launch site for the given flight
    prediction_floor: int = 4900

    # This is the velocity value in ft/s at the floor.  That is, how fast is the balloon traveling when it hits ground level.  Or put 
    # more mathmatically kindof our x-intercept.
    adjust: int = 17

    # the logging queue
    loggingqueue: mp.Queue = None

    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)

        # air density with altitude
        self.airdensities = np.array([ [0, 23.77], [5000, 20.48], [10000, 17.56], [15000, 14.96], [20000, 12.67], [25000, 10.66],    
            [30000, 8.91], [35000, 7.38], [40000, 5.87], [45000, 4.62], [50000, 3.64], [60000, 2.26], [70000, 1.39], [80000, 0.86],    
            [90000, 0.56], [100000, 0.33], [150000, 0.037], [200000, 0.0053], [250000, 0.00065]])

        # gravitational acceleration with altitude
        self.gravities = np.array([ [0, 32.174], [5000, 32.159], [10000, 32.143], [15000, 32.128], [20000, 32.112], [25000, 32.097], 
            [30000, 32.082], [35000, 32.066], [40000, 32.051], [45000, 32.036], [50000, 32.020], [60000, 31.990], [70000, 31.959], 
            [80000, 31.929], [90000, 31.897], [100000, 31.868], [150000, 31.717], [200000, 31.566], [250000, 31.415] ])

        # Curves representing the change in air density and gravitational acceleration with altitude
        self.airdensity = interpolate.interp1d(self.airdensities[0:, 0], self.airdensities[0:,1] * 10**-4, kind='cubic')
        self.g = interpolate.interp1d(self.gravities[0:, 0], self.gravities[0:, 1], kind='cubic')

        self.logger.debug("PredictorBase instance created.")


    ################################
    # destructor
    ################################
    def __del__(self):
        self.logger.debug("PredictorBase destructor")


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
    # This is the main function for calculating predictions.  
    def processPredictions(self):
        self.logger.debug("Starting processPredictions...")


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
        self.logger.debug("Launch params: %.3f, %.3f, %.3f, %.3f" % (launch_lat, launch_lon, launch_elev, algo_floor))
        self.logger.debug("latestpackets size: %d" % latestpackets.shape[0])

        # if invalid arguments then return
        if not launch_lat or not launch_lon or not launch_elev or not algo_floor:
            return None

        # Check the airdensity function
        if airdensity_function is not None:
            if callable(airdensity_function):
                self.logger.debug("PredictionAlgo:  using supplied air density function.")
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
        self.logger.debug("Max altitude heard thus far: %d" % max_altitude)
       
        # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
        ascent_portion = np.array(latestpackets[0:(idx+1), 1:7], dtype='f')
        descent_portion = np.array(latestpackets[idx:, 1:7], dtype='f')
        self.logger.debug("ascent_portion.shape: %s" % str(ascent_portion.shape))
        self.logger.debug("descent_portion.shape: %s" % str(descent_portion.shape))

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
            self.logger.debug("ascent_portion[0]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[0,0], 
                ascent_portion[0,1],
                ascent_portion[0,2],
                ascent_portion[0,3],
                ascent_portion[0,4],
                ascent_portion[0,5]
                ))
        if ascent_portion.shape[0] > 1:
            self.logger.debug("ascent_portion[1]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[1,0], 
                ascent_portion[1,1],
                ascent_portion[1,2],
                ascent_portion[1,3],
                ascent_portion[1,4],
                ascent_portion[1,5]
                ))

        if ascent_portion.shape[0] > 0:
            self.logger.debug("ascent_portion[last]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[-1,0], 
                ascent_portion[-1,1],
                ascent_portion[-1,2],
                ascent_portion[-1,3],
                ascent_portion[-1,4],
                ascent_portion[-1,5]
                ))

        if descent_portion.shape[0] > 0:
            self.logger.debug("descent_portion[0]:  %f, %f, %f, %f, %f, %f" % (descent_portion[0,0], 
                descent_portion[0,1],
                descent_portion[0,2],
                descent_portion[0,3],
                descent_portion[0,4],
                descent_portion[0,5]
                ))
        if descent_portion.shape[0] > 1:
            self.logger.debug("descent_portion[1]:  %f, %f, %f, %f, %f, %f" % (descent_portion[1,0], 
                descent_portion[1,1],
                descent_portion[1,2],
                descent_portion[1,3],
                descent_portion[1,4],
                descent_portion[1,5]
                ))

        if descent_portion.shape[0] > 0:
            self.logger.debug("descent_portion[last]:  %f, %f, %f, %f, %f, %f" % (descent_portion[-1,0], 
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

            self.logger.debug("flight is descending, processing a prediction")

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

            self.logger.debug("last_heard_altitude: %f" % last_heard_altitude)

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
                self.logger.debug("Altitude gained from launch site to first packet: %fft" % dz)

                # Calculate the mean vertical rate for the first 5 APRS packets.
                avg_ascent_rate = float(np.mean(ascent_portion[0:5, 3]))
                self.logger.debug("Mean ascent rate for the first 5 packets: %fft/sec" % avg_ascent_rate) 

                # Estimate how long it took the balloon to travel from the launch site elevation to the first packet we heard
                time_to_first = dz / avg_ascent_rate
                self.logger.debug("Time from launch to first packet: %fs" % time_to_first)

                # Estimate the latitude and longitude angular rates
                # reference:  columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
                latrate_to_first = (float(ascent_portion[0,1]) - float(origin_x)) / time_to_first
                lonrate_to_first = (float(ascent_portion[0,2]) - float(origin_y)) / time_to_first
                #latrate_to_first = (origin_x - float(ascent_portion[0,1]) ) / time_to_first
                #lonrate_to_first = (origin_y - float(ascent_portion[0,2]) ) / time_to_first
                self.logger.debug("latrate_to_first: (%f - %f) / %f = %f" % (ascent_portion[0,1], origin_x, time_to_first, latrate_to_first))
                self.logger.debug("lonrate_to_first: (%f - %f) / %f = %f" % (ascent_portion[0,2], origin_y, time_to_first, lonrate_to_first))

                # Append the entry for the prediction_floor elevation to the ascent_portion array
                tempray = np.array([ [self.prediction_floor, origin_x, origin_y, avg_ascent_rate, latrate_to_first, lonrate_to_first ]], dtype='f')
                self.logger.debug("Pre-pending to ascent_portion: %f, %f, %f, %f, %f, %f" % (tempray[0,0],
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
            self.logger.debug("balloon_altitudes length: %f" % balloon_altitudes.shape[0])

            # Slice off just the vertical rate values from this balloon flight during the descent portion of the flight only
            # columns:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
            balloon_velocities = np.abs(np.array(descent_portion[1:, 3], dtype='f'))
            self.logger.debug("balloon_velocities length: %f" % balloon_velocities.shape[0])

            # Here we want to compute the k-value for this parachute, weight, drag combo
            # parachute_coef - this is the constant that represents 2m/CdA for this parachute, flight-string combo
            parachute_coef = np.mean(((balloon_velocities **2) * ad(balloon_altitudes)) / self.g(balloon_altitudes))
            self.logger.debug("parachute_coef: %f" % parachute_coef)

            # This is a list of points with the predicted velocity for various altitudes beyond the last altitude we've seen (aka the future)
            alts = np.arange(0, balloon_altitudes[-1] + 10000, 500)
            self.logger.debug("alts length: %f" % alts.shape[0])
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
            self.logger.debug("last heard location (x,y): %f, %f" % (x, y))

            # This is basically the starting altitude for the prediction.  It's the last altitude value we received from the flight.
            backstop = float(descent_portion[-1, 0])
            self.logger.debug("backstop: %f" % backstop)

            # Size of the altitude chunks (in feet) that we loop through in calculating predictions for the future.  
            # Smaller = more acccurate, but longer compute times.  30 seems to be a good compromise.
            step_size = 30
            self.logger.debug("stepsize: %d" % step_size)

            # Length of the ascent portion of the flight
            length = ascent_portion.shape[0]

            # The weight assigned to the two different functions used for predictions.  Essentially a precentage value based on 
            # "where" in the descent a flight is at it varies from 0 to 1.  With 1 being at the max altitude, and 0 being at the prediction_floor.
            #     Shortly after burst?  ...then apply more weight to the curve fitting function
            #     Well into the descent?  ...then apply more weight to the drag caluclation function
            function_weight = (float(last_heard_altitude) - self.prediction_floor) / (float(descent_portion[0, 0]) - self.prediction_floor)

            # Adjust the weight so that it more aggressively favors the drag calculation function instead of the curve fitting model.
            function_weight = function_weight**2

            self.logger.debug("function_weight: %f" % function_weight)


            # The flight is at an altitude where surface winds are taking over....
            use_surface_wind = False
            surface_exponent_weight = 2
            surface_wind_threshold = 4500 + self.prediction_floor
            surface_wind_cutoff = 2000 + self.prediction_floor
            self.logger.debug("surface_wind_threshold: %f, surface_wind_cutoff: %f" % (surface_wind_threshold, surface_wind_cutoff))
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
                        self.logger.debug("waypoint[%d]: w=%f, %f, %f, %f, %f, %f, %f" %(i-1, w, n[0], n[1], n[2], n[3], n[4], n[5]))

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
                    self.logger.debug("surface winds.  current altitude:  %.2f, avg_lat_rate: %f, avg_lon_rate: %f" % (last_heard_altitude, avg_lat_rate, avg_lon_rate))
                    if surface_winds:
                        use_surface_wind = True
                    else:
                        self.logger.debug("Not using surface winds in prediction calculations")
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
                               self.logger.debug("No wind rates given")
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
                               self.logger.debug("latest alt: %f, wind[0]: %f, wind[1]: %f, k[0]: %f, surface_weight: %f, latwr: %f, lonwr: %f" % (last_heard_altitude, wind_rates[0], wind_rates[1], k[0], surface_weight, lat_wind_rate, lon_wind_rate))


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
                               self.logger.debug("///////> surface wind weighting: %f, alt: %f, lat_rate: %f, lon_rate: %f, avg_lat_rate: %f, avg_lon_rate: %f" % (surface_weight, k[0], lat_rate, lon_rate, avg_lat_rate, avg_lon_rate))

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
                       self.logger.debug("TOP:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
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
                                   self.logger.debug("///////> surface wind weighting: %f, alt: %f, lat_rate: %f, lon_rate: %f, avg_lat_rate: %f, avg_lon_rate: %f" % (surface_weight, k[0], lat_rate, lon_rate, avg_lat_rate, avg_lon_rate))

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
                           self.logger.debug("BOTTOM:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
                           if k_idx == 0:
                               a = self.prediction_floor
                           else:
                               a = ascent_portion[k_idx - 1,0]
                           flightpath_deltas.append((dx, dy, ttl, a))

                   # END:  if k[0] < last_heard_altitude:


                else:
                   self.logger.debug("NO RUN:  backstop: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, k[0], k[1], k[2], k[3], k[4], k[5]))

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

            return flightpath_points, parachute_coef

        else:
            self.logger.debug("Not processing a prediction, sanity checks failed")
            return None, 0.0


    ##########################################################
    # The landing prediction algorithm for early cutdown/burst...
    #
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
    def predictionAlgoCutdown(self, latestpackets, descent_rates, launch_lat, launch_lon, launch_elev, algo_floor):
        self.logger.debug("Launch params: %.3f, %.3f, %.3f, %.3f" % (launch_lat, launch_lon, launch_elev, algo_floor))
        self.logger.debug("latestpackets size: %d" % latestpackets.shape[0])

        # if invalid arguments then return
        if not launch_lat or not launch_lon or not launch_elev or not algo_floor:
            return None

        # airdensity function
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

        # find the minimum altitude and note that index position
        idx_min = np.argmin(altitudes)
        min_altitude = altitudes[idx_min]

        self.logger.debug("Min altitude heard thus far: %d" % min_altitude)
        self.logger.debug("Max altitude heard thus far: %d" % max_altitude)
       
        # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
        ascent_portion = np.array(latestpackets[0:(idx+1), 1:7], dtype='f')
        descent_portion = np.array(latestpackets[idx:, 1:7], dtype='f')
        self.logger.debug("ascent_portion.shape: %s" % str(ascent_portion.shape))
        self.logger.debug("descent_portion.shape: %s" % str(descent_portion.shape))

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
            self.logger.debug("ascent_portion[0]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[0,0], 
                ascent_portion[0,1],
                ascent_portion[0,2],
                ascent_portion[0,3],
                ascent_portion[0,4],
                ascent_portion[0,5]
                ))
        if ascent_portion.shape[0] > 1:
            self.logger.debug("ascent_portion[1]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[1,0], 
                ascent_portion[1,1],
                ascent_portion[1,2],
                ascent_portion[1,3],
                ascent_portion[1,4],
                ascent_portion[1,5]
                ))

        if ascent_portion.shape[0] > 0:
            self.logger.debug("ascent_portion[last]:  %f, %f, %f, %f, %f, %f" % (ascent_portion[-1,0], 
                ascent_portion[-1,1],
                ascent_portion[-1,2],
                ascent_portion[-1,3],
                ascent_portion[-1,4],
                ascent_portion[-1,5]
                ))

        if descent_portion.shape[0] > 0:
            self.logger.debug("descent_portion[0]:  %f, %f, %f, %f, %f, %f" % (descent_portion[0,0], 
                descent_portion[0,1],
                descent_portion[0,2],
                descent_portion[0,3],
                descent_portion[0,4],
                descent_portion[0,5]
                ))
        if descent_portion.shape[0] > 1:
            self.logger.debug("descent_portion[1]:  %f, %f, %f, %f, %f, %f" % (descent_portion[1,0], 
                descent_portion[1,1],
                descent_portion[1,2],
                descent_portion[1,3],
                descent_portion[1,4],
                descent_portion[1,5]
                ))

        if descent_portion.shape[0] > 0:
            self.logger.debug("descent_portion[last]:  %f, %f, %f, %f, %f, %f" % (descent_portion[-1,0], 
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
        # ...AND the max altitude is > 14,999 feet (sanity check)...
        # ...AND we've got at least three packets from the ascent portion (without hearing packets on the way up we can't really predict anything)...
        # ...THEN continue on and try to predict a landing location for this flight
        alt_sanity_threshold = 14999
        if altitudes[idx] > alt_sanity_threshold and ascent_portion.shape[0] > 2:

            # The last altitude we've heard
            last_heard_altitude = float(descent_portion[-1, 0])

            self.logger.debug("last_heard_altitude: %f" % last_heard_altitude)


            ####################################
            # START:  initialize loop variables
            ####################################
            # Last heard location of the flight
            x = float(ascent_portion[-1, 1])
            y = float(ascent_portion[-1, 2])
            self.logger.debug("last heard location (x,y): %f, %f" % (x, y))

            # This is basically the starting altitude for the prediction.  It's the last altitude value we received from the flight.
            backstop = float(ascent_portion[-1, 0])
            self.logger.debug("backstop: %f" % backstop)

            # Size of the altitude chunks (in feet) that we loop through in calculating predictions for the future.  
            # Smaller = more acccurate, but longer compute times.  30 seems to be a good compromise.
            step_size = 30
            self.logger.debug("stepsize: %d" % step_size)

            # Length of the ascent portion of the flight
            length = ascent_portion.shape[0]

            # The weight assigned to the two different functions used for predictions.  Essentially a precentage value based on 
            # "where" in the descent a flight is at it varies from 0 to 1.  With 1 being at the max altitude, and 0 being at the prediction_floor.
            #     Shortly after burst?  ...then apply more weight to the curve fitting function
            #     Well into the descent?  ...then apply more weight to the drag caluclation function
            function_weight = (float(last_heard_altitude) - self.prediction_floor) / (float(descent_portion[0, 0]) - self.prediction_floor)

            # Adjust the weight so that it more aggressively favors the drag calculation function instead of the curve fitting model.
            function_weight = function_weight**2
            self.logger.debug("function_weight: %f" % function_weight)

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
            # We're here because:  conditions are such that we want to calculate a prediction.

            # check the boundaries of the latest packets heard to make sure that the interpolated curve (below) encompasses those boundaries
            if min_altitude < descent_rates[0,0]:
                lower_array = np.array([[round(float(min_altitude) * .98) , descent_rates[0,1]]])
                descent_rates = np.insert(descent_rates, 0, lower_array, axis=0)

            # check the boundaries of the latest packets heard to make sure that the interpolated curve (below) encompasses those boundaries
            if max_altitude > descent_rates[-1,0]:
                upper_array = np.array([[round(float(max_altitude) * 1.02) , descent_rates[-1,1]]])
                descent_rates = np.append(descent_rates, upper_array, axis=0)
                
            # create a curve that will serve as the predicted descent velocity at a given altitude
            pred_v_curve = interpolate.interp1d(descent_rates[0:, 0], descent_rates[0:, 1], kind='cubic')

            # Lambda function that represents our velocity prediction curve
            v = lambda altitude : pred_v_curve(altitude)

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


                       dx = t * k[4]
                       dy = t * k[5]

                       x += dx
                       y += dy
                       ttl += t
                       self.logger.debug("TOP:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
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

                           dx = t * k[4]
                           dy = t * k[5]

                           x += dx
                           y += dy
                           ttl += t
                           self.logger.debug("BOTTOM:  backstop: %f, time: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, t, k[0], k[1], k[2], k[3], k[4], k[5]))
                           if k_idx == 0:
                               a = self.prediction_floor
                           else:
                               a = ascent_portion[k_idx - 1,0]
                           flightpath_deltas.append((dx, dy, ttl, a))

                   # END:  if k[0] < last_heard_altitude:


                else:
                   self.logger.debug("NO RUN:  backstop: %f, k: %f, %f, %f, %f, %f, %f" %(backstop, k[0], k[1], k[2], k[3], k[4], k[5]))

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

            return flightpath_points, 0.0

        else:
            self.logger.debug("Not processing a prediction, sanity checks failed")
            return None, 0.0


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
#        def processPredictions(self):
#        def predictionAlgo(self, latestpackets, launch_lat, launch_lon, launch_elev, prediction_floor):
#####################################
@dataclass
class LandingPredictor(PredictorBase):

    # The database connection string
    dbstring: str = habconfig.dbConnectionString

    # The database connection object
    landingconn: pg.extensions.connection = pg.extensions.connection 

    # Where we upload latest landing locations for all active flights
    landinglocations: list = None

    # Where we upload latest landing locations for all active flights
    activebeacons: list = None

    # The timezone
    timezone: str = 'America/Denver'

    # Time limit in minutes for when to stop calculating predictions.  If this much or greater time has eplapsed since the last packet from the 
    # flight, then don't perform a prediction.
    # Default is set to 60 mins.
    timeout: int = 60

    # the logging queue
    loggingqueue: mp.Queue = None

    stopevent: mp.Event = None


    #####################################
    # the post init constructor
    #####################################
    def __post_init__(self)->None:
        super().__post_init__()

        # setup logging
        self.logger = logging.getLogger(f"{__name__}.{__class__}")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False

        # check if a logging queue was supplied
        if self.loggingqueue is not None:

            # a queue was supplied so we setup a queuehandler
            handler = QueueHandler(self.loggingqueue)
            self.logger.addHandler(handler)

        self.logger.debug("LandingPredictor instance created.")


    ################################
    # update the shared list with latest landing prediction locations
    ################################
    def updateLocations(self, locs):

        if self.landinglocations is not None:

            newlist = []

            # now add all of our latest landing tuples (i.e. lat, lon pairs)
            for tup in locs:
                newlist.append(tup)

            # update the landing locations shared list
            self.landinglocations["landings"] = newlist

    ################################
    # update the shared list with the beacon callsigns from active flights
    ################################
    def updateBeacons(self, flightlist):


        if self.activebeacons is not None:

            newlist = []

            # now add all of the callsigns from the flightlist
            for callsign in flightlist:
                newlist.append(callsign)

            # update the beacon list shared object
            self.activebeacons["callsigns"] = newlist

    ################################
    # destructor
    ################################
    def __del__(self):
        try:
            if not self.landingconn.closed:
                self.logger.info("LandingPredictor destructor:  closing database connection.")
                self.landingconn.close()
        except pg.DatabaseError as error:
            self.logger.error(f"Database error: {error}")


    ################################
    # Set the database connection string
    ################################
    def setDBConnection(self, dbstring):
        # Set the database connection 
        self.dbstring = dbstring


    ################################
    # Set the timezone string for the database queries
    ################################
    def setTimezone(self, timezone = 'America/Denver'):
        # set the timezone
        if timezone:
            self.timezone = timezone


    ################################
    # Function for connecting to the database
    ################################
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            return False

        try:

            # If not already connected to the database, then try to connect
            if self.landingconn != None:
                if self.landingconn.closed:
                    self.logger.debug("Connecting to the database: %s" % self.dbstring)
                    self.landingconn = pg.connect (self.dbstring)
                    self.landingconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.landingconn.close()
            self.logger.error(f"Database error: {error}")
            return False


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
        flightids = queries.getFlights(dbconn = self.landingconn, logger = self.logger)

        # update the beacon list shared with other processes
        if len(flightids) > 0:
            self.updateBeacons(flightids[0:,1])

        # our list of landing locations for all flights processed
        landings = []

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

                self.logger.debug("============ start processing: %s : %s ==========" % (fid, callsign))

                # launchsite particulars
                launchsite = { 
                        "flightid" : str(fid), 
                        "name" : str(rec[2]),
                        "lat" : float(rec[3]),
                        "lon" : float(rec[4]),
                        "elevation" : float(rec[5])
                        }
                self.logger.debug(f"Launchsite info: {launchsite}")

                # This is the default for where the prediction "floor" is placed.  Landing predictions won't use altitude values below this.
                self.logger.debug("Setting initial landing prediction elevation to launchsite elevation: %d" % launchsite['elevation'])
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
                latestpackets =  np.array(queries.getLatestPackets(dbconn = self.landingconn, callsign = callsign, timezone = self.timezone, cutoff = 20, logger = self.logger))
                self.logger.debug("latestpackets.shape: %s" % str(latestpackets.shape))

                # Have there been any packets heard from this callsign yet? 
                if latestpackets.shape[0] > 0:
                    self.logger.debug("latestpackets[0]:  %s, %f, %f, %f, %f, %f, %f, %f" % (latestpackets[0,0], 
                        latestpackets[0,1],
                        latestpackets[0,2],
                        latestpackets[0,3],
                        latestpackets[0,4],
                        latestpackets[0,5],
                        latestpackets[0,6],
                        latestpackets[0,7]
                        ))
                    self.logger.debug("latestpackets[-1]:  %s, %f, %f, %f, %f, %f, %f, %f" % (latestpackets[-1,0], 
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
                    self.logger.debug("No packets heard from this callsign: %s" % callsign)
                    self.logger.debug("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # Timestamp of the last packet we've heard from the flight
                elapsed_mins = latestpackets[-1, 7]
                self.logger.debug("Elapsed time since last packet[%s:%s]: %d mins" %(fid, callsign, elapsed_mins))

                # If amount of elapsed time since the last packet from the flight is greater than our timeout value, then we abort and exit.
                # No sense in creating a prediction for a flight that is over.
                if elapsed_mins > self.timeout:
                    self.logger.debug("Elapsed time (%d mins) greater than timeout (%d mins), not processing prediction." %(elapsed_mins, self.timeout))
                    self.logger.debug("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # slice (aka list) of just the altitude columns
                altitudes = latestpackets[0:, 1]

                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
                self.logger.debug("processPredictions: Max altitude heard thus far: %d" % max_altitude)

                # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
                ascent_portion = np.array(latestpackets[0:(idx+1), 1:], dtype='f')
                descent_portion = np.array(latestpackets[idx:, 1:], dtype='f')
                self.logger.debug("processPredictions: ascent_portion.shape: %s" % str(ascent_portion.shape))
                self.logger.debug("processPredictions: descent_portion.shape: %s" % str(descent_portion.shape))
     
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
                    gpsposition = queries.getGPSPosition(dbconn = self.landingconn, logger = self.logger)

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
                            self.logger.debug("Current location < 30 miles from the current flight, using GPS for landing prediction elevation")
                            landingprediction_floor = float(gpsposition['altitude'])
                            gps_estimate = True

                    # If we were unable to get an estimate elevation from the brick's GPS, then then query the database for nearby stations
                    if gps_estimate == False:
                        self.logger.debug("Checking for stations near the landing prediction to estimate landing prediction elevation")
                        estimate = queries.getLandingElevation(dbconn = self.landingconn, callsign = callsign, distance = 30, logger = self.logger)
                        if estimate > 0:
                            landingprediction_floor = float(estimate)

                    self.logger.debug("Prediction floor set to: %f" % landingprediction_floor)

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
                    winds, validity = queries.getSurfaceWinds(dbconn = self.landingconn, flightid = fid, logger = self.logger)

                    ####################################
                    # END:  get surface winds
                    ####################################
                    


                    ####################################
                    # START:  Check if there were KC0D airdensity values
                    ####################################

                    # Only use the air density from the kc0d payloads if the option is explictly set to true
                    if config["airdensity"] == "on":

                        self.logger.debug("Airdensity option was set to ON.")

                        # slice (aka list) off just the altitude and air_density columns
                        ad = np.array(ascent_portion[0:, [0,9]], dtype='float64')

                        # Check that the values aren't just a bunch of NULL's
                        num = 0
                        for alt, d in ad:
                            if np.isnan(d):
                                num += 1

                        self.logger.debug("Percentage of NULL data points from payload measured air density: %.2f%%." % (100 * num / ad.shape[0]))

                        # Check that the number of NULLs is minimal (ex. < 5%)
                        if num / ad.shape[0] < .05 and ad.shape[0] > 3:

                            self.logger.debug("Using payload measured air density.")

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
                                self.logger.debug("ValueError in creating interpolated curve for air density: {}".format(e))
                                self.logger.debug("Falling back to using pre-calculated air density instead of payload measured values.")
                                airdensity_curve = self.airdensity


                        # Otherwise, we just use the standard engineering air densities
                        else:
                            self.logger.debug("Using pre-calculated air density instead of payload measured values.")
                            airdensity_curve = self.airdensity
                    else:
                        self.logger.debug("kc0dairdensity configuration setting set not true, skipping airdensity calcs.")
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

                    coef = 0.0
                    if not validity:
                        winds = None
                        wind_text = None
                        predictiontype = "predicted"

                        # Call the prediction algo
                        self.logger.debug("Running prediction regular prediction")
                        flightpath, coef = self.predictionAlgo(latestpackets, launchsite["lat"], launchsite["lon"], launchsite["elevation"], landingprediction_floor, surface_winds = True, airdensity_function = airdensity_curve)
                    else:
                        wind_text = "ARRAY[" + str(round(winds[2])) + ", " + str(round(winds[3])) + ", " + str(round(winds[4])) + "]"
                        predictiontype = "wind_adjusted"

                        # Call the prediction algo
                        self.logger.debug("Running prediction that indludes calcualted surface winds.  winds[0]: %f, winds[1]: %f" % (winds[0], winds[1]))
                        flightpath, coef = self.predictionAlgo(latestpackets, launchsite["lat"], launchsite["lon"], launchsite["elevation"], landingprediction_floor, surface_winds = True, wind_rates = winds, airdensity_function = airdensity_curve)

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

                        #self.logger.debug("SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2])))))
                        #print "SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2]))))

                        self.logger.debug("Landing prediction: %f, %f" % (flightpath[-1][0], flightpath[-1][1]))
                        self.logger.debug("Inserting record into database: %s" % ts.strftime("%Y-%m-%d %H:%M:%S"))

                        # execute the SQL insert statement
                        landingcur.execute(landingprediction_sql, [ fid, callsign, predictiontype, coef, float(flightpath[-1][1]), float(flightpath[-1][0]), linestring_text, round(float(flightpath[0][2]))])
                        self.landingconn.commit()


                    ####################################
                    # END:  insert predicted landing record into the database
                    ####################################

                else:
                    # The flight is still ascending OR conditions are such that we don't want to process a prediction (i.e. immediately post-burst).
                    ####################################
                    # START:  Check if predict file is uploaded, then upload a landing prediction to the database based on that predict.
                    ####################################
                    self.logger.debug("Flight, %s, isn't descending yet and/or less than 2 packets post-burst have been heard" % fid)

                    # If here, then the flight is NOT descending yet.  Or at least, it's not registered 2 packets post-burst.
                    # In this case then we:
                    #   1.  Determine if there is a prediction file loaded for this flight and perform a SQL query to get all
                    #       of those lat, lon, alt records.
                    #   2.  Determine the delta between the last position of the flight vs. the closest, altitude-wise, record 
                    #       from the prediciton file.
                    #   3.  Then insert a landing prediction record back into the landingpredictions table.

                    # reference:  latestpackets columns:  
                    #    timestamp, 
                    #    altitude, 
                    #    latitude, 
                    #    longitude, 
                    #    altitude_change_rate, 
                    #    latitude_change_rate, 
                    #    longitude_change_rate
                    
                    # Get any prediction file rows (if loaded in the database)
                    rows = queries.getPredictFile(dbconn = self.landingconn, flightid = fid, launchsite = launchsite["name"], logger = self.logger)
                    predictiondata = rows

                    # we reverse this so that the starting element is the down range landing and the ending element is the launchsite
                    predictiondata_rev = predictiondata[::-1]

                    # reference:  predictiondata columns:
                    #     altitude,
                    #     latitude,
                    #     longitude,
                    #     vert_rate,
                    #     delta_secs

                    # Latest altitude, latitude, and longitude heard from the flight
                    latest_altitude = latestpackets[-1, 1]
                    x = float(latestpackets[-1, 2])
                    y = float(latestpackets[-1, 3])

                    # Flight altitude needs to be above this threshold. 
                    #alt_sanity_threshold = 14999
                    # Set this to something lower??
                    alt_sanity_threshold = 8500

                    # If there are predict file rows returned, then we run through them finding the "splice" point, the closest point, altitude-wise, 
                    # to the current flight location and also attempt to create an early cutdown prediction.
                    if len(rows) > 0:

                        ####################################
                        # START:  Determine predict file splice point
                        ####################################
                        predictiondata_slice = []
                        predictiondata_slice = np.array(predictiondata_slice)

                        # Are we descending and just not enough packets yet to perform a normal landing prediction?  If so then, then we need to determine a different
                        # splice point.
                        if descent_portion.shape[0] > 1 and latest_altitude > alt_sanity_threshold:
                            # The flight is descending, so we look for a splice point from the end of the predict file (instead of the beginning near the launch site).

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
                            predictiondata_slice = predictiondata_rev[0:loop_counter, 0:]
                            
                            # reverse this back in HIGH to LOW altitude order
                            predictiondata_slice = predictiondata_slice[::-1]

                        else:
                            # We're still ascending so look for a splice point from the beginning of the predict file

                            # We only want to find a splice point during the flight's ascent IF it's at least 10% higher than the launch site elevation.
                            # That way we're only creating a prediction after we're "sure" the flight has been launched.
                            altitude_threshold = float(rec[5]) * 1.10
                            if latest_altitude > altitude_threshold:
                                loop_counter = 0
                                l = predictiondata.shape[0]
                                prev_pred_alt = 0

                                # We now loop through each row in the prediction data, from launch site elevation to predicted burst until we land on
                                # an altitude that is greater than where the flight is currently at.
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

                        ####################################
                        # END:  Determine predict file splice point
                        ####################################




                        ####################################
                        # START: Early cutdown landing prediction
                        ####################################

                        # We define flightpath here, outside of the block below for pre-cutdown computations, so we can reference it later in the pre-flight 
                        # predictions (down below this block).
                        flightpath = None

                        # Now add a prediction record for cutdown / early-burst condition, but only if the flight is still ascending and we're above the 
                        # altitude sanity threshold
                        #if descent_portion.shape[0] < 2 and latest_altitude > alt_sanity_threshold:
                        if latest_altitude > alt_sanity_threshold:
                            # We're here because 
                            #     a) there was a predict file available (i.e. from the database)
                            #     b) the flight is not yet descending

                            self.logger.debug("Calculating early cutdown landing prediction")
                            
                            # The part of the predict file data that we'll use for vertical rate data.
                            cutdown_predictiondata_slice = []
                            cutdown_predictiondata_slice = np.array(cutdown_predictiondata_slice)

                            # Loop through the prediction data in reverse order to find the closest altitude.  Basically iterating from the beginning (i.e. launch) to
                            # the flight's current altitude.
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

                            # Now slice off the predictiondata we care about, plus one more element so there are enough data points that the Algo can create a curve.
                            cutdown_predictiondata_slice = predictiondata_rev[0:loop_counter+1, 0:]
                            
                            # If we found a splice point then proceed with creating a cutdown landing prediction
                            if cutdown_predictiondata_slice.shape[0] > 0:

                                ####################################
                                # START:  adjust the prediction floor
                                ####################################
                                # If we're close to the balloon (ex. < 35 miles), then we want to adjust our prediction_floor to our current elevation.  
                                # The idea being that if we're close to the balloon, then our current elevation is likely close to the elevation of the 
                                # balloon's ultimate landing location.  ...and we want to have the prediction algorithm calculate predicitons down to 
                                # that elevation.  This should increase landing prediction accuracy a small amount.

                                # Get our latest position
                                gpspos = queries.getGPSPosition(dbconn = self.landingconn, logger = self.logger)

                                gps_est = False
                                if gpspos['isvalid']:
                                    # Calculate the distance between this system (wherever it might be...home...vehicle...etc.) and the last packet 
                                    # received from the balloon
                                    dist_to_balloon = self.distance(
                                            gpspos['latitude'],
                                            gpspos['longitude'],
                                            latestpackets[-1, 2],
                                            latestpackets[-1, 3]
                                            )

                                    # If we're close to the balloon, then set the prediction floor to that elevation
                                    if dist_to_balloon < 30:
                                        self.logger.debug("Current location < 30 miles from the current flight, using GPS for landing prediction elevation")
                                        landingprediction_floor = float(gpspos['altitude'])
                                        gps_estimate = True

                                # If we were unable to get an estimate elevation from the brick's GPS, then then query the database for nearby stations
                                if gps_est == False:
                                    self.logger.debug("Checking for stations near the landing prediction to estimate landing prediction elevation")
                                    estimate = queries.getLandingElevation(dbconn = self.landingconn, callsign = callsign, distance = 30, logger = self.logger)
                                    if estimate > 0:
                                        landingprediction_floor = float(estimate)

                                self.logger.debug("Prediction floor set to: %f" % landingprediction_floor)

                                ####################################
                                # END:  adjust the prediction floor
                                ####################################



                                ####################################
                                # START:  calculate the cutdown landing prediction
                                ####################################
                                # reference:  cutdown_predictiondata_slice columns:
                                # altitude, 
                                # latitude,
                                # longitude,
                                # vertical rate,
                                # delta_secs
                                #

                                # Slice off only the altitude and vertical rate columns as we only need these two columns for creating a velocity vs. altitude curve.
                                predicted_descent_rates = np.array(cutdown_predictiondata_slice[0:, [0,3]], dtype='float64')

                                # Convert the vertical rate column to ft/sec.  All predict file data is in ft/min.
                                predicted_descent_rates[:,(1)] /= 60

                                # create a landing prediction based on the predict file descent rates and the latest packets seen thus far.
                                self.logger.debug("Running cutdown landing prediction")
                                flightpath, coef = self.predictionAlgoCutdown(latestpackets, predicted_descent_rates, launchsite["lat"], launchsite["lon"], launchsite["elevation"], landingprediction_floor)
                                ####################################
                                # END:  calculate the cutdown landing prediction
                                ####################################



                                ####################################
                                # START:  insert cutdown landing prediction record into the database
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
                                    landingprediction_sql = """ insert into landingpredictions (tm, flightid, callsign, thetype, coef_a, location2d, flightpath) values (now(), %s, %s, 'cutdown', %s::numeric, ST_GeometryFromText('POINT(%s %s)', 4326), ST_GeometryFromText(%s, 4326));"""

                                    ts = datetime.datetime.now()

                                    #self.logger.debug("SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2])))))
                                    #print "SQL: " + landingprediction_sql % (ts.strftime("%Y-%m-%d %H:%M:%S"), fid, callsign, predictiontype, str(flightpath[-1][1]), str(flightpath[-1][0]), linestring_text, str(round(float(flightpath[0][2]))))

                                    self.logger.debug("Landing prediction: %f, %f" % (flightpath[-1][0], flightpath[-1][1]))
                                    self.logger.debug("Inserting record into database: %s" % ts.strftime("%Y-%m-%d %H:%M:%S"))

                                    # execute the SQL insert statement
                                    landingcur.execute(landingprediction_sql, [ fid, callsign, coef, float(flightpath[-1][1]), float(flightpath[-1][0]), linestring_text])
                                    self.landingconn.commit()

                                    # Add this predicted landingn location to our list
                                    landings.append((flightpath[-1][1], flightpath[-1][0]))



                                ####################################
                                # END:  insert cutdown landing prediction record into the database
                                ####################################

                        ####################################
                        # END: Early cutdown landing prediction
                        ####################################



                        ####################################
                        # START: Insert pre-flight predict file landing prediction into the database
                        ####################################
                        # Check if we found a splice point.  If so, then we proceed with splicing the predict
                        # file onto the end of the existing flight path.
                        #
                        # We've delayed inserting this pre-flight prediction into the database until after the pre-cutdown prediction has been
                        # [potentially] computed.  If a pre-cutdown prediction does exist, then we want to splice that onto the end of this
                        # pre-flight prediction.  This will create a predicted flight path and landing that consists of unknown data (i.e. the pre-
                        # flight prediction) as well as observed wind data for the flight thus far (i.e. the pre-cutdown prediction).  Combining these
                        # results in a more accurate prediction prior to descent.
                        #
                        if predictiondata_slice.shape[0] > 0:

                            # If there was a pre-cutdown prediction created up above, then we splice that onto the end section of the pre-flight prediction 
                            if flightpath:

                                # reference:  flightpath columns:
                                #     latitude,
                                #     longitude,
                                #     ttl,
                                #     altitude

                                # first we find the splice point
                                loop_counter = 0
                                prev_pred_alt = 0

                                # this is the altitude that the pre-cutdown landing prediction starts at...and should be our splice point
                                cutdown_altitude = flightpath[0][3]

                                # we reverse the pre-flight prediction data slice because we want to loop from landing up, towards the current flight altitude.
                                predictiondata_slice_rev = predictiondata_slice[::-1]
                                l = predictiondata_slice_rev.shape[0]

                                # Now loop through the prediction data, stopping at the point where the pre-flight altitude is higher than the pre-cutdown starting altitude.
                                while predictiondata_slice_rev[loop_counter,0] < cutdown_altitude and loop_counter < l - 1:
                                    if prev_pred_alt > predictiondata_slice_rev[loop_counter, 0]:
                                        # we've hit the top in the pred data and we need to stop
                                        if loop_counter > 0:
                                            loop_counter -= 1
                                        break
                                    prev_pred_alt = predictiondata_slice_rev[loop_counter, 0]
                                    loop_counter += 1

                                # Now slice off the predictiondata we care about
                                predictiondata_slice_rev = predictiondata_slice_rev[loop_counter:, 0:]
                                
                                # reverse this back in HIGH to LOW altitude order
                                predictiondata_slice = predictiondata_slice_rev[::-1]

                                # reference:  predictiondata columns:
                                #     altitude,
                                #     latitude,
                                #     longitude,
                                #     vert_rate,
                                #     delta_secs

                                # reswizzle the flightpath columns into an array that matches the predictiondata format
                                # convert the flightpath list to a numpyarray
                                temparray = np.array(flightpath)

                                # reorder the columns so we have altitude, latitude, longitude, and ttl
                                newarray = temparray[:,[3,0,1,2]]

                                # add a column with 0's in it
                                newarray = np.hstack((newarray, np.zeros((newarray.shape[0], 1), dtype=newarray.dtype)))

                                # now zero out the last two columns
                                newarray[:,[3,4]] = 0

                                # Now we need to translate the pre-cutdown prediction so that it begins (at the similar lat, lon) at the point where the pre-flight
                                # prediction ends.
                                # Determine the delta between the end of the pre-flight prediction and the beginning of the pre-cutdown prediction
                                dx = float(predictiondata_slice[-1, 1]) - newarray[0,1]
                                dy = float(predictiondata_slice[-1, 2]) - newarray[0,2]

                                # Add this delta to the lat and lon columns of the pre-cutdown prediction.  This should translate the pre-cutdown predicted flight path
                                # so that it begins at the same point that the pre-flight prediction ends.
                                newarray[:,1] = [dx + i for i in newarray[:,1]]
                                newarray[:,2] = [dy + i for i in newarray[:,2]]

                                # Now, finally, append the two arrays
                                predictiondata_slice = np.append(predictiondata_slice, newarray, axis=0)


                            # Determine the delta between the last heard packet and the prediction data
                            dx = x - float(predictiondata_slice[0, 1]) 
                            dy = y - float(predictiondata_slice[0, 2])

                            # Apply that delta to the prediction data, translating that curve and create the linestring string in the process
                            m = 0
                            linestring_text = ""
                            for k,u,v,vrate,ds in predictiondata_slice:
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

                            #self.logger.debug("SQL: " + landingprediction_sql % 
                            #        (   fid, 
                            #            callsign, 
                            #            str(-1), 
                            #            str(float(predictiondata_slice[-1,2])+dy), 
                            #            str(float(predictiondata_slice[-1,1])+dx), 
                            #            linestring_text 
                            #        ))

                            ts = datetime.datetime.now()
                            self.logger.debug("Inserting record into database: %s" % ts.strftime("%Y-%m-%d %H:%M:%S"))

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

                            # Add this predicted landing location to our list
                            landings.append((float(predictiondata_slice[-1,2])+dy, float(predictiondata_slice[-1,1])+dx))

                        ####################################
                        # END: Insert pre-flight predict file landing prediction into the database
                        ####################################



                    ####################################
                    # END:  Check if predict file is uploaded and upload a landing prediction to the database based on that predict.
                    ####################################
    
                # now update the shared list of landing locations so other processes can use the data
                self.updateLocations(landings)

                self.logger.debug("============ end processing:   %s : %s ==========" % (fid, callsign))

        except pg.DatabaseError as error:
            landingcur.close()
            self.landingconn.close()
            self.logger.error(f"Database error: {error}")

        #except (KeyboardInterrupt, SystemExit, GracefulExit) as e:
        #    self.logger.info("Caught exit signal, closing database connections.")
        #    landingcur.close()
        #    self.landingconn.close()

            # reraise the exception
        #    raise e

        # Close the database connection
        self.logger.debug("Closing database connections...")
        landingcur.close()
        self.landingconn.close()

    ################################
    #END processPredictions()
    ################################




##################################################
# Landing Predictor Process
##################################################
def runLandingPredictor(config):
    try:

        # setup logging
        logger = logging.getLogger(__name__)
        qh = QueueHandler(config["loggingqueue"])
        logger.addHandler(qh)
        logger.setLevel(logging.INFO)
        logger.propagate = False

        logger.info("Starting landing predictor")

        # Create a new LandingPredictor object
        lp = LandingPredictor(
                dbstring = habconfig.dbConnectionString, 
                timezone=config['timezone'], 
                timeout = 20, 
                landinglocations = config["landinglocations"], 
                activebeacons = config["activebeacons"],
                loggingqueue = config["loggingqueue"],
                )

        # run the landing predictor function continuously, every 5 seconds.
        while not config["stopevent"].is_set():
            lp.processPredictions()
            config["stopevent"].wait(5)

    except (KeyboardInterrupt, SystemExit, GracefulExit) as e: 
        logger.debug(f"runLandingPredictor caught keyboardinterrupt")
        logger.info("Exiting...")
        config["stopevent"].set()
        pass
    finally:
        logger.info("Landing predictor ended")


