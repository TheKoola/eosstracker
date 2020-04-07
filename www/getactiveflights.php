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


    header("Content-Type:  application/json;");
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    $formerror = false;

    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    // Check the callsign HTML GET variable
    $get_callsign = "";
    if (isset($_GET["callsign"])) {
        if (($get_callsign = strtoupper(check_string($_GET["callsign"], 20))) == "")
            $formerror = true;
    }
    else 
        $formerror = true;
            

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
        // 15 temperature_k,
        // 16 pressure_pa
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
        $json["properties"]["temperature"] = ($packet_array["temperature_k"] == null ? "" : $packet_array["temperature_k"]);
        $json["properties"]["pressure"] = ($packet_array["pressure_pa"] == null ? "" : $packet_array["pressure_pa"]);
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
        // 15 temperature_k,
        // 16 pressure_pa

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
            $tmpJson["properties"]["temperature"] = ($row["temperature_k"] == null ? "" : $row["temperature_k"]);
            $tmpJson["properties"]["pressure"] = ($row["pressure_pa"] == null ? "" : $row["pressure_pa"]);
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

            // The ascent portion JSON
            $ascentJson = array();
            $ascentJson["type"] = "Feature";
            $ascentJson["properties"]["id"] = $callsign . "_ascent_path";
            $ascentJson["properties"]["ascending"] = "true";
            $ascentJson["properties"]["objecttype"] = "balloonpath";
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
            $burstJson["properties"]["temperature"] = ($packet_array[$max_altitude_idx]["temperature_k"] == null ? "" : $packet_array[$max_altitude_idx]["temperature_k"]);
            $burstJson["properties"]["pressure"] = ($packet_array[$max_altitude_idx]["pressure_pa"] == null ? "" : $packet_array[$max_altitude_idx]["pressure_pa"]);
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



    ## output should return rows like this:
    #
    #    thetime    | packet_time | callsign | flightid | altitude | latitude  |  longitude  | vert_rate |       lat_rate        |       lon_rate        | elapsed_mins | temperature_k | pressure_pa
    # --------------+-------------+----------+----------+----------+-----------+-------------+-----------+-----------------------+-----------------------+--------------+---------------+-------------
    #  07:58:10.753 | 08:00:19    | JEFF-23  | JEFF-297 |     4951 | 40.474000 | -104.962850 |         0 |                     0 |                     0 |          512 |               |
    #  07:59:33.657 | 08:30:17    | JEFF-23  | JEFF-297 |     5181 | 40.473600 | -104.962717 |    7.3522 |  2.71098512861998e-08 | -5.42197025723996e-08 |          510 |               |
    #  07:59:34.66  | 08:30:46    | JEFF-23  | JEFF-297 |     5811 | 40.473283 | -104.962983 |   20.1886 | -1.69128555344827e-07 | -1.42424046235118e-07 |          510 |               |
    #  07:59:35.161 | 08:31:15    | JEFF-23  | JEFF-297 |     6441 | 40.473633 | -104.962967 |   19.8912 |  1.84177568224633e-07 |   8.7703600408348e-09 |          510 |               |

    ## query the last packets from stations...
    $query = "
        select
            date_trunc('second', y.thetime)::time as thetime,
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
            round(y.temperature_k, 6) as temperature_k,
            round(y.pressure_pa, 6) as pressure_pa

        from
            (
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
                z.temperature_k,
                z.pressure_pa,
                z.ptype, 
                z.hash,
                z.raw,
                lag(z.altitude, 1) over(order by z.packet_time)  as previous_altitude,
                lag(z.lat, 1) over (order by z.packet_time) as previous_lat,
                lag(z.lon, 1) over (order by z.packet_time) as previous_lon,
                extract ('epoch' from (z.packet_time - lag(z.packet_time, 1) over (order by z.packet_time))) as delta_secs,
                extract ('epoch' from (now()::time - z.thetime)) as elapsed_secs

            from 
                (
                select
                    date_trunc('milliseconds', a.tm)::time without time zone as thetime,
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
                    cast(st_y(a.location2d) as numeric) as lat,
                    cast(st_x(a.location2d) as numeric) as lon,
                    case
                    when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P%%' then
                        round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                    else
                        NULL
                    end as temperature_k,
                    case
                        when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P%%' then
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
                    and a.tm > date_trunc('minute', (now() - (to_char(($2)::interval, 'HH24:MI:SS')::time)))
                    and a.location2d != ''
                    and a.altitude > 0
                    and a.callsign = $3
                    and f.flightid = $4

                order by
                    thetime,
                    a.callsign

                ) as z


            order by
                z.packet_time asc,
                z.callsign
            ) as y

        order by
            y.callsign,
            y.packet_time asc
        ";


    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($get_callsign),
        sql_escape_string($get_flightid)
        )
    );
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    if ($numrows == 0) {
       printf ("[]");
       return;
    }

    $rows = sql_fetch_all($result);
    $last_packet = end($rows);

    $json[] = createFeatureJSON($last_packet);
    $json = array_merge($json, createOtherJSON($rows));

    $featureCollectionJson = array();
    $featureCollectionJson["type"] = "FeatureCollection";
    $featureCollectionJson["properties"]["name"] = "Active Flights";
    $featureCollectionJson["features"] = $json; 

    printf ("%s", json_encode($featureCollectionJson));

    // close our connection to PostGreSQL
    sql_close($link);


?>
