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


    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();


    ## Look for the variable "flightid" to be set. 
    $flightstring = "";
    if (isset($_GET["flightid"])) {
        if (($flightid = strtoupper(check_string($_GET["flightid"], 20))) != "") {
            $flightarray = explode(',', $flightid); 
            $flightstring = " and f.flightid in (";
            $firsttime = 1;
            foreach($flightarray as $flight) {
                if (! $firsttime)
                    $flightstring = $flightstring . ",";
                $firsttime = 0;
                $flightstring = $flightstring . "'" . $flight . "'"; 
            }
            $flightstring = $flightstring . ") ";
        }
    }


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $query = "select distinct on (f.flightid, a.callsign, thetime) 
              a.callsign, 
              f.flightid, 
              date_trunc('seconds', a.tm)::time without time zone as thetime, 
              case
                  when a.raw similar to '%[0-9]{6}h%' then 
                      date_trunc('second', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                  else
                      date_trunc('second', a.tm)::time without time zone
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
              and a.tm > date_trunc('minute', (now() - (to_char(($2)::interval, 'HH24:MI:SS')::time)))::timestamp
              and a.altitude > 0 
              and active = 't'  " . $flightstring . " 

              order by 
              f.flightid, 
              a.callsign, 
              thetime asc; 
              ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]), 
        sql_escape_string($config["lookbackperiod"] . " minute")
    ));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    // The following arrays hold the x and y data for our chart
    // Time data points (for caculating rates)
    $tdata_asc = [];
    $tdata_desc = [];

    // altitude data
    $adata_asc = [];
    $adata_desc = [];

    // vertical rates (aka velocities)
    $verticalrate_asc = [];
    $verticalrate_desc = [];

    // acceleration (aka changes in velocity)
    $acceldata_altitudes_asc = [];
    $acceldata_altitudes_desc = [];
    $acceldata_asc = [];
    $acceldata_desc = [];

    // The list of callsigns
    $callsigns = [];

    // Number of rows returned from the query above
    $numrows = sql_num_rows($result);

    // Loop state variables
    $time_prev = [];
    $altitude_prev = [];
    $hash_prev = [];
    $i = 0;

    // Loop through each row returned, calculating the vertical rate, and inserting into the tdata_xxx and adata_xxx arrays.
    while ($row = sql_fetch_array($result)) {

        // All the data from this row...
        $flightid = $row['flightid'];
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $altitude = $row['altitude'];
        $hash = $row['hash'];

        // Timestamp for this packet 
        $time1 = date_create($packettime);

        // This code block will calculate the vertical rate for this callsign
        if (array_key_exists($callsign, $time_prev)) {
            // if this packet is different (i.e. differnet MD5 hash) then process it...
            if ($hash != $hash_prev[$callsign]) {

                // Difference in datetime from the last packet to this current one
                $diff = date_diff($time_prev[$callsign], $time1);

                // The time delta in minutes (why not seconds?  Because we're calculating rates in ft/min)
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60.0;

                // Save this callsign to our list of callsigns for each flightid
                $callsigns[$flightid][$callsign] = $callsign;

                // Is this callsign ascending or descending?
                if ($altitude > $altitude_prev[$callsign]) {
                    // ascending...
                    $tdata_asc[$callsign][]= $thetime;
                    $adata_asc[$callsign][] = $altitude;


                    // Do we have a real time delta?
                    if ($time_delta > 0)
                        // calculate the vertical rate in ft/min for this packet
                        $vrate = ($altitude - $altitude_prev[$callsign])/$time_delta;
                    else
                        // time delta was zero (shouldn't be here...but...just in case)...we use a time_delta of 1 second.
                        //$vrate = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
                        $vrate = 0;
                    
                    // Calculate vertical acceleration
                    if (array_key_exists($callsign, $verticalrate_asc)) {
                        /*printf ("<br>tdelta: %.2f, vrate: %.2f, pvrate: %.2f, diff: %.2f, accel: %.2f<br>", 
                            $time_delta, 
                            $vrate, 
                            $verticalrate_asc[$callsign][count($verticalrate_asc[$callsign]) - 1], 
                            $vrate - $verticalrate_asc[$callsign][count($verticalrate_asc[$callsign]) - 1], 
                            ($vrate - $verticalrate_asc[$callsign][count($verticalrate_asc[$callsign]) - 1]) / $time_delta);
                         */
                        $acceldata_asc[$callsign][] = round(($vrate - $verticalrate_asc[$callsign][count($verticalrate_asc[$callsign]) - 1]) / $time_delta, 0);
                        $acceldata_altitudes_asc[$callsign][] = $altitude;
                    }
                    //else {
                    //    $acceldata_asc[$callsign][] = 0;
                    //    $acceldata_altitudes_asc[$callsign][] = $altitude;
                    //}

                    // Add this vertical rate to the array of vert rates for this callsign.
                    $verticalrate_asc[$callsign][] = round($vrate, 0);

                }
                else {
                    // descending...
                    $tdata_desc[$callsign][]= $thetime;
                    $adata_desc[$callsign][] = $altitude;

                    // Do we have a real time delta?
                    if ($time_delta > 0)
                        // calculate the vertical rate in ft/min for this packet
                        $vrate = ($altitude - $altitude_prev[$callsign])/$time_delta;
                    else
                        // time delta was zero (shouldn't be here...but...just in case)...we use a time_delta of 1 second.
                        //$vrate = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
                        $vrate = 0;

                    // Calculate vertical acceleration
                    if (array_key_exists($callsign, $verticalrate_desc)) {
                        $acceldata_desc[$callsign][] = round(($vrate - $verticalrate_desc[$callsign][count($verticalrate_desc[$callsign]) - 1]) / $time_delta, 0);
                        $acceldata_altitudes_desc[$callsign][] = $altitude;
                    }
                    //else {
                    //    $acceldata_desc[$callsign][] = 0;
                    //    $acceldata_altitudes_desc[$callsign][] = $altitude;
                   // }

                    // Add this vertical rate to the array of vert rates for this callsign.
                    $verticalrate_desc[$callsign][] = round($vrate, 0);
                }

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


    // If there are rows to loop through, then print out the beginning squiggly bracket for the JSON output. ;)
    if ($numrows > 0)
        printf ("{");

    // Now loop through each callsign printing out JSON for each portion of its flight (i.e. ascending, descending).
    $superfirsttime = 1;
    foreach ($callsigns as $flightid => $ray) {
        if (! $superfirsttime)
            printf (", ");
        $superfirsttime = 0;

        // Now loop through the ascending portion of the flight
        $outerfirsttime = 1;
        if (sizeof($adata_asc) > 0) {
            foreach ($ray as $cs) {
                if (array_key_exists($cs, $verticalrate_asc)) {
                    if (! $outerfirsttime)
                        printf (", ");
                    $outerfirsttime = 0;

                    // Print out JSON for the X-Axis (i.e. the altitude for our data points)
                    $innerfirsttime = 1;
                    printf ("\"tm-%s-ascent\" : [", $cs);
                    foreach ($adata_asc[$cs] as $value) {
                        if (! $innerfirsttime)
                            printf (", ");
                        $innerfirsttime = 0;
                        printf ("\"%s\"", $value);
                    }

                    // comma seperator...
                    printf ("], ");

                    // Print out JSON for the Y-Axis (i.e. vertical rate in ft/min).
                    $innerfirsttime = 1;
                    printf ("\"%s-ascent\" : [", $cs);
                    foreach ($verticalrate_asc[$cs] as $value) {
                        if (! $innerfirsttime)
                            printf (", ");
                        $innerfirsttime = 0;
                        printf ("\"%s\"", $value);
                    }
                    printf ("] ");
                }
            }
        }

        // If we just printed out some ascent data AND there's also descent data to loop through, then we need a comma...
        if (sizeof($adata_desc) > 0 && sizeof($adata_asc) > 0)
            printf (", ");

        // Now loop through the descending portion of the flight
        $outerfirsttime = 1;
        if (sizeof($adata_desc) > 0) {
            foreach ($ray as $cs) {
                if (array_key_exists($cs, $verticalrate_desc)) {
                    if (! $outerfirsttime)
                        printf (", ");
                    $outerfirsttime = 0;

                    // Print out JSON for the X-Axis (i.e. the altitude for our data points)
                    $innerfirsttime = 1;
                    printf ("\"tm-%s-descent\" : [", $cs);
                    foreach ($adata_desc[$cs] as $value) {
                        if (! $innerfirsttime)
                            printf (", ");
                        $innerfirsttime = 0;
                        printf ("\"%s\"", $value);
                    }

                    // comma seperator...
                    printf ("], ");
           
                    // Print out JSON for the Y-Axis (i.e. vertical rate in ft/min).
                    $innerfirsttime = 1;
                    printf ("\"%s-descent\" : [", $cs);
                    foreach ($verticalrate_desc[$cs] as $value) {
                        if (! $innerfirsttime)
                            printf (", ");
                        $innerfirsttime = 0;
                        printf ("\"%s\"", $value);
                    }
                    printf ("] ");
                }
            }
        }
    }

    // If there were rows...then we obviously need a closing bracket for our JSON.  Otherwise, print out empty JSON.
    if ($numrows > 0)
        printf ("}");
    else
        printf ("[]");


    // Close the database connection
    sql_close($link);

?>
