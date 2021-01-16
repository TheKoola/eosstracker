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

    header("Content-Type:  application/json;");
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    # read in the status JSON file from the habtracker-daemon
    $ray = array();
    $ray["active"] = 0;
    $ray["rf_mode"] = 0;
    $ray["timezone"] = $config["timezone"];
    $ray["direwolfcallsign"] = $config["callsign"];

    $d = mktime(00, 00, 00, 1, 1, 2000);
    $ray["starttime"] = date("Y-m-d H:i:s", $d);
    $defaultStatusJSON = json_encode($ray);

    $statusJsonFile = "daemonstatus.json";
    $s = file_get_contents($documentroot . "/" . $statusJsonFile);
    if ($s === false) 
        $status = $ray;
    else {
        $status = json_decode($s, true);
        if (!array_key_exists("starttime", $status))
            $status["starttime"] = $ray["starttime"];
        if (!array_key_exists("timezone", $status))
            $status["timezone"] = $ray["timezone"];
        if (!array_key_exists("direwolfcallsign", $status))
            $status["direwolfcallsign"] = $ray["direwolfcallsign"];
    }

    $formerror = false;
    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true; 
 
    // If there isn't a flightid, then exit.
    if ($formerror == true) {
        printf ("[]");
        return 0;
    }

    // Check the callsign HTML GET variable
    $get_callsign = "";
    if (isset($_GET["callsign"])) 
        $get_callsign = strtoupper(check_string($_GET["callsign"], 20));

    // Check the num HTML GET variable
    $get_num = 5;
    if (isset($_GET["num"])) 
        if (check_number($_GET["num"], 0, 1000))
            $get_num = intval($_GET["num"]);


    // Check the starttime HTML GET variable
    // Must be > 1/1/2020 01:01:01
    // ...and <  12/31/2037 23:59:59
    $get_starttime = 1577840561;
    if (isset($_GET["starttime"]))
        if (check_number($_GET["starttime"], 1577840461, 2145916799))
            $get_starttime = intval($_GET["starttime"]);
        

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $query = "
        select
        *
        from 
        (
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
                        case when y.delta_secs > 0 then
                            round((60 * (y.altitude - y.previous_altitude) / y.delta_secs)::numeric)
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
                        round((y.temperature_k - 273.15) * 9 / 5 + 32, 2) as temperature_f,
                        round(y.pressure_pa / 101325, 4) as pressure_atm,
                        y.sourcename,
                        y.freq,
                        y.channel,
                        y.heardfrom,
                        y.source,
                        y.hash,
                        round(cast(ST_DistanceSphere(y.location2d, gps.location2d)*.621371/1000 as numeric), 2) as distance,
                        floor(cast(degrees(atan((y.altitude  - gps.altitude_ft) / (cast(ST_DistanceSphere(y.location2d, gps.location2d) as numeric) * 3.28084))) as numeric)) as angle,
                        floor(cast(degrees(ST_Azimuth(gps.location2d, y.location2d)) as numeric)) as relative_bearing,
                        floor(gps.bearing) as mybearing,
                        floor(lp.ttl / 60.0) as ttl,
                        y.elapsed_secs,
                        rank () over ( partition by y.callsign order by y.thetime desc)


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
                                                date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
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
                                        a.location2d != '' 
                                        and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time) 
                                        and a.tm > (to_timestamp($3)::timestamp)
                                        and fm.flightid = f.flightid
                                        and f.active = 'y'
                                        and a.callsign = fm.callsign
                                        and a.altitude > 0
                                        and f.flightid = $4

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
                            left outer join
                            (
                                select 
                                g.tm, 
                                g.altitude_ft, 
                                g.location2d,
                                g.bearing 

                                from 
                                gpsposition g 

                                where
                                g.tm > (now() - (to_char(($5)::interval, 'HH24:MI:SS'))::time)

                                order by 
                                g.tm desc

                                limit 1
                            ) as gps
                            on gps.tm::date = y.thetime::date

                        order by
                            y.callsign,
                            y.packet_time asc

           ) as packets

        where
        packets.rank = 1

        order by
        packets.thetime asc

        limit 1

        ;

    ";


    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        $get_starttime,
        sql_escape_string($get_flightid),
        sql_escape_string($config["lookbackperiod"] . " minute")
        )
    );


    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    if ($numrows > 0) {
        $rows = sql_fetch_all($result);
        $row = $rows[0];
        printf("%s", json_encode($row));
    }    
    else
        printf("[]");

    sql_close($link);


?>
