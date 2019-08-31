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


    ## function to calculate the speed betwen two points.
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

    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) != "")
            if ($get_flightid == "ALLPACKETS")
                $get_flightid = ""; 
    }


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## get the latest position from the gpsposition table
    $gpsquery = 'select 
        tm::timestamp without time zone as time, 
        round(speed_mph) as speed_mph, 
        bearing, 
        round(altitude_ft) as altitude_ft, 
        round(cast(ST_Y(location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(location2d) as numeric), 6) as longitude 

        from gpsposition 

        where 
        tm > (now() -  time \'01:30:00\')
      
        order by 
        tm desc limit 1;';

    $gpsresult = sql_query($gpsquery);
    if (!$gpsresult) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $gpsrow = sql_fetch_array($gpsresult);
    $numgpsrows = sql_num_rows($gpsresult);
    $GPS_STRING = "";
    if ($numgpsrows > 0) {
        $mylat = $gpsrow["latitude"];
        $mylon = $gpsrow["longitude"];
        $GPS_STRING = "round(cast(ST_DistanceSphere(ST_GeomFromText('POINT(" . $mylon . " " . $mylat . ")',4326), a.location2d)*.621371/1000 as numeric), 2)";
    }
    else
        $GPS_STRING = "-1";


    ## query the last packets from stations...
    if ($get_flightid == "") {
        $query = '
        select distinct 
        date_trunc(\'millisecond\', a.tm)::timestamp without time zone as thetime,
        a.callsign, 
        a.symbol, 
        round(a.speed_mph) as speed_mph,
        round(a.bearing) as bearing,
        round(a.altitude) as altitude, 
        a.comment, 
        round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
        case 
            when a.location2d != \'\' and m.location2d != \'\' then
                round(cast (ST_DistanceSphere(m.location2d, a.location2d)*.621371/1000 as numeric), 2)
            else 
                -99
        end as distance_miles,
        case 
            when a.location2d != \'\' and m.location2d != \'\' and a.altitude > 0 and m.altitude > 0 then
                round(cast(degrees(atan((a.altitude - m.altitude) / (cast(ST_DistanceSphere(m.location2d, a.location2d) as numeric) * 3.28084))) as numeric), 2)
            else 
                -99
        end as angle,
        case 
            when a.location2d != \'\' and m.location2d != \'\' then
                round(cast(degrees(ST_Azimuth(m.location2d, a.location2d)) as numeric), 2)
            else
                -99
        end as relative_bearing,
        case 
            when m.bearing is not null  then
                round(cast(m.bearing as numeric), 2)
            else
                -99
        end as myheading,
        raw
        
        from 
        packets a,
        (select 
            date_trunc(\'second\', g.tm)::timestamp without time zone as thetime, 
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
        a.tm > (now() -  time \'00:20:00\')
        
        order by 
        thetime desc
        
        limit 20;';
        $result = pg_query($link, $query);
    }
    else {
        $query = '
        select distinct 
        date_trunc(\'millisecond\', a.tm)::timestamp without time zone as thetime,
        a.callsign, 
        a.symbol, 
        round(a.speed_mph) as speed_mph,
        round(a.bearing) as bearing,
        round(a.altitude) as altitude, 
        a.comment, 
        round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
        case
            when a.location2d != \'\' then ' 
                . $GPS_STRING . ' 
            else
                -1
        end as distance_miles,
        raw
        
        from 
        packets a,
        flightmap fm,
        flights fl
        
        where 
        a.tm > (now() -  time \'00:20:00\')
        and fl.flightid = $1
        and fm.flightid = fl.flightid
        and a.callsign = fm.callsign 
        
        order by 
        thetime desc
        
        limit 20;';
        $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    }

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $numrows = sql_num_rows($result);
    $rows = sql_fetch_all($result);

    if ($rows[0]["altitude"] > 0) {
        $lastcallsign = $rows[0]["callsign"];
        $lastaltitude = $rows[0]["altitude"];
    }

    if ($numrows > 0)
         printf ("%s", json_encode($rows));
    else
         printf ("[]");
    sql_close($link);


?>
