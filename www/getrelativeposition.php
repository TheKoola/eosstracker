<?php
/*
*
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
*
 */

    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    function coord_distance($lat1, $lon1, $lat2, $lon2) {
        $p = pi()/180;
        $a = 0.5 - cos(($lat2 - $lat1) * $p)/2 + cos($lat1 * $p) * cos($lat2 * $p) * (1 - cos(($lon2 - $lon1) * $p))/2;
        return (12742 * asin(sqrt($a)))*.6213712;
    }

    function calc_speed($lat1, $lon1, $lat2, $lon2, $start, $end) {
        $p = pi()/180;
        $a = 0.5 - cos(($lat2 - $lat1) * $p)/2 + cos($lat1 * $p) * cos($lat2 * $p) * (1 - cos(($lon2 - $lon1) * $p))/2;
        $dist = (12742 * asin(sqrt($a)))*.6213712;

        $time1 = date_create($start);
        $time2 = date_create($end);
        $diff = date_diff($time2, $time1);
        $time_delta = $diff->h + (($diff->i * 60) + $diff->s)/3600; 
        
        // in MPH.. 
        if ($time_delta > 0)
            $speed = abs($dist / $time_delta);
        else
            $speed = 312;
    
        return $speed;
    }

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }
    
    ## get the latest position from the gpsposition table
    $query = "select distinct on (f.flightid)
f.flightid,
date_trunc('second', b.thetime)::timestamp without time zone as time,
round(cast (ST_Y(b.location2d) as numeric), 3) as latitude,
round(cast (ST_X(b.location2d) as numeric), 3) as longitude,
round(cast (ST_DistanceSphere(m.location2d, b.location2d)*.621371/1000 as numeric), 2) as distance,
round(cast(degrees(atan((b.altitude  - m.altitude) / (cast(ST_DistanceSphere(m.location2d, b.location2d) as numeric) * 3.28084))) as numeric)) as angle,
round(cast(m.bearing as numeric)) as myheading,
round(cast(degrees(ST_Azimuth(m.location2d, b.location2d)) as numeric)) as bearing

from
flights f,
flightmap fm,
(
select  distinct
a.hash,
a.tm::timestamp without time zone as thetime,
a.location2d,
a.altitude,
a.callsign

from
packets a inner join
(
select
a.callsign,
max(a.tm) as thetime

from
packets a,
flights f,
flightmap fm

where
a.callsign = fm.callsign
and f.flightid = fm.flightid
and a.location2d is not null
and f.active = 't'

group by
a.callsign

order by
a.callsign
) as b 
on a.callsign = b.callsign
and a.tm = b.thetime

order by
a.hash, 
a.callsign
) as b,

(
select 
date_trunc('second', g.tm)::timestamp without time zone as thetime, 
g.location2d,
g.bearing,
g.altitude_ft as altitude

from 
gpsposition g

where
g.location2d is not null

order by 
1 desc 
limit 1
) as m

where
fm.callsign = b.callsign
and f.flightid = fm.flightid
and f.active = 't'
and b.thetime > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)

order by
f.flightid,
b.thetime desc;";

    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute")));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
  
    $rows = [];
    $rows = sql_fetch_all($result);
    if (sql_num_rows($result) > 0)
        printf ("%s", json_encode($rows));
    else
        printf ("[]");

    sql_close($link);

?>
