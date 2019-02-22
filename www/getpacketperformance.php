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


    $query = " select 
date_trunc('day', a.tm)::date as thedate, 
date_trunc('hour', a.tm)::time as thehour,
date_trunc('minute', a.tm)::time as theminute,
sum(case when a.raw like '%qAO,%:%' then 1 else 0 end) as rf_packets,
sum(case when a.raw not like '%qAO,%:%' then 1 else 0 end) as internet_packets

from 
packets a

where 
a.tm > date_trunc('minute', (now() - (to_char(($1)::interval, 'HH24:MI:SS')::time)))::timestamp

group by 1,2,3
order by 1,2,3
;";

    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute")));
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
