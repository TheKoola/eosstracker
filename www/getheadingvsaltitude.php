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
        
    # if the habtracker-daemon is not running then don't return any rows...technically we could return rows, but we dont know 
    # when to start looking at packets as we don't know the prior habtracker-daemon start time.
    if ($status["active"] == 0) {
        printf ("[]");
        return;
    }


    /*************
     * generateJSON
     *
     * This function is for printing out JSON for the x-axis series (eg. $timeseries) and the y-axis series (eg. $dataseries).
     * It is intended to be ingested by Javascript running in the browser...which will use the c3js.org libraries to create a chart.
     *************/
    function generateJSON($timeseries, $dataseries, $seriesname) {
         $innerfirsttime = 1;
         printf ("\"tm-%s\" : [", $seriesname);
         foreach ($timeseries as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("\"%s\"", $value);
         }
         printf ("], ");

         $innerfirsttime = 1;
         printf ("\"%s\" : [", $seriesname);
         foreach ($dataseries as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("\"%s\"", $value);
         }
         printf ("] ");
    }


    /*************
     * bearing
     *
     * This function will determine the bearing between two points in latitude/longitude.
     *************/
    function bearing($lat1, $lon1, $lat2, $lon2) {

        // Flat world bearing...
        $theta_flat = rad2deg(atan2($lon2 - $lon1, $lat2 - $lat1));

        // Convert all of these to radians
        $lat1 = deg2rad($lat1);
        $lon1 = deg2rad($lon1);
        $lat2 = deg2rad($lat2);
        $lon2 = deg2rad($lon2);

        // The earth is round, bearing (aka using great circle calcs)
        $x = cos($lat1) * sin($lat2) - sin($lat1) * cos($lat2) * cos($lon2 - $lon1);
        $y = sin($lon2 - $lon1) * cos($lat2);
        $theta = rad2deg(atan2($y, $x));

        // get to a 0 -to-> 360 range
        $theta = fmod($theta + 360,360);
        $theta_flat = fmod($theta_flat + 360,360);

        //printf ("flat:  %.2f, circle: %.2f<br>", $theta_flat, $theta);

        return $theta;
    }


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
           a.altitude,
           a.bearing,
           st_y(a.location2d) as lat,
           st_x(a.location2d) as lon,
              case
                  when a.raw similar to '%[0-9]{6}h%' then 
                      date_trunc('second', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                  else
                      date_trunc('second', a.tm)::time without time zone
              end as packet_time,
           a.hash

           from 
           packets a,
           flightmap fm,
           flights f

           where 
           a.tm > date_trunc('minute', (now() - (to_char(($2)::interval, 'HH24:MI:SS')::time)))::timestamp
           and a.tm > $3
           and a.altitude > 0
           and fm.flightid = f.flightid
           and a.callsign = fm.callsign
           and f.active = 't'  " . $flightstring . "

           order by 
           f.flightid,
           a.callsign,
           thetime asc
        ;";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]),
        sql_escape_string($config["lookbackperiod"] . " minute"), 
        sql_escape_string($status["starttime"] . " " . $status["timezone"])
    ));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   

    /*** The following arrays hold the x and y data for our chart ***/
    // Time data points (for caculating rates)
    $tdata_asc = [];
    $tdata_desc = [];

    // altitude data
    $adata_asc = [];
    $adata_desc = [];

    // heading variablity
    $headingvar_asc = [];
    $headingvar_desc = [];

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


    /******** ascent *****/
    // This is the y-axis
    $tdata_asc = [];

    // This is the x-axis
    $data_asc = [];

    /******** descent *****/
    // This is the y-axis
    $tdata_desc = [];

    // This is the x-axis
    $data_desc = [];

    // Some loop variables to keep track of state from one iteration to another
    $altitude_prev = [];
    $time_prev = [];
    $prev_bearing = [];
    $first_time_through = [];
    $i = 0;
    $hash_prev = [];

    // Loop through each row returned
    while ($row = sql_fetch_array($result)) {

        // All the data from this row...
        $flightid = $row['flightid'];
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $altitude = $row['altitude'];
        $lat = $row['lat'];
        $lon = $row['lon'];
        $hash = $row['hash'];

        // Timestamp for this packet
        $time1 = date_create($packettime);

        // Have we seen a packet from this callsign yet?
        if (array_key_exists($row['callsign'], $time_prev)) {
        //if (array_key_exists($row['callsign'], $prev_alt)) {
            
            // if this packet is different (i.e. differnet MD5 hash) then process it...
            if ($hash != $hash_prev[$callsign]) {

                // Difference in datetime from the last packet to this current one
                $diff = date_diff($time_prev[$callsign], $time1);

                // The time delta in minutes (why not seconds?  Because we're calculating rates in ft/min)
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60.0;

                // Save this callsign to our list of callsigns for each flightid
                $callsigns[$flightid][$callsign] = $callsign;

                // The heading variablity.  
                $heading_variability = round(bearing($prev_lat[$row['callsign']], $prev_lon[$row['callsign']], $row['lat'], $row['lon']) - $row['bearing'], 2);

                // Convert the heading variability to a positive/negative angle that's between -180 and +180.
                if ($heading_variability < -180.0) 
                    $heading_variability = 360 + $heading_variability;
                if ($heading_variability > 180.0)
                    $heading_variability = $heading_variability - 360;

                // Is this callsign ascending or descending?
                if ($altitude > $altitude_prev[$callsign]) {
                    /**************** Ascending *****************/
                    $tdata_asc[$callsign][]= $thetime;
                    $adata_asc[$callsign][] = $altitude;

                    // Heading variabilty
                    $headingvar_asc[$row['callsign']][] = $heading_variability;

                    // Do we have an actual time delta?
                    if ($time_delta > 0)
                        // calculate the vertical rate in ft/min for this packet
                        $vrate = ($altitude - $altitude_prev[$callsign])/$time_delta;
                    else
                        $vrate = 0;

                    // Calculate vertical acceleration
                    if (array_key_exists($callsign, $verticalrate_asc)) {
                        $acceldata_asc[$callsign][] = round(($vrate - $verticalrate_asc[$callsign][count($verticalrate_asc[$callsign]) - 1]) / $time_delta, 0);
                        $acceldata_altitudes_asc[$callsign][] = $altitude;
                    }

                    // Add this vertical rate to the array of vert rates for this callsign.
                    $verticalrate_asc[$callsign][] = round($vrate, 0);

                }
                else {
                    /**************** Descending *****************/
                    $tdata_desc[$callsign][]= $thetime;
                    $adata_desc[$callsign][] = $altitude;

                    // Heading variability
                    $headingvar_desc[$row['callsign']][] = $heading_variability;

                    // Do we have an actual time delta?
                    if ($time_delta > 0)
                        // calculate the vertical rate in ft/min for this packet
                        $vrate = ($altitude - $altitude_prev[$callsign])/$time_delta;
                    else
                        $vrate = 0;

                    // Calculate vertical acceleration
                    if (array_key_exists($callsign, $verticalrate_desc)) {
                        $acceldata_desc[$callsign][] = round(($vrate - $verticalrate_desc[$callsign][count($verticalrate_desc[$callsign]) - 1]) / $time_delta, 0);
                        $acceldata_altitudes_desc[$callsign][] = $altitude;
                    }

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

       // Save these values for the next iteration of the loop
       $prev_bearing[$callsign] = $row['bearing'];
       $prev_lat[$callsign] = $lat;
       $prev_lon[$callsign] = $lon;
       $hash_prev[$callsign] = $hash;

       $i++;

    } // while loop


    if ($numrows > 0) {
        printf (" { ");

        // The heading variability for the ascent
        $firsttime = 1;
        foreach ($headingvar_asc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $headingvar_asc[$key];
            $dataseries = $adata_asc[$key];
            generateJSON($dataseries, $series, $key . "-ascent");
        }
        
        // If we need a comma inbetween
        if (sizeof($headingvar_asc) > 0 && sizeof($headingvar_desc) > 0)
            printf (", ");

        // The heading variability for the descent
        $firsttime = 1;
        $dataseries = [];
        $series = [];
        foreach ($headingvar_desc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $headingvar_desc[$key];
            $dataseries = $adata_desc[$key];
            generateJSON($dataseries, $series, $key . "-descent");
        }

/*    
        // If we need a comma inbetween
        if ((sizeof($headingvar_asc) > 0 || sizeof($headingvar_desc) > 0) && sizeof($acceldata_asc) > 0)
            printf (", ");

        // The acceleration data from the ascent
        $firsttime = 1;
        $dataseries = [];
        $series = [];
        foreach ($acceldata_asc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $acceldata_asc[$key];
            $dataseries = $acceldata_altitudes_asc[$key];
            generateJSON($dataseries, $series, $key . "-asc-accel");
        }

        // If we need a comma inbetween
        if ((sizeof($headingvar_asc) > 0 || sizeof($headingvar_desc) > 0 || sizeof($acceldata_asc) > 0) && sizeof($acceldata_desc) > 0)
            printf (", ");

        // The acceleration data from the descent
        $firsttime = 1;
        $dataseries = [];
        $series = [];
        foreach ($acceldata_desc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $acceldata_desc[$key];
            $dataseries = $acceldata_altitudes_desc[$key];
            generateJSON($dataseries, $series, $key . "-desc-accel");
        }
 */

        printf ("}");
    }
    else
        printf ("[]");

    sql_close($link);

?>
