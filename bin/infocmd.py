##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020, Jeff Deaton (N6BA)
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
import hashlib

#import local configuration items
import habconfig 
import kiss


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
# The infoCmd Class
# 
#    class PredictorBase:
#        def __init__(self):
#        def __del__(self):
#        def getInfoCmd(self):
#####################################
class infoCmd(object):

    ################################
    # constructor
    def __init__(self, my_callsign, dbConnectionString = None, timezone = 'America/Denver', dw_channel = 0, viapath="WIDE1-1,WIDE2-1"):


        # The database connection string
        self.dbstring = dbConnectionString

        # The callsign
        self.callsign = my_callsign.upper()

        # The database connection object
        self.dbconn = None
        self.dbconn = pg.extensions.connection

        # Timezone
        self.timezone = timezone

        # Timeout value
        self.timeout = 260

        # The KISS object
        self.direwolf = kiss.txKISS(my_callsign.upper(), port=8001, channel = dw_channel, via=viapath)


        debugmsg("infoCmd constructor")
        debugmsg("Using viapath: %s" % viapath)


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
    # destructor
    def __del__(self):
        try:
            if not self.dbconn.closed:
                debugmsg("infoCmd destructor:  closing database connection.")
                self.dbconn.close()
        except pg.DatabaseError as error:
            debugmsg(error)


    ################################
    # Function for connecting to the database
    def connectToDatabase(self, dbstring = None):
        if dbstring:
            self.dbstring = dbstring

        if not self.dbstring:
            return False

        try:

            # If not already connected to the database, then try to connect
            if self.dbconn != None:
                if self.dbconn.closed:
                    debugmsg("Connecting to the database: %s" % self.dbstring)
                    self.dbconn = pg.connect (self.dbstring)
                    self.dbconn.set_session(autocommit=True)

            return True

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            self.dbconn.close()
            debugmsg(error)
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

            flightscur = self.dbconn.cursor()
            flightscur.execute(flightids_sql)
            rows = flightscur.fetchall()
            flightscur.close()

            if debug:
                flightlist = ""
                for r in rows:
                    flightlist += " " + r[0] + ":" + r[1]
                debugmsg("List of flights[%d]:%s" % (len(rows), flightlist))

            # columns for returned array:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
            return np.array(rows)

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            flightscur.close()
            self.dbconn.close()
            debugmsg(error)
            return np.array([])
        

    ################################
    # Function for querying the database to get a list of latest packets for the provided callsign
    # The resulting list of packets is returned if no callsign is given then an empty list is returned
    # columns returned in the list:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
    def getLatestPackets(self, callsign = None):

        # if a callsign wasn't provided, then return a empty numpy array
        if not callsign:
            return []

        # The SQL statement to get the latest packets for this callsign
        # columns:  timestamp, altitude, latitude, longitude
        # Note:  only those packetst that might have occured within the last 6hrs are queried.
        latestpackets_sql = """select
                round(y.altitude) as altitude,
                case when y.delta_secs > 0 then
                    round(((y.altitude - y.previous_altitude) / y.delta_secs)::numeric, 2)
                else 
                    0
                end as vert_rate,
                case when y.delta_secs > 0 then
                    round((100000 * (y.lat - y.previous_lat) / y.delta_secs)::numeric, 6)
                else 
                    0
                end as lat_rate,
                case when y.delta_secs > 0 then
                    round((100000 * (y.lon - y.previous_lon) / y.delta_secs)::numeric, 6)
                else 
                    0
                end as lon_rate,
                round(y.elapsed_secs / 60.0) as elapsed_mins

            from
                (
                select
                    z.thetime,
                    z.callsign,
                    z.altitude,
                    z.comment,
                    z.symbol,
                    z.speed_mph,
                    z.bearing,
                    z.lat,
                    z.lon,
                    z.temperature_k,
                    z.pressure_pa,
                    z.ptype, 
                    z.hash,
                    z.raw,
                    lag(z.altitude, 1) over(order by z.thetime)  as previous_altitude,
                    lag(z.lat, 1) over (order by z.thetime) as previous_lat,
                    lag(z.lon, 1) over (order by z.thetime) as previous_lon,
                    extract ('epoch' from (z.thetime - lag(z.thetime, 1) over (order by z.thetime))) as delta_secs,
                    extract ('epoch' from (now() - z.tm)) as elapsed_secs

                from 
                    (
                    select
                        a.tm,
                        case
                            when a.raw similar to '%%[0-9]{6}h%%' then
                                date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone 'America/Denver')::time)::time without time zone
                            else
                                date_trunc('milliseconds', a.tm)::time without time zone
                        end as thetime,
                        a.callsign,
                        a.altitude,
                        a.comment,
                        a.symbol,
                        a.speed_mph,
                        a.bearing,
                        cast(st_y(a.location2d) as numeric) as lat,
                        cast(st_x(a.location2d) as numeric) as lon,
                        case
                        when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                            round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                        else
                            NULL
                        end as temperature_k,
                        case
                            when a.raw similar to '%% [-]{0,1}[0-9][-]{0,1}{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                            else
                                NULL
                        end as pressure_pa,
                        a.ptype, 
                        a.hash,
                        a.raw

                    from
                        packets a,
                        flights f,
                        flightmap fm

                    where 
                        a.callsign = fm.callsign
                        and fm.flightid = f.flightid
                        and f.active = 'y'
                        and a.tm > (now() - interval '06:00:00')
                        and a.location2d != ''
                        and a.altitude > 0
                        and a.callsign = %s
                        and a.source = 'other'

                    order by
                        thetime,
                        a.callsign

                    ) as z


                order by
                    z.thetime asc,
                    z.callsign
                ) as y

            order by
                y.thetime asc
            ; """
                      
        try:
            # Check if we're connected to the database or not.
            if not self.connectToDatabase():
                return []

            # Execute the SQL statment and get all rows returned
            latestcur = self.dbconn.cursor()
            latestcur.execute(latestpackets_sql, [ callsign.upper() ])
            rows = latestcur.fetchall()
            latestcur.close()
            if len(rows) > 0:
                # if the last packet heard from this flight is > 30mins old, then return no rows.  
                if rows[-1][4] > 30:
                    return []

            return rows

        except pg.DatabaseError as error:
            # If there was a connection error, then close these, just in case they're open
            latestcur.close()
            self.dbconn.close()
            debugmsg(error)
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
            wxcur = self.dbconn.cursor()

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
                                            a.tm > now()::date
                                            and a.ptype = '@'
                                            and a.raw similar to '%%_[0-9]{3}/[0-9]{3}g%%' 

                                        group by
                                            a.callsign

                                        order by
                                            thetime asc
                                        ) as a1
                                        on a.tm = a1.thetime and a.callsign = a1.callsign

                                where 
                                    a.tm > now()::date
                                    and a1.callsign is not null
                                    and a.ptype = '@'
                                    and a.source = 'other'

                                order by
                                    a.tm asc
                                ) as b

                            where 
                                b.wind_angle_bearing is not null
                                and b.wind_magnitude_mph is not null
                                and b.distance < 75 
                                and b.thetime > (now() - interval '02:00:00')::time

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
            self.dbconn.close()
            debugmsg(error)
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
            elev_cur = self.dbconn.cursor()

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
                        packets a,
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
                        and a.altitude > 0
                        and a.location2d != ''
                        and a.symbol not in ('/''', '/O', '/S', '/X', '/^', '/g', '\O', 'O%%', '\S', 'S%%', '\^', '^%%')
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
            self.dbconn.close()
            debugmsg(error)
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
            gpscur = self.dbconn.cursor()
            gpscur.execute(gps_sql)
            gpsrows = gpscur.fetchall()
            gpscur.close()

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
            gpscur.close()
            self.dbconn.close()
            debugmsg(error)
            return gpsposition


    ################################
    # This is the main function for determing what sort of information string should be returned
    def processInfoCmd(self):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return 0

        if self.dbconn.closed:
            return 0

        # get list of active flightids/callsign combo records
        # columns:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
        flightids = self.db_getFlights()

        l = []
        #for l in [self.packets(flightids), self.surface_winds(flightids), self.landing_coords(flightids)]:
        for l in [self.landing_coords(flightids)]:
            if len(l) > 0:
                for str in l:
                    if str is not None and str != "":

                        # Transmit this via direwolf
                        debugmsg("Transmitting: %s" % str)
                        self.direwolf.transmit(str)


    ################################
    # This will query the database looking the latest landing prediction location 
    #
    def landing_coords(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # database cursor
        wxcur = self.dbconn.cursor()

        # Information string
        infoStrings = []

        # Loop through the list of beacons
        for rec in flightrecords:

            # this is the flightid
            fid = rec[0]

            # callsign
            callsign = rec[1]

            debugmsg("============ infocmd landing_coords processing: %s : %s ==========" % (fid, callsign))

            try: 
                # Get the latest landing prediction for the flight/beacon.  Only look back 20mins and we exclude early cutdown predictions.
                lastlandingprediction_sql = """
                    select 
                        l.tm as thetime,
                        st_y(l.location2d) as lat,
                        st_x(l.location2d) as lon,
                        round(ttl) as ttl,
                        round(coef_a, 9) as coef

                    from
                        landingpredictions l

                    where 
                        l.flightid = %s
                        and l.callsign = %s
                        and l.tm > (now() - interval '20:20:00')
                        and l.tm > now()::date
                        and l.thetype in ('predicted', 'wind_adjusted', 'translated')

                    order by
                        l.tm desc 
                    
                    limit 1
                    ;
                """

                wxcur.execute(lastlandingprediction_sql, [ fid, callsign ])
                rows = wxcur.fetchall()

                # Loop through the rows returned creating an APRS object packet for the landing prediction
                for r in rows:
                    #infoString = "{{{{z{}|L|{:.6f},{:.6f}".format(callsign, r[1], r[2])

                    # pad with spaces, the callsign to 9 characters 
                    call = self.callsign
                    if "-" in self.callsign:
                        call,ssid = self.callsign.split("-")

                    # compute the md5 hash of the beacon and user's callsigns, but save only the last four hex digits.  This will become a unique string to identify the object.
                    hash_this = callsign.upper() + self.callsign.upper()
                    md5hash = hashlib.md5(hash_this).hexdigest()[-4:]

                    objectname = callsign.split("-")[0][0:4] + "." + md5hash.upper()
                    objectname = objectname + " "*(9 - len(objectname))

                    # timestamp
                    ts = datetime.datetime.now()
                    timestring = ts.strftime("%H%M%S")

                    # convert the latitude to degrees, decimal-minutes
                    degrees = int(r[1])
                    minutes = (r[1] - degrees) * 60
                    lat = "{:02d}{:05.2f}{}".format(abs(degrees), abs(minutes), "N" if r[1] >= 0 else "S")

                    # convert the longitude to degrees, decimal-minutes
                    degrees = int(r[2])
                    minutes = (r[2] - degrees) * 60
                    lon = "{:02d}{:05.2f}{}".format(abs(degrees), abs(minutes), "E" if r[2] >= 0 else "W")

                    # create a string for the TTL value
                    ttl_string = ""
                    if r[3]:
                        ttl = float(r[3]) / 60.0
                        ttl_string = "Time to live: " + str(int(ttl)) + ("min" if int(ttl) == 1 else "mins")

                    # Create the flight descent coefficient string
                    coef_string = ""
                    if r[4]:
                        coef_string = " coef:" + str(r[4])
          
                    objectPacket = ";" + objectname + "*" + timestring + "h" + lat + "\\" + lon + "<000/000" + "Predicted landing for " + callsign + ". " + ttl_string + coef_string + " (from " + self.callsign + ")"
                    infoStrings.append(objectPacket)

            except pg.DatabaseError as error:
                infocur.close()
                self.dbconn.close()
                debugmsg(error)

        # Close the database connection
        #debugmsg("Closing database connections...")
        #self.dbconn.close()
        return infoStrings


    ################################
    # This returns a string that contains the surface wind data
    def surface_winds(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # Information string
        infoStrings = []

        # Loop through the list of beacons
        for rec in flightrecords:

            # this is the flightid
            fid = rec[0]

            # callsign
            callsign = rec[1]

            debugmsg("============ infocmd surface winds processing: %s : %s ==========" % (fid, callsign))

            # Get the surface winds near the landing area
            winds, valid = self.getSurfaceWinds(fid)

            if valid:
                infoString = "{{{{z{}|W|{:.8f},{:.8f}".format(fid, winds[0], winds[1])
                infoStrings.append(infoString)
       
        # Close the database connection
        #debugmsg("Closing database connections...")
        #self.dbconn.close()
        return infoStrings


    ################################
    # This returns a string that contains the telemetry from the first few APRS packets for the callsign
    def packets(self, flightrecords):

        # Check if we're connected to the database or not.
        if not self.connectToDatabase():
            return ""

        if self.dbconn.closed:
            return ""

        # Database cursor
        infocur = self.dbconn.cursor()

        # Information string
        infoStrings = []

        try:

            # Loop through the list of beacons 
            for rec in flightrecords:
            
                # this is the flightid
                fid = rec[0]

                # callsign
                callsign = rec[1]

                debugmsg("============ infocmd packets processing: %s : %s ==========" % (fid, callsign))

                # launchsite particulars
                launchsite = { 
                        "flightid" : str(fid), 
                        "name" : str(rec[2]),
                        "lat" : float(rec[3]),
                        "lon" : float(rec[4]),
                        "elevation" : float(rec[5])
                        }


                # Get a list of the latest packets for this callsign
                # latestpackets columns:  
                #    altitude, 
                #    altitude_change_rate, 
                #    latitude_change_rate, 
                #    longitude_change_rate, 
                #    elapsed_mins
                latestpackets =  np.array(self.getLatestPackets(callsign))
                debugmsg("latestpackets.shape: %s" % str(latestpackets.shape))

                # Have there been any packets heard from this callsign yet? 
                if latestpackets.shape[0] > 0:
                    debugmsg("latestpackets[0]:  %s, %f, %f, %f" % (latestpackets[0,0], 
                        latestpackets[0,1],
                        latestpackets[0,2],
                        latestpackets[0,3]
                        ))
                    debugmsg("latestpackets[-1]:  %s, %f, %f, %f" % (latestpackets[-1,0], 
                        latestpackets[-1,1],
                        latestpackets[-1,2],
                        latestpackets[-1,3]
                        ))
                # ...if no packets heard, then return.
                else:
                    debugmsg("No packets heard from this callsign: %s" % callsign)
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue

                # Timestamp of the last packet we've heard from the flight
                elapsed_mins = latestpackets[-1, 3]
                debugmsg("Elapsed time since last packet[%s:%s]: %d mins" %(fid, callsign, elapsed_mins))

                # If amount of elapsed time since the last packet from the flight is greater than our timeout value, then we abort and exit.
                # No sense in creating a prediction for a flight that is over.
                if elapsed_mins > self.timeout:
                    debugmsg("Elapsed time (%d mins) greater than timeout (%d mins), not creating infocmd." %(elapsed_mins, self.timeout))
                    debugmsg("============ end processing:   %s : %s ==========" % (fid, callsign))
                    continue


                # slice (aka list) of just the altitude columns
                altitudes = latestpackets[0:, 1]

                # find the maximum altitude and note the index position of that value
                idx = np.argmax(altitudes)
                max_altitude = altitudes[idx]
               
                # split the latestpackets list into two portions based on the index just discovered and convert to numpy arrays and trim off the timestamp column
                ascent_portion = np.array(latestpackets[0:(idx+1), 0:], dtype='f')
                descent_portion = np.array(latestpackets[idx:, 0:], dtype='f')
                debugmsg("ascent_portion.shape: %s" % str(ascent_portion.shape))
                debugmsg("descent_portion.shape: %s" % str(descent_portion.shape))

                # Loop through the ascent rates heard thus far until we find a value where the ascent rate (ft/s) is > 5ft/s.  This eliminates
                # those early packets from the beacons prior to actual launch...we don't want those.
                loop_limit = ascent_portion.shape[0] - 1
                loop_counter = 0
                if ascent_portion.shape[0] > 0:
                    while ascent_portion[loop_counter, 1] < 5 and loop_counter < loop_limit:
                        loop_counter += 1
                
                if loop_counter > 0:
                    # We trim off those packets from the beginning of the flight that don't matter.  Only want to keep those packets from just before
                    # the balloon is launched (aka the altitude starts to rise).  If this flight has yet to start ascending, then this array will only have 
                    # one two packets.
                    ascent_portion = ascent_portion[(loop_counter-1):,0:]

                    # This sets the first packet for our ascent_rates array to have the same altitude, latitude, and longitude change rates.
                    # reference:  columns:  altitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
                    ascent_portion[0,1] = ascent_portion[1,1]
                    ascent_portion[0,2] = ascent_portion[1,2]
                    ascent_portion[0,3] = ascent_portion[1,3]

                k = 1
                for lim in [6, 12, 18]:
                    infocmd = "{{{{z{}|A{:d}".format(callsign, k)
                    i = 0
                    for row in ascent_portion[lim-6:lim,]:
                        if row[0] < 20000:
                            # infopacket format:  altitude, altitude_rate, latitude_rate, longitude_rate
                            infopacket = "{:.0f},{:.2f},{:.6f},{:.6f}".format(round(row[0]), round(row[1],2), round(row[2], 6), round(row[3], 6))
                            infocmd = infocmd + "|" + infopacket
                            i += 1
                    if i  > 0:
                        infoStrings.append(infocmd)

                    k += 1

                debugmsg("============ end infocmd processing:   %s : %s ==========" % (fid, callsign))


        except pg.DatabaseError as error:
            infocur.close()
            self.dbconn.close()
        except (KeyboardInterrupt, SystemExit):
            infocur.close()
            self.dbconn.close()

        # Close the database connection
        #debugmsg("Closing database connections...")
        infocur.close()
        #self.dbconn.close()

        # Return the information string
        return infoStrings

    ################################
    #END processInfoCmd()
    ################################



##################################################
# runInfoCmd process
##################################################
def runInfoCmd(schedule, e, config):
    try:

        # Create a new LandingPredictor object
        debugmsg("Starting infocmd process.")
        debugmsg("callsign: %s, dw_channel: %d" % (config["callsign"] + "-" + config["ssid"], config["xmit_channel"]))
        if config["includeeoss"] == "true" and config["eoss_string"] != "":
            via = config["eoss_string"] + ",WIDE1-1,WIDE2-1"
        else:
            via = "WIDE1-1,WIDE2-1"

        infocmd = infoCmd(config["callsign"] + "-" + config["ssid"], habconfig.dbConnectionString, timezone = config["timezone"], dw_channel = int(config["xmit_channel"]), viapath = via)

        # run the infocmd processor function continuously, every "schedule" seconds.
        e.wait(10)
        while not e.is_set():
            infocmd.processInfoCmd()
            e.wait(schedule)

    except (KeyboardInterrupt, SystemExit): 
        print "infoCmd ended"
        pass


