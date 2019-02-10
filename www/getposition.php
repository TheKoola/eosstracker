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
    #$query = 'select max(tm)::timestamp without time zone as time, speed_mph, bearing, altitude_ft, ST_Y(location2d) as latitude, ST_X(location2d) as longitude from gpsposition group by speed_mph, bearing, altitude_ft, latitude, longitude;';
    $query = 'select tm::timestamp without time zone as time, round(speed_mph) as speed_mph, bearing, round(altitude_ft) as altitude_ft, round(cast(ST_Y(location2d) as numeric), 6) as latitude, round(cast(ST_X(location2d) as numeric), 6) as longitude from gpsposition order by tm desc limit 1;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    $rows = sql_fetch_array($result);
    $feature['type'] = "Feature";
    $feature['properties']['speed_mph'] = $rows['speed_mph'];
    $feature['properties']['altitude'] = $rows['altitude_ft'];
    $feature['properties']['bearing'] = $rows['bearing'];
    $feature['properties']['time'] = $rows['time'];
    $feature['geometry']['type'] = "Point";
    $feature['geometry']['coordinates'] = array($rows['longitude'], $rows['latitude']); 
    printf ("%s", json_encode($feature));

    sql_close($link);

?>
