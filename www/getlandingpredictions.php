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



    // For future use...
    $prediction_type = "predicted"; 
    
    
    // Check the flightid HTML GET variable
    $formerror = false;
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
        extract(epoch from (now() - max(a.tm))) as secs

        from
        packets a,
        flights f,
        flightmap fm

        where
        f.flightid = $1
        and fm.flightid = f.flightid
        and a.callsign = fm.callsign;";

    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
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
    $query = 'select 
        l.tm, 
        l.flightid, 
        l.callsign, 
        l.thetype, 
        ST_Y(l.location2d) as lat, 
        ST_X(l.location2d) as long,
        ST_AsGeoJSON(l.flightpath) as flightpath,
        l.ttl

        from 
        landingpredictions l, 
        flights f 

        where 
        f.flightid = l.flightid 
        and f.active = \'t\' 
        and l.flightid = $1 
        and l.tm > (now() - (to_char(($2)::interval, \'HH24:MI:SS\'))::time)  

        order by 
        l.tm asc, 
        l.flightid, 
        l.callsign;';
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid), sql_escape_string($config["lookbackperiod"] . " minute")));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    $features = array();
    $flightpath = array();
    while ($row = sql_fetch_array($result)) {
        $thetime = $row['tm'];
        $flightid = $row['flightid'];
        $callsign = $row['callsign'];
        $thetype[$callsign] = $row['thetype'];
        $latitude = $row['lat'];
        $longitude = $row['long'];
        $flightpath[$callsign] = $row['flightpath'];
        $ttl[$callsign] = $row['ttl'];
        $features[$callsign][$thetime. $latitude . $longitude] = array($latitude, $longitude, $row['thetype']);
    }


    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Landing Predictions\" }, \"features\" : [");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;

        // This is the point for the landing prediction itself
        printf ("{ \"type\" : \"Feature\",");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"tooltip\" : %s,  \"symbol\" : %s, \"comment\" : %s, \"frequency\" : \"\", \"altitude\" : \"\", \"time\" : \"\", \"objecttype\" : \"landingprediction\", \"label\" : %s, \"iconsize\" : %s, \"ttl\" : %s },", 
            json_encode($callsign . "_landing_predicted"), 
            json_encode($callsign . " Predicted Landing"), 
            json_encode($callsign . " Landing"), 
            json_encode("/J"), 
            json_encode("Landing prediction"),
	        json_encode($callsign . " Landing"),
            json_encode($config["iconsize"]),
            json_encode($ttl[$callsign])
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}", end($features[$callsign])[1], end($features[$callsign])[0]);
        printf ("}");

        // This is the linestring for the path the landing prediction point itself has taken over the life of the flight
        if (array_key_exists($callsign, $thetype)) {
            if ($thetype[$callsign] == "predicted")
                $okay = 1;
            else
                $okay = 0;
        }
        if (count($ray) > 1 && $okay) {
            printf (", ");
            foreach ($ray as $k => $elem) {
                if ($elem[2] == "predicted")
                    $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"objecttype\" : \"landingpredictionpath\" },", json_encode($callsign . "_path_landing" . $prediction_type));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }", json_encode($linestring));
            unset ($linestring);
        }


        // This is the linestring for the predicted flight path
        if (array_key_exists($callsign, $flightpath)) {
            if (strlen($flightpath[$callsign]) > 0) {
                printf (", { \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"objecttype\" : \"landingpredictionflightpath\" },", json_encode($callsign . "_flightpath_landing_" . $prediction_type));
                printf ("\"geometry\" : %s }  ", $flightpath[$callsign]);
            }
        }


    }
    printf ("] }"); 

    sql_close($link);


?>
