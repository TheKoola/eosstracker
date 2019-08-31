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
 
    // If there isn't a flightid, then exit.
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
    
    ## get the flights that we want to look at predictions for...
    $query = 'select 
        f.flightid, 
        p.launchsite, 
        max(p.thedate) as thedate 

        from 
        flights f, 
        predictiondata p 
       
        where 
        p.flightid = f.flightid 
        and f.active = \'t\' 
        and f.flightid = $1
        and p.launchsite = f.launchsite
        
        group by 
        f.flightid, 
        p.launchsite 

        order by 
        f.flightid;';
    //$result = sql_query($query);
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    
    $features = array();
    $positioninfo = array();
    $numrows = 0;
    ## loop through each row of the prediction data for this specific flight, launchsite, and date combo...
    while ($row = sql_fetch_array($result)) {
        $query2 = "select 
            flightid, 
            launchsite, 
            thedate, 
            thetime, 
            altitude, 
            latitude, 
            longitude 

            from 
            predictiondata 

            where 
            flightid = $1 
            and launchsite = $2 
            and thedate = $3 

            order by 
            flightid, 
            launchsite, 
            thedate, 
            thetime asc;";
        $result2 = pg_query_params($link, $query2, array(sql_escape_string($row['flightid']), sql_escape_string($row['launchsite']), sql_escape_string($row['thedate'])));
        if (!$result2) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
 
        //printf("row:<br>"); print_r ($row); printf("<br><br>");
        $numrows = sql_num_rows($result2);
        $mins = 0;
        while ($row2 = sql_fetch_array($result2)) {

            //printf("row2:<br>"); print_r ($row2); printf("<br><br>");
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
                //printf("<br>positioninfo exists [%s]<br>", $flightid); 
                $positioninfo[$flightid] = array($thetime, "/O", $latitude, $longitude, $altitude, "Flight prediction<br>Launch site:  " . $launchsite, "");
            }
            else {
                $positioninfo[$flightid] = array($thetime, "/O", $latitude, $longitude, $altitude, "Flight prediction<br>Launch site:  " . $launchsite, "");
                //printf ("<br>adding positioninfo [%s]<br>", $flightid); print_r($positioninfo); printf("<br><br>");
            }
            $mins += 1;
        }
    }

    //printf ("<br>positioninfo array:<br>"); print_r($positioninfo); printf("<br><br>");
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Predicted Fight Paths\" }, \"features\" : [");

    $output = array();
    $firsttimeinloop = 1;
    foreach ($features as $flightid => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
        //printf ("{ \"type\" : \"FeatureCollection\", \"features\" : [ { \"type\" : \"Feature\",\n");
        printf ("{ \"type\" : \"Feature\",\n");
	printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"symbol\" : %s, \"comment\" : %s, \"objecttype\" : \"flightprediction\", \"iconsize\" : %s },", 
		json_encode($flightid . "_prediction"), 
		json_encode($flightid), 
		json_encode($positioninfo[$flightid][1]), 
		json_encode($positioninfo[$flightid][5]),
		json_encode($config["iconsize"])
	);
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}", $positioninfo[$flightid][3], $positioninfo[$flightid][2]);
        printf ("}");
        if (count($ray) > 1) {
            printf (", ");
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
                //printf ("<br><br>peak:  %d, idx:  %d", $peak_altitude, $peak_altitude_idx);
                //printf ("<br><br>");
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"true\", \"objecttype\" : \"flightpredictionpath\" },", json_encode($flightid . "_ascent_path_prediction"));
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }, ", json_encode($ascent_portion));
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"callsign\" : %s, \"tooltip\" : %s,  \"symbol\" : \"/n\", \"altitude\" : %s, \"comment\" : \"Predicted burst\", \"objecttype\" : \"burstlocation\", \"label\" : %s, \"iconsize\" : %s },", 
                    json_encode($flightid . "_burst_predicted"), 
                    json_encode($flightid . " Predicted Burst"), 
                    json_encode(number_format($peak_altitude) . "ft"), 
                    json_encode($peak_altitude),
		    json_encode(number_format($peak_altitude) . "ft"),
		    json_encode($config["iconsize"])
                );
                printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : %s } }, ", json_encode(end($ascent_portion)));
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"false\", \"objecttype\" : \"flightpredictionpath\" },", json_encode($flightid . "_descent_path_prediction"));
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }", json_encode($descent_portion));
            } 
            else {
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"true\", \"objecttype\" : \"flightpredictionpath\" },", json_encode($flightid . "_ascent_path_prediction"));
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }", json_encode($linestring));
            }

            printf (", ");
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
                        if ($i > 0)
                            printf (", ");
                    /* This is the GeoJSON object for the breadcrumb within the predicted flight path */ 
                        printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"callsign\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : \"Flight prediction\", \"objecttype\" : \"balloonmarker\", \"time\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s },", 
                        //printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"callsign\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : \"Flight prediction\", \"objecttype\" : \"balloonmarker\", \"time\" : %s },", 
                            json_encode($flightid . "_predictionpoint_" . $i), 
                            json_encode($flightid), 
                            json_encode("/J"), 
                            json_encode($element[2]), 
                            json_encode($elem[3]),
                            json_encode(number_format(($element[2] < 10000 ? floor($element[2] / 1000) : 10 * floor($element[2] / 10000))) . "k ft"), 
			    json_encode(number_format(($element[2] < 10000 ? floor($element[2] / 1000) : 10 * floor($element[2] / 10000))) . "k ft"),
			    json_encode($config["iconsize"])
                            //json_encode(number_format($element[2]) . "ft"),
                            //json_encode(number_format($element[2]) . "ft")
                        );
                        printf (" \"geometry\" : { \"type\" : \"Point\", \"coordinates\" : %s } } ", json_encode(array($element[1], $element[0])));
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
    printf ("] }");


    sql_close($link);


?>
