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


    $query = " select 
date_trunc('day', a.tm)::date as thedate, 
date_trunc('hour', a.tm)::time as thehour,
date_trunc('minute', a.tm)::time as theminute " . 
($status["rf_mode"] == 1 ? 
", sum(case when a.raw like '%qAO," . $mycallsign . "%:%' then 1 else 0 end) as rf_packets,
sum(case when a.raw not like '%qAO," . $mycallsign . "%:%' then 1 else 0 end) as internet_packets " 
: 
", count(a.*) as internet_packets, 
   0 as rf_packets ") . 

"from 
packets a

where 
a.tm > date_trunc('minute', (now() - (to_char(($1)::interval, 'HH24:MI:SS')::time)))::timestamp
and a.tm > $2


group by 1,2,3
order by 1,2,3
;";

    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute"), sql_escape_string($status["starttime"] . " " . $status["timezone"])));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $adata = [];
    $rfdata = [];
    $channels = [];

    while ($row = sql_fetch_array($result)) {
        $tdata[]= $row['theminute'];
        $adata[] = $row['internet_packets'];
        $rfdata[] = $row['rf_packets'];
    }    


    printf (" { ");
    generateJSON($tdata, $adata, "Internet_Packets");
    printf (", ");
    generateJSON($tdata, $rfdata, "RF_Packets");

    printf ("}");

    sql_close($link);
?>
