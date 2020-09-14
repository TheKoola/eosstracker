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

    $formerror = false;

    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
        else
            $whereclause = " and t.flightid = $1 ";
    }
    else
        $formerror = true;


    // Check the starttime HTML GET variable
    // Must be > 1/1/2020 01:01:01
    // ...and <  12/31/2037 23:59:59
    $get_starttime = 1577840561;
    if (isset($_GET["starttime"]))
        if (check_number($_GET["starttime"], 1577840461, 2145916799))
            $get_starttime = intval($_GET["starttime"]);

    if ($formerror == true) {
        printf ("[]");
        return 0;
    }

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    // Function to create the JSON needed for the GeoJSON feature
    function createFeatureJSON($packet_array) {
        if (is_null($packet_array) || empty($packet_array) || ! is_array($packet_array))
            return "[]";

        global $config;

        // Column list should be:
        // 0 thetime, 
        // 1 packet_time, 
        // 2 callsign, 
        // 3 flightid,
        // 4 comment,
        // 5 symbol,
        // 6 altitude,
        // 7 speed_mph,
        // 8 bearing,
        // 9 latitude,
        // 10 longitude,
        // 11 vert_rate,
        // 12 lat_rate,
        // 13 lon_rate,
        // 14 elapsed_mins,
        // 15 temperature_f,
        // 16 pressure_atm
        //

        $callsign = $packet_array["callsign"];
        $flightid = $packet_array["flightid"];

        $json = array();
        $json["type"] = "Feature";
        $json["properties"]["id"] = $callsign;
        $json["properties"]["time"] = $packet_array["thetime"];
        $json["properties"]["packet_time"] = $packet_array["packet_time"];
        $json["properties"]["callsign"] = $callsign;
        $json["properties"]["flightid"] = $flightid;
        $json["properties"]["symbol"] = $packet_array["symbol"];
        $json["properties"]["altitude"] = $packet_array["altitude"];
        $json["properties"]["comment"] = "Flight: <strong>" . $flightid. "</strong>" . ($packet_array["comment"] == "" ? "" : "<br>" . $packet_array["comment"]) . "<br>Speed: " . $packet_array["speed_mph"] . " mph<br>Heading: " . $packet_array["bearing"] . "&#176;<br>Vert Rate: " . number_format($packet_array["vert_rate"]) . " ft/min";
        $json["properties"]["tooltip"] = $callsign;
        $json["properties"]["objecttype"] = "balloon"; 
        $json["properties"]["speed"] = ($packet_array["speed_mph"] == null ? "" : $packet_array["speed_mph"]); 
        $json["properties"]["bearing"] = ($packet_array["bearing"] == null ? "" : $packet_array["bearing"]);
        $json["properties"]["verticalrate"] = ($packet_array["vert_rate"] == null ? "" : $packet_array["vert_rate"]); 
        $json["properties"]["label"] = $callsign . "<br>" . number_format($packet_array["altitude"]) . "ft"; 
        $json["properties"]["iconsize"] = $config["iconsize"];
        $json["properties"]["temperature"] = ($packet_array["temperature_f"] == null ? "" : $packet_array["temperature_f"]);
        $json["properties"]["pressure"] = ($packet_array["pressure_atm"] == null ? "" : $packet_array["pressure_atm"]);
        $json["properties"]["myheading"] = $packet_array["mybearing"];
        $json["properties"]["rel_bearing"] = $packet_array["relative_bearing"];
        $json["properties"]["rel_angle"] = $packet_array["angle"];
        $json["properties"]["rel_distance"] = $packet_array["distance"];
        $json["properties"]["source"] = $packet_array["source"];
        $json["properties"]["ttl"] = ($packet_array["ttl"] == null ? "" : $packet_array["ttl"]);
        $json["geometry"]["type"] = "Point";
        $json["geometry"]["coordinates"][]= $packet_array["longitude"];
        $json["geometry"]["coordinates"][]= $packet_array["latitude"];

        return $json;
    }


    // Function to create the JSON needed for the GeoJSON feature
    function createOtherJSON($packet_array) {
        if (is_null($packet_array) || empty($packet_array) || ! is_array($packet_array))
            return "[]";

        if (count($packet_array) < 1)
            return "[]";

        global $config;

        // Column list should be:
        // 0 thetime, 
        // 1 packet_time, 
        // 2 callsign, 
        // 3 flightid,
        // 4 comment,
        // 5 symbol,
        // 6 altitude,
        // 7 speed_mph,
        // 8 bearing,
        // 9 latitude,
        // 10 longitude,
        // 11 vert_rate,
        // 12 lat_rate,
        // 13 lon_rate,
        // 14 elapsed_mins,
        // 15 temperature_f,
        // 16 pressure_atm

        $linestring = array();
        $json = array();
        $breadcrumbsJson = array();
        
        // Get the callsign and flightid from the first row
        $callsign = $packet_array[0]["callsign"];
        $flightid = $packet_array[0]["flightid"];

        // Loop variables
        $max_altitude = 0;
        $max_altitude_idx = 0;
        $i = 0;

        // Loop through each row saving the coordinates in an array and finding the max altitude
        foreach ($packet_array as $row) { 

            // the array of coordinates
            $linestring[] = array($row["longitude"], $row["latitude"]);

            // Looking for the maximum altitude
            if ($row["altitude"] > $max_altitude) {
                $max_altitude = $row["altitude"];
                $max_altitude_idx = $i;
            }

            $tmpJson = array();
            $tmpJson["type"] = "Feature";
            $tmpJson["properties"]["id"] = $callsign . "_point_" . $i;
            $tmpJson["properties"]["time"] = $row["thetime"];
            $tmpJson["properties"]["packet_time"] = $row["packet_time"];
            $tmpJson["properties"]["callsign"] = $callsign;
            $tmpJson["properties"]["flightid"] = $flightid;
            $tmpJson["properties"]["symbol"] = "/J";
            $tmpJson["properties"]["ascending"] = ($row["vert_rate"] > 0 ? "true" : "false");
            $tmpJson["properties"]["altitude"] = $row["altitude"];
            $tmpJson["properties"]["comment"] = "Flight: <strong>" . $flightid. "</strong><br>Speed: " . $row["speed_mph"] . " mph<br>Heading: " . $row["bearing"] . "&#176;<br>Vert Rate: " . number_format($row["vert_rate"]) . " ft/min";
            //$tmpJson["properties"]["tooltip"] = number_format($row["altitude"]) . "ft"; 
            $tmpJson["properties"]["objecttype"] = "balloonmarker"; 
            $tmpJson["properties"]["speed"] = ($row["speed_mph"] == null ? "" : $row["speed_mph"]); 
            $tmpJson["properties"]["bearing"] = ($row["bearing"] == null ? "" : $row["bearing"]);
            $tmpJson["properties"]["verticalrate"] = ($row["vert_rate"] == null ? "" : $row["vert_rate"]); 
            //$tmpJson["properties"]["label"] = number_format($row["altitude"]) . "ft"; 
            $tmpJson["properties"]["iconsize"] = $config["iconsize"];
            $tmpJson["properties"]["temperature"] = ($row["temperature_f"] == null ? "" : $row["temperature_f"]);
            $tmpJson["properties"]["pressure"] = ($row["pressure_atm"] == null ? "" : $row["pressure_atm"]);
            $tmpJson["properties"]["source"] = ($row["source"] == null ? "" : $row["source"]);
            $tmpJson["properties"]["ttl"] = ($row["ttl"] == null ? "" : $row["ttl"]);
            $tmpJson["geometry"]["type"] = "Point";
            $tmpJson["geometry"]["coordinates"][]= $row["longitude"];
            $tmpJson["geometry"]["coordinates"][]= $row["latitude"];


            $breadcrumbsJson[] = $tmpJson;
            unset($tmpJson);

            $i += 1;
        }

        // Remove the last element from the breadcrumbs as that location is where the balloon icon itself will be
        unset($breadcrumbsJson[count($packet_array) - 1]);

        if (count($linestring) > $max_altitude_idx + 1) { // the flight is now descending...which means we'll have an ascent and a descent portion
            $ascent_portion = array_slice($linestring, 0, $max_altitude_idx + 1); 
            $descent_portion = array_slice($linestring, $max_altitude_idx);

            // Remove the burst altitude point from the breadcrumb list as that location is where the burst icon will be
            unset($breadcrumbsJson[$max_altitude_idx]);

            // the latest reported time from the beacon
            $maxtime = end($packet_array)["thetime"];


            // The ascent portion JSON
            $ascentJson = array();
            $ascentJson["type"] = "Feature";
            $ascentJson["properties"]["id"] = $callsign . "_ascent_path";
            $ascentJson["properties"]["ascending"] = "true";
            $ascentJson["properties"]["objecttype"] = "balloonpath";
            $ascentJson["properties"]["time"] = $maxtime;
            $ascentJson["properties"]["flightid"] = $flightid;
            $ascentJson["geometry"]["type"] = "LineString";
            $ascentJson["geometry"]["coordinates"] = $ascent_portion;

            // The descent portion JSON
            $descentJson = array();
            $descentJson["type"] = "Feature";
            $descentJson["properties"]["id"] = $callsign . "_descent_path";
            $descentJson["properties"]["ascending"] = "false";
            $descentJson["properties"]["objecttype"] = "balloonpath";
            $descentJson["properties"]["flightid"] = $flightid;
            $descentJson["properties"]["time"] = $maxtime;
            $descentJson["geometry"]["type"] = "LineString";
            $descentJson["geometry"]["coordinates"] = $descent_portion;

            // The burst object JSON
            $burstJson = array();
            $burstJson["type"] = "Feature";
            $burstJson["properties"]["id"] = $callsign . "_burst";
            $burstJson["properties"]["time"] = $packet_array[$max_altitude_idx]["thetime"];
            $burstJson["properties"]["packet_time"] = $packet_array[$max_altitude_idx]["packet_time"];
            $burstJson["properties"]["callsign"] = $callsign . " Approximate Burst";
            $burstJson["properties"]["flightid"] = $flightid;
            $burstJson["properties"]["symbol"] = "/n";
            $burstJson["properties"]["altitude"] = $packet_array[$max_altitude_idx]["altitude"];
            $burstJson["properties"]["comment"] = $flightid . " balloon burst";
            $burstJson["properties"]["tooltip"] = number_format($max_altitude) . "ft"; 
            $burstJson["properties"]["objecttype"] = "burstlocation"; 
            $burstJson["properties"]["speed"] = ($packet_array[$max_altitude_idx]["speed_mph"] == null ? "" : $packet_array[$max_altitude_idx]["speed_mph"]); 
            $burstJson["properties"]["bearing"] = ($packet_array[$max_altitude_idx]["bearing"] == null ? "" : $packet_array[$max_altitude_idx]["bearing"]);
            $burstJson["properties"]["verticalrate"] = ($packet_array[$max_altitude_idx]["vert_rate"] == null ? "" : $packet_array[$max_altitude_idx]["vert_rate"]); 
            $burstJson["properties"]["label"] = number_format($max_altitude) . "ft";
            $burstJson["properties"]["iconsize"] = $config["iconsize"];
            $burstJson["properties"]["temperature"] = ($packet_array[$max_altitude_idx]["temperature_f"] == null ? "" : $packet_array[$max_altitude_idx]["temperature_f"]);
            $burstJson["properties"]["pressure"] = ($packet_array[$max_altitude_idx]["pressure_atm"] == null ? "" : $packet_array[$max_altitude_idx]["pressure_atm"]);
            $burstJson["geometry"]["type"] = "Point";
            $burstJson["geometry"]["coordinates"][]= $packet_array[$max_altitude_idx]["longitude"];
            $burstJson["geometry"]["coordinates"][]= $packet_array[$max_altitude_idx]["latitude"];

            $json[] = $ascentJson;
            $json[] = $descentJson;
            $json[] = $burstJson;
            $json = array_merge($json, $breadcrumbsJson);
        }
        else { // the flight is still ascending...
            // The ascent portion JSON
            $ascentJson = array();
            $ascentJson["type"] = "Feature";
            $ascentJson["properties"]["id"] = $callsign . "_ascent_path";
            $ascentJson["properties"]["ascending"] = "true";
            $ascentJson["properties"]["objecttype"] = "balloonpath";
            $ascentJson["properties"]["callsign"] = $callsign;
            $ascentJson["properties"]["flightid"] = $flightid;
            $ascentJson["geometry"]["type"] = "LineString";
            $ascentJson["geometry"]["coordinates"] = $linestring;

            $json[] = $ascentJson;
            $json = array_merge($json, $breadcrumbsJson);

        }

        return $json;
    }

    # Get the latest GPS location
    $gps_query = "
        select 
        g.tm, 
        g.altitude_ft, 
        st_astext(g.location2d) as location2d,
        g.bearing 

        from 
        gpsposition g 

        where
        g.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)

        order by 
        g.tm desc

        limit 1;
    ";

    $gpsresult = pg_query_params($link, $gps_query, array(
        sql_escape_string($config["lookbackperiod"] . " minute")
    ));

    if (!$gpsresult) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $gpsrows = sql_fetch_all($gpsresult);
    $gps_location2d = $gpsrows[0]["location2d"];
    $gps_altitude = $gpsrows[0]["altitude_ft"];
    $gps_bearing = $gpsrows[0]["bearing"];


    $callsign_query = "
        select distinct 
        fm.callsign
 
        from
        flightmap fm

        where 
        fm.flightid = $1

        order by 
        fm.callsign;
    ";

    $callsign_result = pg_query_params($link, $callsign_query, array(
        sql_escape_string($get_flightid)
    ));

    
    if (!$callsign_result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $callsign_rows = sql_fetch_all($callsign_result);

    $lastfewpackets = [];
    $beaconfeatures = [];
    $beacons = [];
    $elapsed_secs = 999999;
    foreach ($callsign_rows as $beacon) {
        $cs = $beacon['callsign'];

        # Execute this query first to determine if there are any recent packets.  This is a much lower cost query for repeatedly checking if a flight
        # has any recent packets to process.
        $check_query = "
            select
            coalesce(extract (epoch from now() - max(a.tm)), 999999) / 60.0 as elapsed_mins

            from 
            packets a

            where 
            a.callsign = $1
            and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time) 
            and a.location2d != ''
            ;
        ";

        $check_result = pg_query_params($link, $check_query, array(
            sql_escape_string($cs),
            sql_escape_string($config["lookbackperiod"] . " minute")
        ));

        if (!$check_result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
     
        $checkrows = sql_fetch_all($check_result);
        $numcheckrows = sql_num_rows($check_result);

        $recent_packets = false;
        if ($numcheckrows > 0) {
            if (end($checkrows)["elapsed_mins"] < $config["lookbackperiod"]) {
                $recent_packets = true;                
            }
        }


        ## query the last packets from stations...
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
                round(cast(ST_DistanceSphere(y.location2d, st_geomfromtext($1, 4326))*.621371/1000 as numeric), 2) as distance,
                round(cast(degrees(atan((y.altitude  - $2) / (cast(ST_DistanceSphere(y.location2d, st_geomfromtext($3, 4326)) as numeric) * 3.28084))) as numeric)) as angle,
                round(cast(degrees(ST_Azimuth(st_geomfromtext($4, 4326), y.location2d)) as numeric)) as relative_bearing,
                round($5) as mybearing,
                floor(lp.ttl / 60.0) as ttl,
                y.elapsed_secs

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
                                    when a.raw similar to '%[0-9]{6}h%' then
                                        date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $6)::time)::time without time zone
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

                                    order by 
                                    a.tm asc
                                )

                                from 
                                packets a,
                                flights f,
                                flightmap fm

                                where 
                                a.location2d != '' 
                                and a.tm > (now() - (to_char(($7)::interval, 'HH24:MI:SS'))::time) 
                                and a.tm > (to_timestamp($8)::timestamp)
                                and fm.flightid = f.flightid
                                and f.active = 'y'
                                and a.callsign = fm.callsign
                                and a.altitude > 0
                                and a.callsign = $9

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

        ";


        if ($recent_packets) {
            $result = pg_query_params($link, $query, array(
                $gps_location2d,
                $gps_altitude, 
                $gps_location2d,
                $gps_location2d,
                $gps_bearing,
                sql_escape_string($config["timezone"]), 
                sql_escape_string($config["lookbackperiod"] . " minute"), 
                $get_starttime,
                sql_escape_string($cs)
                )
            );

            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                return 0;
            }
         
            $rows = sql_fetch_all($result);
            $numrows = sql_num_rows($result);

            if ($numrows > 0) {
                $last_packet = end($rows);
                $beaconfeatures[] = createFeatureJSON($last_packet);
                $beaconfeatures = array_merge($beaconfeatures, createOtherJSON($rows));
                $beacons[] = array(
                    "callsign" => $cs, 
                    "json" => array(
                        "type" => "FeatureCollection",
                        "properties" => array("name" => "Beacon " . $cs),
                        "features" => $beaconfeatures
                    )
                );

                if ($last_packet["elapsed_secs"] < $elapsed_secs) {
                    $elapsed_secs = $last_packet["elapsed_secs"];
                }

                for ($i = $numrows - 1; $i > $numrows - 6 && $i >= 0; $i--) {
                    $r = $rows[$i];
                    $lastfewpackets[] = array(
                        "time" => $r["thetime"],
                        "flightid" => $r["flightid"],
                        "callsign" => $r["callsign"],
                        "speed" => $r["speed_mph"],
                        "verticalrate" => $r["vert_rate"],
                        "altitude" => $r["altitude"],
                        "latitude" => $r["latitude"],
                        "longitude" => $r["longitude"],
                        "bearing" => $r["bearing"],
                        "source" => $r["source"],
                        "comment" => $r["comment"],
                        "symbol" => $r["symbol"]
                    );
                }
            }
            else {
                $beacons[] = array(
                    "callsign" => $cs, 
                    "json" => array(
                        "type" => "FeatureCollection",
                        "properties" => array("name" => "Beacon " . $cs),
                        "features" => []
                    )
                );

            }
        }

    }

    function cmp($a, $b) {
        if ($a["time"] == $b["time"])
            return 0;

        return ($a["time"] > $b["time"] ? -1 : 1);
    }

    // Now sort through the last several packets to get to a consolidated, sorted list.
    usort($lastfewpackets, "cmp");

    $beaconJSON = array(
        "type" => "FeatureCollection", 
        "properties" => array("name" => "Flight Data"),
        "features" => $beaconfeatures
    );


    /*=================== get tracker stations assigned to this flight ============ */

    ## query the last packets from stations...
    $query = "
        select
            y.thetime,
            y.callsign,
            y.hash,
            y.flightid,
            y.comment,
            y.symbol,
            round(y.altitude) as altitude,
            round(y.speed_mph) as speed_mph,
            round(y.bearing) as bearing,
            round(y.lat, 6) as latitude,
            round(y.lon, 6) as longitude,
            y.sourcename,
            y.freq,
            y.channel,
            case when array_length(y.path, 1) > 0 then
                y.path[array_length(y.path, 1)]
            else
                y.sourcename
            end as heardfrom,
            y.source,
            y.ptype,
            upper(y.tactical) as tactical

        from 
            (select 
                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                a.callsign,
                t.flightid,
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
                dense_rank () over (partition by a.callsign order by
                    date_trunc('millisecond', a.tm) desc,
                    a.channel asc,
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
                    ) as int) asc
                ),
                a.ptype,
                a.hash,
                a.raw,
                a.source,
                t.tactical,
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


                from packets a
                left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign,
                teams t,
                trackers tr

                where
                b.callsign is null
                and a.location2d != ''
                and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)
                and a.tm > (to_timestamp($2)::timestamp)
                and case
                    when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                        a.callsign  = tr.callsign
                    else
                        a.callsign like tr.callsign || '-%'
                end
                and t.tactical != 'ZZ-Not Active'
                and tr.tactical = t.tactical " .
                ($get_flightid == "" ? " and t.flightid is null " : " and t.flightid = $3 ") . "

                order by
                dense_rank,
                a.callsign,
                thetime) as y

            where
            y.dense_rank = 1

            order by
            y.thetime,
            y.callsign
                ;
    ";

    if ($get_flightid == "")
        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["lookbackperiod"] . " minute"),
            $get_starttime
        ));
    else
        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["lookbackperiod"] . " minute"), 
            $get_starttime,
            sql_escape_string($get_flightid)
        ));

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    $positioninfo = [];
    $features = [];
    while ($row = sql_fetch_array($result)) {
        $thetime = $row['thetime'];
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $tactical = $row['tactical'];
        $speed_mph = $row['speed_mph'];
        $heardfrom = $row['heardfrom'];
        if ($row["source"] == 'direwolf')
            $frequency = ($row['freq'] == "" || $row['freq'] == 0 ? "ext radio" : ($row['freq'] != "n/a" ? $row['freq'] : "--"));
        else
            $frequency = "TCPIP";


        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical, $bearing, $speed_mph, $heardfrom, $frequency);
            else {
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical, $bearing, $speed_mph, $heardfrom, $frequency);
    }    


