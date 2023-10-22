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

    // If a callsign was given, then just grab all packets for that callsign only
    if ($get_callsign != "") 
        $get_callsign = " and y.callsign = '" . $get_callsign . "' ";

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
            y.ptype,
            y.hash, 
            y.raw,
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
            y.source


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

                    -- This is the union below here...
                    from 
                    (
                        -- This is the internet-only side of the union
                        select distinct
                        date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                        case
                            when a.raw similar to '%[0-9]{6}h%' then
                                date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::timestamp)::timestamp without time zone
                            else
                                date_trunc('milliseconds', a.tm)::timestamp without time zone
                        end as packet_time,
                        a.callsign, 
                        f.flightid,
                        a.altitude,
                        a.comment, 
                        a.symbol, 
                        a.speed_mph,
                        a.bearing,
                        cast(ST_Y(a.location2d) as numeric) as lat,
                        cast(ST_X(a.location2d) as numeric) as lon,
                        NULL as sourcename,
                        NULL as heardfrom,
                        -1 as freq,
                        -1 as channel,

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
                        a.source

                        from packets a 
                        left outer join (
                            select distinct on (z.hash)
                            z.hash,
                            z.callsign,
                            max(z.tm) as thetime

                            from
                            packets z

                            where
                            z.location2d != '' 
                            and z.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time) 
                            and z.tm > to_timestamp(cast($8 as bigint))
                            and (z.source like 'direwolf%' or z.source like 'ka9q-radio%')

                            group by
                            z.hash,
                            z.callsign

                            order by
                            z.hash
                        ) as dw on dw.callsign = a.callsign and dw.hash = a.hash and dw.thetime >= (a.tm - interval '00:00:08') and dw.thetime < (a.tm + interval '00:00:08'),
                        flights f,
                        flightmap fm

                        where 
                        a.location2d != '' 
                        and dw.hash is null
                        and a.tm > (now() - (to_char(($3)::interval, 'HH24:MI:SS'))::time) 
                        and a.tm > to_timestamp(cast($9 as bigint))
                        and (a.source like 'direwolf%' or a.source like 'ka9q-radio%')
                        and fm.flightid = f.flightid
                        and f.active = 'y'
                        and a.callsign = fm.callsign

                    union
                    

                    -- This is the RF-only side of the union
                    select 
                        z.thetime,
                        z.packet_time,
                        z.callsign,
                        z.flightid,
                        z.altitude,
                        z.comment,
                        z.symbol,
                        z.speed_mph,
                        z.bearing,
                        z.lat,
                        z.lon,
                        z.sourcename,
                        case when array_length(z.path, 1) > 0 then
                            z.path[array_length(z.path, 1)]
                        else
                            z.sourcename
                        end as heardfrom,
                        z.freq,
                        z.channel,
                        z.temperature_k,
                        z.pressure_pa,
                        z.ptype,
                        z.hash,
                        z.raw,
                        z.source
                        
                        from
                            (
                            select distinct
                            date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                            case
                                when a.raw similar to '%[0-9]{6}h%' then
                                    date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $4)::timestamp)::timestamp without time zone
                                else
                                    date_trunc('milliseconds', a.tm)::timestamp without time zone
                            end as packet_time,
                            a.callsign, 
                            f.flightid,
                            a.altitude,
                            a.comment, 
                            a.symbol, 
                            a.speed_mph,
                            a.bearing,
                            cast(ST_Y(a.location2d) as numeric) as lat,
                            cast(ST_X(a.location2d) as numeric) as lon,

                            -- This is the source name.  Basically the name of the RF station that we heard this packet from
                            case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
                                split_part(a.raw, '>', 1)
                            else
                                NULL
                            end as sourcename,

                            -- The frequency this packet was heard on
                            round(a.frequency / 1000000.0,3) as freq, 

                            -- The Dire Wolf channel
                            a.channel,

                            -- The ranking of whether this was heard directly or via a digipeater
                            dense_rank () over (partition by a.hash order by cast(
                                cardinality((string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]) as int) asc, 
                                a.channel asc,
                                date_trunc('millisecond', a.tm) asc
                            ), 

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
                            case when a.raw similar to '%>%:%' then
                                (string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]
                            else
                                NULL
                            end as path,
                            a.source

                            from packets a 
                            left outer join (
                                select distinct on (z.hash)
                                z.hash,
                                z.callsign,
                                max(z.tm) as thetime

                                from
                                packets z

                                where
                                z.location2d != '' 
                                and z.tm > (now() - (to_char(($5)::interval, 'HH24:MI:SS'))::time) 
                                and z.tm > to_timestamp(cast($10 as bigint))
                                and (z.source like 'direwolf%' or z.source like 'ka9q-radio%')

                                group by
                                z.hash,
                                z.callsign

                                order by
                                z.hash
                            ) as dw on dw.callsign = a.callsign and dw.hash = a.hash and dw.thetime >= (a.tm + interval '00:00:08') and dw.thetime < (a.tm + interval '00:00:16'),
                            flights f,
                            flightmap fm

                            where 
                            dw.hash is null
                            and a.location2d != '' 
                            and a.tm > (now() - (to_char(($6)::interval, 'HH24:MI:SS'))::time) 
                            and a.tm > to_timestamp(cast($11 as bigint))
                            and fm.flightid = f.flightid
                            and f.active = 'y'
                            and a.callsign = fm.callsign
                            and (a.source like 'direwolf%' a.source like 'ka9q-radio%')

                            order by 
                            a.hash,
                            thetime,
                            a.callsign) as z

                        where 
                        z.dense_rank = 1

                        order by
                        thetime,
                        callsign

                    ) as c
                    -- c is the union

                ) as y
                -- y uses the window functions (i.e. lag) to calculate vert, lat, and lon rates.

            where 
                y.flightid = $7
                " . $get_callsign . " 

            order by
                y.callsign,
                y.packet_time asc
        ;
    ";


    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($get_flightid),
        $get_starttime,
        $get_starttime,
        $get_starttime,
        $get_starttime
        )
    );


    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    $allpackets = array();
    $packets = array();
    $statuspackets = array();
    $peak_altitude = 0;

    $time_prev = [];
    $altitude_prev = [];
    $hash_prev = [];
    $verticalrate = [];
    $i = 0;
    while ($row = sql_fetch_array($result)) {

        // all the data from this return row...
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $bearing = $row['bearing'];
        $speed_mph = $row['speed_mph'];
        $vert_rate = $row['vert_rate'];
        $hash = $row['hash'];
        $raw = $row['raw'];
        $ptype = $row['ptype'];

        if (strpos($thetime, ".") === false) {
            $time_trunc = $thetime;
            $microseconds = 0;
        }
        else
            list($time_trunc, $microseconds) = explode(".", $thetime);

        $allpackets[$callsign][] = array($time_trunc, $get_flightid, $callsign, $raw);

        if ($latitude != '' && $longitude !='' && $altitude != '') {
            // this is a position packet
            $packets[] = array($time_trunc, $callsign, $get_flightid, $symbol, $latitude, $longitude, $altitude, $comment, $speed_mph, $bearing, $vert_rate);
        }
        else if ($ptype == ">") {
            // this is a status packet
            $r = preg_split('/:>/', $raw);
            $statuspackets[] = array($time_trunc, $get_flightid, $callsign, $r[1]);
        }
    }    



    // Beginning of JSON output
    printf ("{");

    // Print out the position packets
    printf (" \"positionpackets\" : [");
    $i = 0;
    $positioninfo = array_reverse($packets);
    foreach ($positioninfo as $row) {
        if ($i >= $get_num)
            break;
        if ($i > 0)
            printf (", ");
        printf ("{ \"time\" : %s, \"callsign\" : %s, \"flightid\" : %s, \"symbol\" : %s, \"latitude\" : %s, \"longitude\" : %s, \"altitude\" : %s, \"comment\" : %s, \"speed\" : %s, \"bearing\" : %s, \"verticalrate\" : %s }", 
        json_encode($row[0]),
        json_encode($row[1]), 
        json_encode($row[2]), 
        json_encode($row[3]), 
        json_encode($row[4]), 
        json_encode($row[5]), 
        json_encode($row[6]), 
        json_encode($row[7]), 
        json_encode($row[8]), 
        json_encode($row[9]), 
        json_encode($row[10]));
        $i++;
    }
    printf (" ], ");


    // Print out the status packets
    printf (" \"statuspackets\" : [");
    $i = 0;
    $statuspackets_rev = array_reverse($statuspackets);
    foreach ($statuspackets_rev as $row) {
        if ($i >= $get_num)
            break;
        if ($i > 0)
            printf (", ");
        printf ("{ \"time\" : %s, \"flightid\" : %s, \"callsign\" : %s, \"packet\" : %s }", 
            json_encode($row[0]),
            json_encode($row[1]),
            json_encode($row[2]),
            json_encode($row[3]));
        $i++;
    }
    printf (" ], ");

    // Print out the status packets
    printf (" \"lastpacketpath\" : [");
    $firsttime = 1;
    ksort($allpackets);
    foreach ($allpackets as $c => $ray) {
        $c_rev = array_reverse($ray);
        $i = 0;
        $lastpath = "";
        foreach ($c_rev as $row) {
            if ($i >= 10)
                break;
            $pattern = '/qAO,' . $status["direwolfcallsign"] . '*:.*/i';
            $rf = preg_match($pattern, $row[3]);
            if ($rf == true)
                $lastpath = $lastpath . "R";
            else
                $lastpath = $lastpath . "I";
            $i++;
        }
        if (sizeof($c_rev) > 0) {
            if ($firsttime == 0)
                printf (", ");
            printf ("{ \"time\" : %s, \"flightid\" : %s, \"callsign\" : %s, \"lastpath\" : %s }", 
                json_encode($c_rev[0][0]),
                json_encode($get_flightid),
                json_encode($c),
                json_encode($lastpath));
        }
        $firsttime = 0;
    }
    printf (" ], ");
    printf (" \"flightid\" : %s", json_encode($get_flightid));


    // End of JSON output
    printf ("}");


    sql_close($link);


?>
