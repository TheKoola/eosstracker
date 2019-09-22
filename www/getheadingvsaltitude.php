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


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    $query = "select 
           a.tm,
           a.callsign,
           a.altitude,
           a.bearing,
           st_y(a.location2d) as lat,
           st_x(a.location2d) as lon
           

           from 
           packets a,
           flightmap fm,
           flights f

           where 
           a.tm > date_trunc('minute', (now() - (to_char(($1)::interval, 'HH24:MI:SS')::time)))::timestamp
           -- and a.tm > $2
           and a.altitude != 0
           and fm.flightid = f.flightid
           and f.active = 'y'
           and a.callsign = fm.callsign

           order by 
           a.tm asc,
           a.callsign, 
           a.altitude

        ;";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"), 
      //  sql_escape_string($status["starttime"] . " " . $status["timezone"])));
    ));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
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
    $prev_alt = [];
    $prev_bearing = [];
    $first_time_through = [];

    // Loop through each row returned
    while ($row = sql_fetch_array($result)) {

        // Have we seen a packet from this callsign yet?
        if (array_key_exists($row['callsign'], $prev_alt)) {

            // The heading variablity.  
            $heading_variability = round(bearing($prev_lat[$row['callsign']], $prev_lon[$row['callsign']], $row['lat'], $row['lon']) - $row['bearing'], 2);

            // Convert this to positive/negative angle that's between -180 and +180.
            if ($heading_variability < -180.0) 
                $heading_variability = 360 + $heading_variability;
            if ($heading_variability > 180.0)
                $heading_variability = $heading_variability - 360;

            // Is this flight ascending or descending?
            if ($prev_alt[$row['callsign']] < $row['altitude']) {
                // beacon is ascending...  

                $tdata_asc[$row['callsign']][] = $row['altitude'];
                //$data_asc[$row['callsign']][] = $row['bearing'];
                $data_asc[$row['callsign']][] = $heading_variability;
           }
            else {
                // beacon is descending...
                $tdata_desc[$row['callsign']][] = $row['altitude'];
                //$data_desc[$row['callsign']][] = $row['bearing'];
                $data_desc[$row['callsign']][] = $heading_variability;
            }

        }

        // Save these values for the next iteration of the loop
        $prev_alt[$row['callsign']] = $row['altitude'];
        $prev_bearing[$row['callsign']] = $row['bearing'];
        $prev_lat[$row['callsign']] = $row['lat'];
        $prev_lon[$row['callsign']] = $row['lon'];
    }    

    if (sql_num_rows($result) > 0) {
        printf (" { ");
        $firsttime = 1;

        foreach ($data_asc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $data_asc[$key];
            $dataseries = $tdata_asc[$key];
            generateJSON($dataseries, $series, $key . "-ascent");
        }
        
        if (sizeof($data_asc) > 0 && sizeof($data_desc) > 0)
            printf (", ");

        $firsttime = 1;
        $dataseries = [];
        $series = [];
        foreach ($data_desc as $key => $series) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;
            $xdata = $data_desc[$key];
            $dataseries = $tdata_desc[$key];
            generateJSON($dataseries, $series, $key . "-descent");
        }
        printf ("}");
    }
    else
        printf ("[]");

    sql_close($link);

?>