/* this is for the FeatureCollection preamble */
    $trackerfeatures = [];

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        $firsttimeinloop = 0;
        $trackerfeatures[] = array(
            "type" => "Feature",
            "properties" => array(
                "id" => $callsign,
                "callsign" => $callsign,
                "time" => $positioninfo[$callsign][0],
                "symbol" => $positioninfo[$callsign][1],
                "altitude" => $positioninfo[$callsign][4],
                "comment" => "Tactical:  " . $positioninfo[$callsign][6] . ($positioninfo[$callsign][5] == "" ? "" : "<br>") . $positioninfo[$callsign][5], 
                "tooltip" => $positioninfo[$callsign][6],
                "label" => $positioninfo[$callsign][6],
                "iconsize" => $config["iconsize"],
                "bearing" => $positioninfo[$callsign][7],
                "speed" => $positioninfo[$callsign][8],
                "heardfrom" => ($positioninfo[$callsign][9] == $callsign ? "direct" : $positioninfo[$callsign][9]), 
                "frequency" => $positioninfo[$callsign][10]
            ),
            "geometry" => array(
                "type" => "Point",
                "coordinates" => array($positioninfo[$callsign][3], $positioninfo[$callsign][2])
            )
        );
    }

    $trackers = array(
        "type" => "FeatureCollection", 
        "properties" => array("name" => "Tracker Stations"),
        "features" => $trackerfeatures
    );




    /*=================== get landing predictions for this flight ============ */

    $seconds_since_last_packet = $elapsed_secs;
    $seconds_since_last_packet = 10;
    $landings = [];
    $landingfeatures = [];

    # If the last packet from the flight is older than the lookback period, then we just return.  
    # We don't want to display landing predictions for older stuff.
    if ($seconds_since_last_packet < $config["lookbackperiod"] * 60) {

        ## get the landing predictions...
        $query = "select 
            date_trunc('millisecond', l.tm)::timestamp without time zone as thetime,
            l.flightid, 
            l.callsign, 
            l.thetype, 
            ST_Y(l.location2d) as lat, 
            ST_X(l.location2d) as long,
            ST_AsGeoJSON(l.flightpath) as flightpath,
            --ST_astext(l.flightpath) as flightpath,
            l.ttl,
            array_to_json(l.patharray) as thepath,
            array_to_json(l.winds) as thewind

            from 
            landingpredictions l, 
            flights f 

            where 
            f.flightid = l.flightid 
            and f.active = 't' 
            and l.flightid = $1 
            and l.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)  

            order by 
            l.tm asc, 
            l.flightid, 
            l.callsign;";

        $result = pg_query_params($link, $query, array(
            sql_escape_string($get_flightid),
            sql_escape_string($config["lookbackperiod"] . " minute")
        ));

        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $features = array();
        $flightpath = array();
        $thepath = array();
        while ($row = sql_fetch_array($result)) {
            $thetime = $row['thetime'];
            $callsign = $row['callsign'];
            $thepath[$callsign] = json_decode($row['thepath']);
            $thewind[$callsign] = json_decode($row['thewind']);
            $flightid = $row['flightid'];
            $thetype[$callsign] = $row['thetype'];
            $latitude = $row['lat'];
            $longitude = $row['long'];
            $flightpath[$callsign] = json_decode($row['flightpath']);
            $ttl[$callsign] = $row['ttl'];
            $features[$callsign][$thetime. $latitude . $longitude] = array($latitude, $longitude, $row['thetype'], $thetime);
        }


        $numrows = sql_num_rows($result);


        $firsttimeinloop = 1;
        foreach ($features as $callsign => $ray) {
            $firsttimeinloop = 0;

            if ($thetype[$callsign] == "wind_adjusted")
                $wind_html = "<br>Surface wind: " . $thewind[$callsign][0] . "mph from " . $thewind[$callsign][1] . "&deg; (bearing " . $thewind[$callsign][2] . "&deg;)";
            else
                $wind_html = "";

            // Timestamp of the latest landing prediction record
            $timevalue = end($ray)[3];

            $landingfeatures[] = array(
                "type" => "Feature",
                "properties" => array(
                    "id" => $callsign . "_landing",
                    "callsign" => $callsign . " Predicted Landing",
                    "tooltip" => $callsign . " Landing",
                    "symbol" => "/J",
                    "comment" => "Landing prediction" . $wind_html,
                    "frequency" => "",
                    "altitude" => "",
                    "time" => $timevalue,
                    "objecttype" => "landingprediction",
                    "label" => $callsign . " Landing" . ($thetype[$callsign] == "wind_adjusted" ? "<br>(wind adjusted)" : ""),
                    "iconsize" => $config["iconsize"],
                    "ttl" => $ttl[$callsign]),
                "geometry" => array(
                    "type" => "Point",
                    "coordinates" => array(end($features[$callsign])[1], end($features[$callsign])[0])
                )
            );


            // This is the point for the landing prediction itself
            // This is the linestring for the path the landing prediction point has taken as the landing prediction coords have changed.
            // We only want to plot the historical track the landing prediction has taken for "predicted" or "wind_adjusted" prediction types.  
            if (count($ray) > 1 && ($thetype[$callsign] == "predicted" || $thetype[$callsign] == "wind_adjusted")) {
                foreach ($ray as $k => $elem) {
                    if ($elem[2] == "predicted" || $elem[2] == "wind_adjusted")
                        $linestring[] = array($elem[1], $elem[0]);
                }
                $landingfeatures[] = array(
                    "type" => "Feature",
                    "properties" => array(
                        "id" => $callsign . "_path_landing",
                        "objecttype" => "landingpredictionpath",
                        "time" => $timevalue
                    ),
                    "geometry" => array(
                        "type" => "LineString",
                        "coordinates" => $linestring
                    )
                );

                unset ($linestring);
            }


            // This is the linestring for the predicted flight path
            // This is the flight path from the last location of the flight to the predicted landing spot (the "X" marks the spot).
            if (array_key_exists($callsign, $flightpath)) {
                if ($flightpath[$callsign]) {
                    if (array_key_exists("coordinates", $flightpath[$callsign])) {
                        $landingfeatures[] = array(
                            "type" => "Feature",
                            "properties" => array(
                                "id" => $callsign . "_flightpath_landing",
                                "objecttype" => "landingpredictionflightpath",
                                "time" => $timevalue
                            ),
                            "geometry" => $flightpath[$callsign]
                        );
                    }
                }
            }

            // These are the breadcrumbs
            if (array_key_exists($callsign, $thepath)) {
                $i = 0;
                $outerfirsttime = 1;
                $firsttime = 1;
                if (!empty($thepath[$callsign])) {
                    $len = sizeof($thepath[$callsign]);

                    // Get the first and last element of the $thepath array
                    $first_tuple = reset($thepath[$callsign]);
                    $last_tuple = end($thepath[$callsign]);

                    // Now compute the span in altitude from the first element to the last
                    $altitude_span = $first_tuple[3] - $last_tuple[3];

                    // Now create a mod value for use below based on how large the altitude_span was.  
                    // Bascially when:
                    //     -  the altitude span is ~100k feet, then the mod should be about 20.
                    //     -  the altitude span is ~4k feet, then the mod should be about 2.
                    $mod_value = floor((16 * $altitude_span / 100000.0) + 2);

                    $breadcrumb_num = 0;
                    foreach ($thepath[$callsign] as $idx => $tuple) {

                        if ($i < $len - 1 && $i > 0 && $i % $mod_value == 0) {
                            //This is the GeoJSON object for the breadcrumb within the predicted flight path 


                            $landingfeatures[] = array(
                                "type" => "Feature",
                                "properties" => array(
                                    "id" => $callsign . "_predictionpoint_" . $breadcrumb_num,
                                    "callsign" => $callsign,
                                    "symbol" => "/J",
                                    "altitude" => $tuple[3],
                                    "time" => $timevalue,
                                    "comment" => "Flight prediction",
                                    "objecttype" => "balloonmarker",
                                    "tooltip" => round(floatval($tuple[3]) / 1000.0) . "k ft", 
                                    "label" => round(floatval($tuple[3]) / 1000.0) . "k ft", 
                                    "iconsize" => $config["iconsize"]
                                ),
                                "geometry" => array(
                                    "type" => "Point",
                                    "coordinates" => array($tuple[1], $tuple[0])
                                )
                            );

                            $breadcrumb_num += 1;
                        }
                        $i += 1;
                    }
                }
            }
        }
    }

    $landings = array(
        "type" => "FeatureCollection", 
        "properties" => array("name" => "Predicted Landings"),
        "features" => $landingfeatures
    );



    /*=================== get pre-flight prediction (i.e. the "predict file") for this flight ============ */

    
    $features = array();
    $positioninfo = array();
    $numrows = 0;

    $predictfeatures = [];
    
    ## loop through each row of the prediction data for this specific flight, launchsite, and date combo...
    $query2 = "
        select
        p.flightid, 
        p.launchsite, 
        p.thedate, 
        p.thetime, 
        p.altitude, 
        p.latitude, 
        p.longitude 

        from 
        predictiondata p,
        flights f,
        (select pr.flightid, pr.launchsite, max(pr.thedate) from predictiondata pr group by pr.flightid, pr.launchsite order by pr.flightid, pr.launchsite) as m

        where 
        f.flightid = $1
        and m.flightid = f.flightid
        and m.launchsite = f.launchsite
        and p.flightid = f.flightid
        and p.launchsite = f.launchsite
        and p.thedate = m.max

        order by 
        p.flightid, 
        p.launchsite, 
        p.thedate, 
        p.thetime asc;";

    $result2 = pg_query_params($link, $query2, array(
        sql_escape_string($get_flightid)
    ));

    if (!$result2) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $numrows = sql_num_rows($result2);
    $mins = 0;
    while ($row2 = sql_fetch_array($result2)) {

        $flightid = $row2['flightid'];
        $launchsite = $row2['launchsite'];
        $thedate = $row2['thedate'];
        $thetime = $row2['thetime'];
        $altitude = $row2['altitude'];
        $latitude = $row2['latitude'];
        $longitude = $row2['longitude'];

        $hours = floor($mins / 60.0);
        $minutes = $mins - floor($mins / 60.0) * 60;
        $elapsedtime = "T+ " . $hours . "hrs " . $minutes . "mins";

        $features[$flightid][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude, $elapsedtime);
        if (array_key_exists($flightid, $positioninfo)) {
            $positioninfo[$flightid] = array($thetime, "/O", $latitude, $longitude, $altitude, "Flight prediction<br>Launch site:  " . $launchsite, "");
        }
        else {
            $positioninfo[$flightid] = array($thetime, "/O", $latitude, $longitude, $altitude, "Flight prediction<br>Launch site:  " . $launchsite, "");
        }
        $mins += 1;
    }

    if (sizeof($features) > 0) {
        $output = array();
        $firsttimeinloop = 1;
        foreach ($features as $flightid => $ray) {
            $firsttimeinloop = 0;

            $predictfeatures[] = array(
                "type" => "Feature",
                "properties" => array(
                    "id" => $flightid . "_prediction",
                    "callsign" => $flightid,
                    "symbol" => $positioninfo[$flightid][1], 
                    "comment" => $positioninfo[$flightid][5], 
                    "objecttype" => "flightprediction",
                    "iconsize" => $config["iconsize"]
                ),
                "geometry" => array(
                    "type" => "Point",
                    "coordinates" => array($positioninfo[$flightid][3], $positioninfo[$flightid][2])
                )
            );

            if (count($ray) > 1) {
                $peak_altitude = 0;
                $peak_altitude_idx = 0;
                $i = 0;
                foreach ($ray as $k => $elem) {
                    $linestring[] = array($elem[1], $elem[0]);
                    if ($elem[2] > $peak_altitude) {
                       $peak_altitude = $elem[2];
                       $peak_altitude_idx = $i;
                    }
                    $i += 1;
                }
                //find out if this balloon has hit a peak altitude and is now going down
                // ...if "yes", then we need to split up the flight into two different features:
                // 1) for the ascent portion of the flight, and 2) for the descent portion of the flight
                // 
                if (count($linestring) > $peak_altitude_idx + 1) {
                    $ascent_portion = array_slice($linestring, 0, $peak_altitude_idx + 1); 
                    $descent_portion = array_slice($linestring, $peak_altitude_idx);

                    // This is the ascent portion
                    $predictfeatures[] = array(
                        "type" => "Feature",
                        "properties" => array(
                            "id" => $flightid . "_ascent_path_prediction",
                            "ascending" => "true",
                            "objecttype" => "flightpredictionpath"
                        ),
                        "geometry" => array(
                            "type" => "LineString",
                            "coordinates" => $ascent_portion
                        )
                    );

                    // This is the burst location itself 
                    $predictfeatures[] = array(
                        "type" => "Feature",
                        "properties" => array(
                            "id" => $flightid . "_burst_predicted",
                            "callsign" => $flightid . " Predicted Burst",
                            "tooltip" => number_format($peak_altitude) . "ft", 
                            "symbol" => "/n",
                            "altitude" => $peak_altitude,
                            "comment" => "Predicted burst",
                            "objecttype" => "burstlocation",
                            "label" => number_format($peak_altitude) . "ft",
                            "iconsize" => $config["iconsize"]
                        ),
                        "geometry" => array(
                            "type" => "Point",
                            "coordinates" => end($ascent_portion)
                        )
                    );

                    // The remaining linestring for the descent prortion, presumably still in progress...
                    $predictfeatures[] = array(
                        "type" => "Feature",
                        "properties" => array(
                            "id" => $flightid . "_descent_path_prediction",
                            "ascending" => "false",
                            "objecttype" => "flightpredictionpath"
                        ),
                        "geometry" => array(
                            "type" => "LineString",
                            "coordinates" => $descent_portion
                        )
                    );

                } 
                else {

                    $predictfeatures[] = array(
                        "type" => "Feature",
                        "properties" => array(
                            "id" => $flightid . "_ascent_path_prediction",
                            "ascending" => "true",
                            "objecttype" => "flightpredictionpath"
                        ),
                        "geometry" => array(
                            "type" => "LineString",
                            "coordinates" => $linestring
                        )
                    );
                }

                $i = 0;
                $prev = 0;
                $prev_alt = 0;
                $prev_array = [];
                foreach ($ray as $k => $elem) {
                    if ($i == 0)
                        $prev_array = $elem;

                    $alt = $elem[2];
                    $current = floor($elem[2] / 10000);
                    if ($alt > $prev_alt) # ...ascending 
                        $ascending = 1;
                    else   # ...descending
                        $ascending = 0;

                    if ($current != $prev) {
                        if ($ascending)
                            $element = $elem;
                        else
                            $element = $prev_array;

                        
                        if ($element[2] != $peak_altitude) {
                            /* This is the GeoJSON object for the breadcrumb within the predicted flight path */ 
                            $predictfeatures[] = array(
                                "type" => "Feature",
                                "properties" => array(
                                    "id" => $flightid . "_predictionpoint_" . $i, 
                                    "callsign" => $flightid,
                                    "symbol" => "/J",
                                    "altitude" => $element[2],
                                    "comment" => "Flight prediction",
                                    "objecttype" => "balloonmarker",
                                    "time" => $elem[3],
                                    "tooltip" => number_format(($element[2] < 10000 ? floor($element[2] / 1000) : 10 * floor($element[2] / 10000))) . "k ft", 
                                    "label" => number_format(($element[2] < 10000 ? floor($element[2] / 1000) : 10 * floor($element[2] / 10000))) . "k ft",
                                    "iconsize" => $config["iconsize"]
                                ),
                                "geometry" => array(
                                    "type" => "Point",
                                    "coordinates" => array($element[1], $element[0])
                                )
                            );

                            $i += 1;
                        }
                    }
                    $prev_array = $elem;
                    $prev = $current;
                    $prev_alt = $alt;
                } 
                unset ($linestring);
            }
            //printf ("] }");
        }
    }

    $predicts = array(
        "type" => "FeatureCollection", 
        "properties" => array("name" => "Pre-flight Predictions"),
        "features" => $predictfeatures 
    );



    /*=================== get recent packet lists ============ */

    $packetlistJSON = [];
    $packetlistJSON["positionpackets"] = [];
    $packetlistJSON["statuspackets"] = [];
    $packetlistJSON["lastpacketpath"] = [];

    $status_query = "
        select 
        date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
        f.flightid,
        a.callsign, 
        a.raw

        from 
        packets a,
        flights f,
        flightmap fm

        where 
        a.ptype = '>'
        and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
        and a.tm > (to_timestamp($2)::timestamp)
        and fm.flightid = f.flightid
        and f.active = 'y'
        and a.callsign = fm.callsign
        and f.flightid = $3

        order by
        a.tm desc,
        a.callsign

        limit 5;
    ";

    $status_result = pg_query_params($link, $status_query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        $get_starttime,
        sql_escape_string($get_flightid)
    ));

    if (!$status_result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }


    $num_status_rows = sql_num_rows($status_result);
    if ($num_status_rows > 0) {
        while ($status_row = sql_fetch_array($status_result)) {
            $packetlistJSON["statuspackets"][] = array(
                "time" => $status_row["thetime"],
                "flightid" => $status_row["flightid"],
                "callsign" => $status_row["callsign"],
                "packet" => $status_row["raw"]
            );
        }
    }

    $packetlistJSON["positionpackets"] = $lastfewpackets;

    /*
    $firsttime = 1;
    ksort($allpackets);
    foreach ($allpackets as $c => $ray) {
        $c_rev = array_reverse($ray);
        $i = 0;
        $lastpath = "";
        foreach ($c_rev as $row) {
            if ($i >= 10)
                break;
            if ($row[4] == 'direwolf')
                $lastpath = $lastpath . "R";
            else
                $lastpath = $lastpath . "I";
            $i++;
        }
        if (sizeof($c_rev) > 0) {
            $packetlistJSON["lastpacketpath"][] = array(
                "time" => $c_rev[0][0],
                "flightid" => $get_flightid,
                "callsign" => $c,
                "lastpath" => $lastpath
            );
        }
        $firsttime = 0;
    }
     */

    $packetlistJSON["flightid"] = $get_flightid;



    /*=================== get altitude chart data ============ */


    ## query the last packets heard from the database
    $query = "
        select distinct on (f.flightid, a.callsign, thetime) 
        a.callsign, 
        f.flightid, 
        date_trunc('second', a.tm)::timestamp without time zone as thetime, 
        round(a.altitude, 0) as altitude

        from 
        packets a, 
        flights f, 
        flightmap fm 

        where 
        fm.flightid = f.flightid 
        and a.callsign = fm.callsign 
        and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)
        and a.altitude > 0 
        and f.flightid = $2

        order by 
        f.flightid, 
        a.callsign, 
        thetime asc; 
    ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"),
        sql_escape_string($get_flightid)
    ));

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $adata = [];
    $callsigns = [];
    $numrows = sql_num_rows($result);


    while ($row = sql_fetch_array($result)) {
        $cs = $row['callsign'];
        $flightid = $row['flightid'];
        $callsigns[$flightid][$cs] = $cs;
        
        $tdata[$cs][]= $row['thetime'];
        $adata[$cs][] = $row['altitude'];
    }    


    //printf ("[");
    $superfirsttime = 1;
    $chartdata = [];
    foreach ($callsigns as $flightid => $ray) {
        //if (! $superfirsttime)
        //    printf (", ");
        $superfirsttime = 0;
        //printf ("{ \"flightid\" : \"%s\", ", $flightid);
        //printf ("\"chartdata\" : {");

        $outerfirsttime = 1;
        foreach ($ray as $cs) {
             //if (! $outerfirsttime)
             //    printf (", ");
             $outerfirsttime = 0;
             $innerfirsttime = 1;
             //printf ("\"tm-%s\" : [", $cs);
             foreach ($tdata[$cs] as $value) {
                 //if (! $innerfirsttime)
                 //    printf (", ");
                 $innerfirsttime = 0;
                 $chartdata["tm-" . $cs][] = $value;
                 //printf ("\"%s\"", $value);
             }
             //printf ("], ");
    
             $innerfirsttime = 1;
             //printf ("\"%s\" : [", $cs);
             foreach ($adata[$cs] as $value) {
                 //if (! $innerfirsttime)
                 //    printf (", ");
                 $innerfirsttime = 0;
                 $chartdata[$cs][] = $value;
                 //printf ("%s", $value);
             }
             //printf ("] ");
        }
        //printf ("} }");
    }
    //printf ("]");
    //


    $altitudechart = array(
        "flightid" => $get_flightid, 
        "chartdata" => $chartdata
    );



    /*=================== get vertical rate chart data ============ */


    ## query the last n packets heard from the database
    $query = "
        select distinct on (f.flightid, a.callsign, thetime) 
        a.callsign, 
        f.flightid, 
        date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime, 
        case
            when a.raw similar to '%[0-9]{6}h%' then 
                date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
            else
                date_trunc('milliseconds', a.tm)::time without time zone
        end as packet_time,
        a.altitude, 
        a.hash 

        from 
        packets a, 
        flights f, 
        flightmap fm 

        where 
        fm.flightid = f.flightid 
        and a.callsign = fm.callsign 
        and a.location2d != '' 
        and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)
        and a.altitude > 0 
        and f.flightid = $3

        order by 
        f.flightid, 
        a.callsign, 
        thetime asc; 
    ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute"),
        sql_escape_string($get_flightid)
    ));

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $adata = [];
    $callsigns = [];
    $numrows = sql_num_rows($result);

    $time_prev = [];
    $altitude_prev = [];
    $hash_prev = [];
    $verticalrate = [];

    $i = 0;

    while ($row = sql_fetch_array($result)) {

        // all the data from this return row...
        $flightid = $row['flightid'];
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $altitude = $row['altitude'];
        $hash = $row['hash'];
        if (strpos($thetime, ".") === false) {
            $time_trunc = $thetime;
            $microseconds = 0;
        }
        else
            list($time_trunc, $microseconds) = explode(".", $thetime);
 

        // calculate the vertical rate for this callsign
        //$time1 = date_create($thetime);
        $time1 = date_create($packettime);
        if (array_key_exists($callsign, $time_prev)) {
            if ($hash != $hash_prev[$callsign]) {
                $diff = date_diff($time_prev[$callsign], $time1);
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60 + ($diff->f)/60;
                if ($time_delta > 0)
                    $verticalrate[$callsign][] = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
                else
                    $verticalrate[$callsign][] = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
 
                $callsigns[$flightid][$callsign] = $callsign;
                $tdata[$callsign][]= $time_trunc;
                //$adata[$callsign][] = $altitude;
            }
        }


       if (array_key_exists($callsign, $hash_prev)) {
           if ($hash != $hash_prev[$callsign]) {
               $altitude_prev[$callsign] = $altitude;
               $time_prev[$callsign] = $time1;
           }
       }
       if ($i == 0) {
           $time_prev[$callsign] = $time1;
           $altitude_prev[$callsign] = $altitude;
       }
       
       $hash_prev[$callsign] = $hash;
       $i++;
    }


    //if ($numrows > 0)
    //    printf ("[");
    $superfirsttime = 1;
    $vertchartdata = [];

    foreach ($callsigns as $flightid => $ray) {
        //if (! $superfirsttime)
        //    printf (", ");
        $superfirsttime = 0;
        //printf ("{ \"flightid\" : \"%s\", ", $flightid);
        //printf ("\"chartdata\" : {");

        $outerfirsttime = 1;
        foreach ($ray as $cs) {
             //if (! $outerfirsttime)
             //    printf (", ");
             $outerfirsttime = 0;
             $innerfirsttime = 1;
             //printf ("\"tm-%s\" : [", $cs);
             foreach ($tdata[$cs] as $value) {
                 //if (! $innerfirsttime)
                 //    printf (", ");
                 $innerfirsttime = 0;
                 $vertchartdata["tm-" . $cs][] = $value;

              //   printf ("\"%s\"", $value);
             }
             //printf ("], ");
    
             $innerfirsttime = 1;
             //printf ("\"%s\" : [", $cs);
             foreach ($verticalrate[$cs] as $value) {
                 //if (! $innerfirsttime)
                 //    printf (", ");
                 $innerfirsttime = 0;
                 $vertchartdata[$cs][] = $value;
                 //printf ("%s", $value);
             }
             //printf ("] ");
        }
        //printf ("} }");
    }
    //if ($numrows > 0)
    //    printf ("]");

    $verticalchart = array(
        "flightid" => $get_flightid,
        "chartdata" => $vertchartdata
    );

    $outputJSON["flightid"] = $get_flightid;
    $outputJSON["trackers"] = $trackers;
    $outputJSON["beacons"] = $beacons;
    $outputJSON["landing"] = $landings;
    $outputJSON["predict"] = $predicts;
    $outputJSON["packetlist"] = $packetlistJSON;
    $outputJSON["altitudechart"] = $altitudechart;
    $outputJSON["verticalchart"] = $verticalchart;


    printf ("%s", json_encode($outputJSON));

    // close our connection to PostGreSQL
    sql_close($link);

?>
