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


##################################################
# This contains a consolidated list of functions that will query the database for various things.  
# The idea being that these queries are common across the platform and consolidating them here 
# would make it easier to maintain.
# 
# All of these functions require a valid and open connection the postgresql database.
#
# def getFlights(dbconn):
# def getLatestPackets(dbconn, callsign = None, timezone = None, timecutoff_mins = 20):
# def getSurfaceWinds(dbconn, flightid):
# def getLandingElevation(dbconn, balloon_callsign, distance):
# def getGPSPosition(dbconn):
# def getPredictFile(dbconn, flightid = '', launchsite = ''):
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



################################
# Function for querying the database to get a list of active flightids and the beacon's callsigns assigned to those flights.
# The resulting list of flights and callsigns is returned
def getFlights(dbconn):

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
    
    try:

        rows = None

        # Execute the query and get the list of flightids
        if dbconn:
            if not dbconn.closed:
                landingcur = dbconn.cursor()
                landingcur.execute(flightids_sql)
                rows = landingcur.fetchall()
                landingcur.close()

                if debug:
                    flightlist = ""
                    for r in rows:
                        flightlist += " " + r[0] + ":" + r[1]
                    debugmsg("List of flights[%d]:%s" % (len(rows), flightlist))

        # columns for returned array:  flightid, callsign, launchsite name, launchsite lat, launch lon, launchsite elevation
        if rows:
            return np.array(rows)
        else:
            return np.array([])

    except pg.DatabaseError as error:
        # If there was a connection/database error
        landingcur.close()
        print error
        sys.stdout.flush()
        return np.array([])
    

