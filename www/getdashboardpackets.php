<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020, Jeff Deaton (N6BA)
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
    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
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

    ## query the last packets from stations...
    if ($get_flightid == "") {
        $query = "
            select distinct 
            date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
            a.callsign, 
            a.symbol, 
            round(a.speed_mph) as speed_mph,
            round(a.bearing) as bearing,
            round(a.altitude) as altitude, 
            a.comment, 
            round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
            round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
            case 
                when a.location2d != '' and m.location2d != '' then
                    round(cast (ST_DistanceSphere(m.location2d, a.location2d)*.621371/1000 as numeric), 2)
                else 
                    -99
            end as distance_miles,
            case 
                when a.location2d != '' and m.location2d != '' and a.altitude > 0 and m.altitude > 0 then
                    round(cast(degrees(atan((a.altitude - m.altitude) / (cast(ST_DistanceSphere(m.location2d, a.location2d) as numeric) * 3.28084))) as numeric), 2)
                else 
                    -99
            end as angle,
            case 
                when a.location2d != '' and m.location2d != '' then
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
            a.raw
            
            from 
            (
                select
                    c.tm,
                    c.callsign,
                    c.location2d,
                    c.bearing,
                    c.speed_mph,
                    c.altitude,
                    c.symbol,
                    c.comment,
                    c.raw

                    from (
                            select
                            t.tm,
                            t.callsign,
                            t.altitude,
                            t.location2d,
                            t.bearing,
                            t.speed_mph,
                            t.symbol,
                            t.comment,
                            t.raw,
                            dense_rank () over (partition by
                                t.callsign

                                order by
                                t.tm desc
                            )

                            from
                            packets t

                            where
                            t.tm > (now() - interval '00:20:00')

                            order by
                            t.tm asc

                    ) as c

                    where
                    c.dense_rank = 1
            ) as a,
            (select 
                g.tm,
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
            
            order by 
            thetime desc
            
            limit 20
            ;
        ";
        $result = pg_query($link, $query);
    }
    else {
        $query = "
            select
                y.thetime,
                y.packet_time,
                y.callsign,
                y.flightid,
                y.comment,
                y.symbol,
                round(y.altitude) as altitude,
                round(y.speed_mph) as speed_mph,
                round(y.bearing) as bearing,
                round(y.lat, 6) as latitude,
                round(y.lon, 6) as longitude,
                round((y.temperature_k - 273.15) * 9 / 5 + 32, 2) as temperature_f,
                round(y.pressure_pa / 101325, 4) as pressure_atm,
                y.sourcename,
                y.freq,
                y.channel,
                y.heardfrom,
                y.source,
                y.hash,
                case
                    when y.location2d != '' and gps.location2d != '' then
                        round(cast(ST_DistanceSphere(y.location2d, gps.location2d)*.621371/1000 as numeric), 2)
                    else
                        -99
                end as distance_miles,
                case
                    when y.location2d != '' and gps.location2d != '' then
                        round(cast(degrees(atan((y.altitude  - gps.altitude_ft) / (cast(ST_DistanceSphere(y.location2d, gps.location2d) as numeric) * 3.28084))) as numeric), 2)
                    else
                        -99
                end as angle,
                case
                    when y.location2d != '' and gps.location2d != '' then
                        round(cast(degrees(ST_Azimuth(gps.location2d, y.location2d)) as numeric), 2)
                    else
                        -99
                end as relative_bearing,
                case
                    when gps.bearing is not null then
                        round(cast(gps.bearing as numeric), 2)
                    else
                        -99
                end as myheading,
                floor(lp.ttl / 60.0) as ttl,
                y.raw

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
                        c.sourcename,
                        case when array_length(c.path, 1) > 0 then
                            c.path[array_length(c.path, 1)]
                        else
                            c.sourcename
                        end as heardfrom,
                        c.freq,
                        c.channel,
                        c.source

                        from (
                                select 
                                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                                case
                                    when a.raw similar to '%[0-9]{6}h%' then
                                        date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone 'America/Denver')::time)::time without time zone
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
                                case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%%' then
                                    split_part(a.raw, '>', 1)
                                else
                                    NULL
                                end as sourcename,
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

                                    order by 
                                    a.tm asc,
                                    --date_trunc('second', a.tm) asc,
                                    cast(
                                        cardinality(
                                            (
                                                array_remove(
                                                string_to_array(
                                                    regexp_replace(
                                                        split_part(
                                                            split_part(a.raw, ':', 1),
                                                            '>',
                                                            2),
                                                        ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)',
                                                        '',
                                                        'g'),
                                                    ',',''),
                                                NULL)
                                            )[2:]
                                    ) as int) asc,
                                    a.source asc,
                                    a.channel asc
                                ),
                                case when a.raw similar to '%>%:%' then
                                    (array_remove(string_to_array(regexp_replace(
                                                    split_part(
                                                        split_part(a.raw, ':', 1),
                                                        '>',
                                                        2),
                                                    ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)',
                                                    '',
                                                    'g'),
                                                ',',''), NULL))[2:]
                                else
                                    NULL
                                end as path

                                from 
                                packets a,
                                flights f,
                                flightmap fm

                                where 
                                a.tm > (now() - interval '00:20:00')
                                and fm.flightid = f.flightid
                                and f.active = 'y'
                                and a.callsign = fm.callsign
                                and f.flightid = $1

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
                    on lp.flightid = y.flightid and lp.callsign = y.callsign,
                    (
                        select 
                        g.tm, 
                        g.altitude_ft, 
                        g.location2d,
                        g.bearing 

                        from 
                        gpsposition g 

                        order by 
                        g.tm desc

                        limit 1
                    ) as gps

            order by 
            y.thetime desc
            
            limit 20
            ;
        ";
        $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    }

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $numrows = sql_num_rows($result);
    $rows = sql_fetch_all($result);

    if ($numrows > 0)
         printf ("%s", json_encode($rows));
    else
         printf ("[]");
    sql_close($link);


?>
