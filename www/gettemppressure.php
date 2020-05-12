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

    ###  This will query the database for the n most recent packets.  

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
             printf ("%s", $value);
         }
         printf ("] ");
    }


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    if ($status["direwolfcallsign"] == "")
        $mycallsign = "E0SS";
    else {
        $mycallsign = $status["direwolfcallsign"];
    }

    $query = "
        select
        a.callsign,
        a.tm,
        round(a.altitude / 1000, 1) as altitude,
        round(32 + 1.8 * cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2) as temperature_f,
        round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0 / 101325.0, 4) as pressure_atm

        from 
        packets a,
        flightmap fm,
        flights f

        where 
        a.tm > date_trunc('minute', (now() - (to_char(($1)::interval, 'HH24:MI:SS')::time)))::timestamp
        and a.callsign = fm.callsign
        and fm.flightid = f.flightid
        and f.active = 'y'
        and a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P%%'
        and a.tm > $2

        order by 1,2
        ;";

    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute"), sql_escape_string($status["starttime"] . " " . $status["timezone"])));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $fdata = [];
    $pdata = [];
    $callsignlist = [];

    while ($row = sql_fetch_array($result)) {
        $callsign = $row['callsign'];
        $callsignlist[$callsign] = $callsign;
        $tdata[$callsign][] = $row['altitude'];
        $fdata[$callsign][] = $row['temperature_f'];
        $pdata[$callsign][] = $row['pressure_atm'];
    }    

    if (sql_num_rows($result) > 0) { 
        $firsttime = 1;
        printf (" { ");
        foreach ($callsignlist as $key => $callsign) {
            if ($firsttime == 0)
                printf (", ");
            $firsttime = 0;

            // Looking for the maximum altitude
            $max = max($tdata[$callsign]);
            $max_idx = array_search($max, $tdata[$callsign]);

            if ($max_idx > 0) {
                $ascent_tdata  = array_slice($tdata[$callsign], 0, $max_idx);
                $ascent_fdata  = array_slice($fdata[$callsign], 0, $max_idx);
                $ascent_pdata  = array_slice($pdata[$callsign], 0, $max_idx);

                generateJSON($ascent_tdata, $ascent_fdata, $callsign . "_Ascent_T");
                printf (", ");
                generateJSON($ascent_tdata, $ascent_pdata, $callsign . "_Ascent_P");
            }

            if ($max_idx < sizeof($tdata[$callsign]) + 1) {
                $descent_tdata = array_slice($tdata[$callsign], $max_idx + 1);
                $descent_fdata = array_slice($fdata[$callsign], $max_idx + 1);
                $descent_pdata = array_slice($pdata[$callsign], $max_idx + 1);
                //printf ("<br>max_idx: %d, len: %d<br>\n", $max_idx, sizeof($tdata[$callsign]));

                if ($max_idx > 0)
                    printf (", ");
                generateJSON($descent_tdata, $descent_fdata, $callsign . "_Descent_T");
                printf (", ");
                generateJSON($descent_tdata, $descent_pdata, $callsign . "_Descent_P");
            }
        }
        printf ("}");
    }
    else
        printf ("[]");

    sql_close($link);
?>
