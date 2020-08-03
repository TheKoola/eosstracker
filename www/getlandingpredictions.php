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

    $formerror = false;

    
    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true;


    // If the flightid wasn't given the exit.
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

    ## Determine how many seconds have elapsed since the last packet from the flight.
    $query = "select
        f.flightid,
        extract(epoch from (now() - max(a.tm))) as secs

        from
        packets a,
        flights f,
        flightmap fm

        where
        f.flightid = $1
        and fm.flightid = f.flightid
        and a.callsign = fm.callsign
        and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)

        group by f.flightid
        ;";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($get_flightid),
        sql_escape_string($config["lookbackperiod"] . " minute")
    ));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $rows = sql_fetch_all($result);
    $seconds_since_last_packet = $rows[0]['secs'];

    # If the last packet from the flight is older than the lookback period, then we just return.  
    # We don't want to display landing predictions for older stuff.
    if ($seconds_since_last_packet > $config["lookbackperiod"] * 60) {
        printf ("[]");
        sql_close($link);
        return 0;
    }

    
    ## get the landing predictions...
    $query = "select 
        l.tm, 
        l.flightid, 
        l.callsign, 
        l.thetype, 
        ST_Y(l.location2d) as lat, 
        ST_X(l.location2d) as long,
        ST_AsGeoJSON(l.flightpath) as flightpath,
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
        $thetime = $row['tm'];
        $callsign = $row['callsign'];
        $thepath[$callsign] = json_decode($row['thepath']);
        $thewind[$callsign] = json_decode($row['thewind']);
        $flightid = $row['flightid'];
        $thetype[$callsign] = $row['thetype'];
        $latitude = $row['lat'];
        $longitude = $row['long'];
        $flightpath[$callsign] = $row['flightpath'];
        $ttl[$callsign] = $row['ttl'];
        $features[$callsign][$thetime. $latitude . $longitude] = array($latitude, $longitude, $row['thetype']);
    }


    $numrows = sql_num_rows($result);

    if ($numrows > 0) 
        printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Landing Predictions\" }, \"features\" : [");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;

        if ($thetype[$callsign] == "wind_adjusted")
            $wind_html = "<br>Surface wind: " . $thewind[$callsign][0] . "mph from " . $thewind[$callsign][1] . "&deg; (bearing " . $thewind[$callsign][2] . "&deg;)";
        else
            $wind_html = "";


        // This is the point for the landing prediction itself
        printf ("{ \"type\" : \"Feature\",");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"tooltip\" : %s,  \"symbol\" : %s, \"comment\" : %s, \"frequency\" : \"\", \"altitude\" : \"\", \"time\" : \"\", \"objecttype\" : \"landingprediction\", \"label\" : %s, \"iconsize\" : %s, \"ttl\" : %s },", 
            json_encode($callsign . "_landing"), 
            json_encode($callsign . " Predicted Landing"), 
            json_encode($callsign . " Landing"), 
            json_encode("/J"), 
            json_encode("Landing prediction" . $wind_html),
	        json_encode($callsign . " Landing" . ($thetype[$callsign] == "wind_adjusted" ? "<br>(wind adjusted)" : "")),
            json_encode($config["iconsize"]),
            json_encode($ttl[$callsign])
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}", end($features[$callsign])[1], end($features[$callsign])[0]);
        printf ("}");

        // This is the linestring for the path the landing prediction point has taken as the landing prediction coords have changed.
        // We only want to plot the historical track the landing prediction has taken for "predicted" or "wind_adjusted" prediction types.  
        if (count($ray) > 1 && ($thetype[$callsign] == "predicted" || $thetype[$callsign] == "wind_adjusted")) {
            printf (", ");
            foreach ($ray as $k => $elem) {
                if ($elem[2] == "predicted" || $elem[2] == "wind_adjusted")
                    $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"objecttype\" : \"landingpredictionpath\" },", json_encode($callsign . "_path_landing"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }", json_encode($linestring));
            unset ($linestring);
        }


        // This is the linestring for the predicted flight path
        // This is the flight path from the last location of the flight to the predicted landing spot (the "X" marks the spot).
        if (array_key_exists($callsign, $flightpath)) {
            if (strlen($flightpath[$callsign]) > 0) {
                printf (", { \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"objecttype\" : \"landingpredictionflightpath\" },", json_encode($callsign . "_flightpath_landing"));
                printf ("\"geometry\" : %s }  ", $flightpath[$callsign]);
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
                //printf("<br>-------------<br>");
                //printf("span: %f, mod_value: %f<br>", $altitude_span, $mod_value);
                //printf("<br>-------------<br>");

                foreach ($thepath[$callsign] as $idx => $tuple) {

                    if ($i < $len - 1 && $i > 0 && $i % $mod_value == 0) {
                        //This is the GeoJSON object for the breadcrumb within the predicted flight path 
                        printf (", { \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"callsign\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : \"Flight prediction\", \"objecttype\" : \"balloonmarker\", \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s },", 
                            json_encode($callsign . "_predictionpoint_" . $i), 
                            json_encode($callsign), 
                            json_encode("/J"), 
                            json_encode($tuple[3]), 
                            json_encode(round(floatval($tuple[3]) / 1000.0) . "k ft"), 
                            json_encode(round(floatval($tuple[3]) / 1000.0) . "k ft"),
                            json_encode($config["iconsize"])
                            );
                        printf (" \"geometry\" : { \"type\" : \"Point\", \"coordinates\" : %s } } ", json_encode(array($tuple[1], $tuple[0])));
                    }
                    $i += 1;
                }
            }
        }

    }
    if ($numrows > 0)
        printf ("] }"); 
    else
        printf ("[]");

    sql_close($link);


?>
