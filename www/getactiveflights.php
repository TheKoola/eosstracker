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
    if (isset($_GET["callsign"])) 
        $get_callsign = strtoupper(check_string($_GET["callsign"], 20));

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

    ## query the list of callsigns for those flights that are active
    $query = 'select f.flightid, fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = true and f.flightid = $1;';
    //$result = sql_query($query);
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    if (sql_num_rows($result) <= 0) {
        sql_close($link);
        printf ("[]");
        return 0;
    }

    $callsigns = [];

    if ($get_callsign != "") 
        $get_callsign = " and fm.callsign = '" . $get_callsign . "' ";
   

/* ============================ */

    ## query the last packets from stations...
    $query = '
select distinct 
--a.tm::timestamp without time zone as thetime, 
date_trunc(\'milliseconds\', a.tm)::timestamp without time zone as thetime,
case
    when a.ptype = \'/\' and a.raw similar to \'%[0-9]{6}h%\' then 
        date_trunc(\'second\', ((to_timestamp(substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'HH24MISS\')::timestamp at time zone \'UTC\') at time zone $1)::time)::time without time zone
    else
        date_trunc(\'second\', a.tm)::time without time zone
end as packet_time,
a.callsign, 
a.comment, 
a.symbol, 
round(a.altitude) as altitude, 
round(a.speed_mph) as speed_mph,
a.bearing,
round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
a.ptype,
a.hash,
a.raw

from 
packets a, 
flightmap fm,
flights fl

where 
a.location2d != \'\' 
and a.tm > (now() - (to_char(($2)::interval, \'HH24:MI:SS\'))::time) 
and fl.flightid = $3
and fm.flightid = fl.flightid 
and a.callsign = fm.callsign '
. $get_callsign . 
' order by thetime asc, a.callsign ;'; 


    $result = pg_query_params($link, $query, array(sql_escape_string($config["timezone"]), sql_escape_string($config["lookbackperiod"] . " minute"), sql_escape_string($get_flightid)));
    //$result = pg_query($link, $query);
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


    $positioninfo = array();
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
        $hash = $row['hash'];

        // calculate the vertical rate for this callsign
        //$time1 = date_create($thetime);
        $time1 = date_create($packettime);
        if (array_key_exists($callsign, $time_prev)) {
            if ($hash != $hash_prev[$callsign]) {
                $diff = date_diff($time_prev[$callsign], $time1);
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60;
                //$verticalrate[$callsign] = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
                if ($time_delta > 0)
                    $verticalrate = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
                else 
                    $verticalrate = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
                #printf("\ndelta:  %.6f mins\n", $time_delta);
            }
        }
        else
            $verticalrate = 0;

        /* If the altitude is 0, but the packet is different than the prior one, we're assuming the altitude number has been mangled.
           ...and therefore set it to the previous altitude value.  We do this because apparently the object is still moving, but its 
           altitude value is oddball/screwy/messed-up.  */
	if (array_key_exists($callsign, $hash_prev) && array_key_exists($callsign, $altitude_prev))
            if ($altitude == 0 && $hash_prev[$callsign] != $hash)
                $altitude = $altitude_prev[$callsign];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude, $speed_mph, $bearing, $thetime, $verticalrate, $callsign, $packettime);
        $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $speed_mph, $bearing, $verticalrate, $callsign, $packettime);
 
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


    // this is for the FeatureCollection preamble 
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Active Flights\" }, \"features\" : [" );

    
    // This loop just prints out the last position report for each beacon on this flight.  So for a two-beacon flight, this loop should run through twice.
    $firsttimeinloop = 1;
    if ($numrows > 0) {
    
        // Reverse the array so that the newest/latest position report is printed first.
        $positioninfo_r = array_reverse($positioninfo);

        // Loop through the newest/last/latest position report for each callsign within the flight and print out GeoJSON for it.
        $i = 0;
        foreach ($positioninfo_r as $callsign => $ray) {
            if ($firsttimeinloop == 0)
                printf (", ");
            $firsttimeinloop = 0;
    
            /* This prints out GeoJSON for the current location of the balloon/object */
            printf ("{ \"type\" : \"Feature\",");
            printf ("\"properties\" : { \"id\" : %s, \"flightid\" : %s, \"callsign\" : %s, \"time\" : %s, \"packet_time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"objecttype\" : \"balloon\", \"speed\" : %s, \"bearing\" : %s, \"verticalrate\" : %s, \"label\" : %s, \"iconsize\" : %s },", 
            json_encode($callsign), 
            json_encode($get_flightid), 
            json_encode($callsign), 
            json_encode($ray[0]), 
            json_encode($ray[10]), 
            json_encode($ray[1]), 
            json_encode($ray[4]), 
            json_encode("Flight: <strong>" . $get_flightid. "</strong>" . ($ray[5] == "" ? "" : "<br>" . $ray[5]) . "<br>Speed: " . $ray[6] . " mph<br>Heading: " . $ray[7] . "&#176;<br>Vert Rate: " . number_format($ray[8]) . " ft/min"), 
            //json_encode("bla bla"),
            json_encode($callsign), 
            json_encode($ray[6]), 
            json_encode($ray[7]), 
            json_encode($ray[8]),
	    json_encode($callsign . "<br>" . number_format($ray[4]) . "ft"),
	    json_encode($config["iconsize"])
            );

            /* Print out the geometry object for this APRS object.  In this case, just the coordinates of the its current position */
            printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]} }", $ray[3], $ray[2]);
            $i += 1;
        }
    }

    // This loop if for printing out the GeoJSON that makes up the "path" that each beacon has taken.
    $firsttimeinloop = 1;
    if ($numrows > 0) {
    foreach ($features as $callsign => $ray) {

        /* This block is for gathering up the linestring coordinates for the recent path the APRS object may have taken */
        if (count($ray) > 1) {
            printf (", ");
            $peak_altitude = 0;
            $peak_altitude_idx = 0;
            $i = 0;

            /* construct the linestring array that contains the list of coordinates for where we've heard APRS position beacons */
            /* ...*/
            /* ...also find the peak altitude thus far. */
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
                if ($elem[2] >= $peak_altitude) {
                    $peak_altitude = $elem[2];
                    $peak_altitude_idx = $i;
                    //printf ("<br>count:  %d, idx:  %d, peak:  %d<br>", count($linestring), $peak_altitude_idx, $peak_altitude);
                }
                $i += 1;
            }
  

            //find out if this balloon has hit a peak altitude and is now going down
            // ...if "yes", then we need to split up the flight into two different features:
            // 1) for the ascent portion of the flight, and 2) for the descent portion of the flight
            // 
            //printf ("<br><br>count:  %d, idx:  %d, peak:  %d<br>", count($linestring), $peak_altitude_idx, $peak_altitude);

            /* is the peak altitude the last altitude?  If 'yes', then this object has yet to start descending.  If 'no', then yes..we're descending 
               to determine that, we check the number of items in the linestring array (see above), if the peak altitude is NOT the 
               last item in that array...well, then we enter this block of code, because the balloon/object is descending */
            if (count($linestring) > $peak_altitude_idx + 1) {
                $ascent_portion = array_slice($linestring, 0, $peak_altitude_idx + 1); 
                $descent_portion = array_slice($linestring, $peak_altitude_idx);
                
                /* This is a GeoJSON object for the ascent portion of the flight */
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"true\", \"objecttype\" : \"balloonpath\", \"flightid\" : %s  },", json_encode($callsign . "_ascent_path"), json_encode($get_flightid));
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }, ", json_encode($ascent_portion));

                /* This is a GeoJSON object that will denote the peak altitude location we observed.  It's not the "exact" burst 
                   location for the balloon, but it's the highest altitude APRS beacon we've received for this callsign.
                   So, we print out a GeoJSON object at this lat/lon. */
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"flightid\" : %s, \"callsign\" : %s, \"tooltip\" : %s, \"symbol\" : \"/n\", \"altitude\" : %s, \"comment\" : %s, \"objecttype\" : \"burstlocation\", \"label\" : %s, \"iconsize\" : %s },", 
                    json_encode($callsign . "_burst"), 
                    json_encode($get_flightid), 
                    json_encode($callsign . " Approximate Burst"), 
                    json_encode(number_format($peak_altitude) . "ft"), 
                    json_encode($peak_altitude), 
                    json_encode($get_flightid . " balloon burst"),
		    json_encode(number_format($peak_altitude) . "ft"),
		    json_encode($config["iconsize"])
                );
                printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : %s } }, ", json_encode(end($ascent_portion)));

                /* This is a GeoJSON object for the descent portion of the flight */
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"false\", \"objecttype\" : \"balloonpath\", \"flightid\" : %s},", 
                    json_encode($callsign . "_descent_path"), 
                    json_encode($get_flightid)
                );
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  },", json_encode($descent_portion));

            } 
 
            /* ...otherwise the balloon/object is still ascending */
            else {
                /* presumably the balloon/object is still ascending so we only print out the GeoJSON object for the  ascending portion 
                   of the flight thus far...which is the only data we have, btw. */
                printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"ascending\" : \"true\", \"objecttype\" : \"balloonpath\", \"flightid\" : %s },", 
                    json_encode($callsign . "_ascent_path"), 
                    json_encode($get_flightid)
                );
                printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  },", json_encode($linestring));
            }


            /* This block is for creating a GeoJSON objects to represent the "breadcrumbs" or small markers that represent
               where along the path of the balloon/object we've received APRS position beacons */
            $i = 0;
            $anotherfirsttime = 0;
            $numpoints = count($ray) - 1;
            $prev = 0;
            $alt_prev = 0;
            $current = 0;
            $printlabel = false;
            foreach ($ray as $k => $elem) {
                $alt = $elem[2];

                if ($alt > $alt_prev)
                    $current = floor($alt / 10000);
                else  
                    $current = ceil($alt / 10000);

                if ($current != $prev && $i != 0)
                    // we want to print a label...
                    $printlabel = true;
                else
                    $printlabel = false;
                     

                if ($elem[2] != $peak_altitude && $i < $numpoints) {
                    if ($anotherfirsttime == 1)
                        printf (", ");
                    $anotherfirsttime = 1;
                    //$altstring = number_format(($alt < 10000 ? floor($alt / 1000) : 10 * floor($alt / 10000))) . "k ft";
                    if ($alt > $alt_prev)
                        $altstring = number_format(floor($alt / 1000)) .  "k ft";
                    else
                        $altstring = number_format(ceil($alt / 1000)) .  "k ft";
 
                    /* This is for a GeoJSON object denoting the location of the breadcrumb */
                    printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s, \"time\" : %s, \"packet_time\" : %s, \"flightid\" : %s, \"callsign\" : %s, \"symbol\" : \"/J\", \"altitude\" : %s, \"comment\" : %s, \"objecttype\" : \"balloonmarker\", \"ascending\" : %s, \"speed\" : %s, \"heading\" : %s, \"verticalrate\" : %s, \"iconsize\" : %s },", 
                        json_encode($callsign . "_point_" . $i), 
                        json_encode($elem[5]), 
                        json_encode($elem[8]), 
                        json_encode($get_flightid), 
                        json_encode($callsign), 
                        json_encode($elem[2]),  
                        json_encode("Flight: <strong>" . $get_flightid . "</strong><br>Speed: " . $elem[3] . " mph<br>Heading: " . $elem[4] . "&#176;<br>Vert Rate: " . number_format($elem[6]) . " ft/min"), 
                        json_encode(($i < $peak_altitude_idx ? "true" : "false")), 
                        json_encode($elem[3]), 
                        json_encode($elem[4]), 
			json_encode($elem[6]),
			json_encode($config["iconsize"])
                        //($printlabel == true ? ", \"tooltip\" : " . json_encode($altstring) . ", \"label\" : " . json_encode($altstring) . "" : "")
                    );

                    // print out the geometry of this breadcrumb...just it's coordinates in GeoJSON format.
                    printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : %s } } ", json_encode(array($elem[1], $elem[0])));
                }
                $alt_prev = $alt;
                $prev = $current;
                $i += 1;
            }
            unset ($linestring);
        }
      }
   }

    // This is for the ending of the FeatureCollection 
    printf ("] }");


    // close our connection to PostGreSQL
    sql_close($link);


?>
