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
    include $documentroot . '/common/sessionvariables.php';

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
count(a.*) as number_of_packets

from 
packets a

where 
a.tm > date_trunc('minute', (now() - (to_char(('" . $lookbackperiod . " minute')::interval, 'HH24:MI:SS')::time)))::timestamp

group by 1,2,3
order by 1,2,3
;";

    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $adata = [];
    $channels = [];

    while ($row = sql_fetch_array($result)) {
        $tdata[]= $row['theminute'];
        $adata[] = $row['number_of_packets'];
    }    


    printf (" { ");
    $outerfirsttime = 1;
         $innerfirsttime = 1;
         printf ("\"tm-packets\" : [");
         foreach ($tdata as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("\"%s\"", $value);
         }
         printf ("], ");

         $innerfirsttime = 1;
         printf ("\"packets\" : [");
         foreach ($adata as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("%s", $value);
         }
         printf ("] ");
    printf ("}");

    sql_close($link);


?>