################################
# Function for querying the database to get a list of latest packets for the provided callsign
# The resulting list of packets is returned if no callsign is given then an empty list is returned
# columns returned in the list:  altitude, latitude, longitude, altitude_change_rate, latitude_change_rate, longitude_change_rate
def getLatestPackets(dbconn, callsign = None, timezone = None, timecutoff_mins = 20):

    # if a callsign wasn't provided, then return a empty numpy array
    if not dbconn or not callsign or not timezone:
        return []

    # if the db connection isn't valid then return 
    if dbconn.closed:
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
    checkcur = dbconn.cursor()
    checkcur.execute(check_sql, [ callsign.upper() ])
    checkrows = checkcur.fetchall()
    checkcur.close()

    if len(checkrows) > 0:
        elapsed_mins = checkrows[-1][0] / 60.0
        # If the last heard packet is > xx mins old, return zero rows.  We don't want to process a landing prediction for a flight that is over/stale/lost/etc.
        if elapsed_mins > timecutoff_mins:
            debugmsg("Last packet for %s is > %dmins old: %dmins." % (callsign, timecutoff_mins, elapsed_mins))
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
                                a.tm asc,
                                a.channel desc
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
                    and abs(extract('epoch' from (c.thetime::time - c.packet_time::time))) < 120

                ) as y
                
            where
                abs(y.lat - y.previous_lat) < 1 
                and abs(y.lon - y.previous_lon) < 1 
                and abs(y.altitude - y.previous_altitude) < 10000

            order by
                y.callsign,
                y.packet_time asc
        ;
    """
                      
    try:

        # Execute the SQL statment and get all rows returned
        landingcur = dbconn.cursor()
        landingcur.execute(latestpackets_sql, [ timezone, callsign.upper() ])
        rows = landingcur.fetchall()
        landingcur.close()

        if len(rows) > 0:
            # If the last heard packet is > xx mins old, return zero rows....because we don't want to process a landing prediction for a flight that is over/stale/lost/etc.
            if rows[-1][7] > timecutoff_mins:
                debugmsg("Last packet for %s is > %dmins old: %dmins." % (callsign, timecutoff_mins, rows[-1][7]))
                return []

        return rows

    except pg.DatabaseError as error:
        # If there was a connection/database error
        landingcur.close()
        print error
        sys.stdout.flush()
        return []


################################
# This will query the database looking for weather stations near the latest landing prediction and/or the current
# location (from GPS).  
# This will return a list containing two surface wind values:
#    returned tuple:  [ lat_wind_rate, lon_wind_rate ], validity
#
def getSurfaceWinds(dbconn, flightid):

    # Check if we're connected to the database then return
    if not dbconn or flightid is None:
        return ([], False)

    try: 
        validity = False

        # Execute the SQL statment and get all rows returned
        wxcur = dbconn.cursor()

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
        print error
        sys.stdout.flush()
        return ([], False)


################################
# Function to query the database for those stations nearest to a predicted landing location (ranked by distance), 
# and compute a weighted average of the estimated elevation at the predicted landing 
def getLandingElevation(dbconn, balloon_callsign, distance):

    # Check if we're connected to the database or not.
    if not dbconn or balloon_callsign is None or distance is None: 
        return 0.0

    if distance <= 0:
        return 0.0

    try: 
        # database cursor
        elev_cur = dbconn.cursor()

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
                    flights f left outer join ( select s.launchsite, s.alt from launchsites s) as lh on lh.launchsite = f.launchsite,
                    flightmap fm
                    left outer join
                    (
                        select
                            r.tm as thetime,
                            r.flightid,
                            r.callsign,
                            r.location2d,
                            r.rank
                        
                        from 
                        ( 
                            select
                                l.tm,
                                l.flightid,
                                l.callsign,
                                l.location2d,
                                rank () over (partition by l.flightid, l.callsign order by l.tm desc)

                            from
                                landingpredictions l

                            where
                                l.tm > (now() - interval '06:00:00')

                            order by
                                l.tm desc,
                                l.flightid,
                                l.callsign
                        ) as r

                        where 
                        r.rank = 1

                        order by
                        r.tm desc

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
                    and a.altitude > .1 * lh.alt
                    and lh.alt is not null

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
            elevation = float(rows[0][1])
        else:
            elevation = 0.0

        # Close the database cursor
        elev_cur.close()

        # return the elevation
        return elevation

    except pg.DatabaseError as error:
        # If there was a connection/db error
        elev_cur.close()
        print error
        sys.stdout.flush()
        return 0.0


################################
# Function to query the database for latest GPS position and return an object containing alt, lat, lon.
def getGPSPosition(dbconn):

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
        if not dbconn:
            return gpsposition

        # Execute the SQL statment and get all rows returned
        landingcur = dbconn.cursor()
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
        # If there was a connection/db error
        landingcur.close()
        print error
        sys.stdout.flush()
        return gpsposition


################################
# Get a list of rows from a predict file, if it was loaded into the database
def getPredictFile(dbconn, flightid = '', launchsite = ''):

    # if the flightid or the launchsite wasn't given, then return an empty list
    if not dbconn or not flightid or not launchsite:
        return np.array([])

    # SQL to query flight prediction records for the flightid
    prediction_sql = """
        select
        p.altitude,
        p.latitude,
        p.longitude,
        case when p.delta_secs > 0 then
            round((60 * (p.altitude - p.previous_altitude) / p.delta_secs)::numeric)
        else
            0
        end as vert_rate,
        p.delta_secs


        from
        (
            select 
            d.thedate,
            d.thetime,
            d.altitude, 
            d.latitude, 
            d.longitude,
            lag(d.altitude, 1) over(order by d.thedate, d.thetime)  as previous_altitude,
            extract ('epoch' from (d.thetime - lag(d.thetime, 1) over (order by d.thedate, d.thetime))) as delta_secs

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
        ) as p

        order by
        p.thedate,
        p.thetime
        ;
        """

    try:

        # Execute the SQL statment and get all rows returned
        #     For reference: columns for flightids: flightid, callsign, launchsite, lat, lon, alt
        landingcur = dbconn.cursor()
        landingcur.execute(prediction_sql, [ flightid, launchsite ])
        rows = landingcur.fetchall()
        landingcur.close()

        debugmsg("Predict file length: %d" % len(rows))
        if len(rows) > 0:
            debugmsg("Predict file last: %f, %f, %f" % (rows[-1][0], rows[-1][1], rows[-1][2]))

        return np.array(rows)

    except pg.DatabaseError as error:
        # If there was a connection/db error
        landingcur.close()
        print error
        sys.stdout.flush()
        return np.array([])


################################
# Test function for connecting to the database
def test_connectToDatabase(db_connection_string = None):
    if db_connection_string:
        dbstring = dbstring
    else:
        dbstring = habconfig.dbConnectionString

    try:

        # The database connection
        dbconn = None

        # If not already connected to the database, then try to connect
        debugmsg("Connecting to the database: %s" % dbstring)
        dbconn = pg.connect (dbstring)
        dbconn.set_session(autocommit=True)

        return dbconn

    except pg.DatabaseError as error:
        # If there was a connection error
        dbconn.close()
        print error
        sys.stdout.flush()
        return None


################################
# Function for testing the query routines
def test_queries():

    # connect to the postgresql database
    dbconn = test_connectToDatabase()

    # get the list of active flights
    flights = getFlights(dbconn)

    # get our current location
    gps = getGPSPosition(dbconn)

    print "======================= GPS Position ======================="
    print gps

    print "======================= Active Flights ======================="
    print flights

    for f in flights:

        # Each flight record contains these fields
        # flightid, 
        # callsign,
        # launchsite,
        # lat,
        # lon,
        # alt

        flightid = f[0]
        callsign = f[1]
        launchsite = f[2]

        latest = getLatestPackets(dbconn, callsign, 'America/Denver')
        winds = getSurfaceWinds(dbconn, flightid)
        landing = getLandingElevation(dbconn, callsign, 20)
        predict = getPredictFile(dbconn, flightid, launchsite)

        print "======================= Latest Packets (" + flightid + "::" + callsign + ") ======================="
        print latest

        print "======================= Surface Winds (" + flightid + "::" + callsign + ") ======================="
        print winds

        print "======================= Landing Elevation (" + flightid + "::" + callsign + ") ======================="
        print landing

        print "======================= Predict File (" + flightid + "::" + callsign + ") ======================="
        print predict

    dbconn.close()
    print "Done."
