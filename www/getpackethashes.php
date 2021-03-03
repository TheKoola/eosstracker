<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2021 Jeff Deaton (N6BA)
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


    header("Content-Type:  application/json;");
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    $formerror = false;
    
    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("[]");
        //db_error(sql_last_error());
        return 0;
    }

    ## query the last packets from stations...
    $query = "
        select 
        array_to_json(array_agg(r)) as output

        from 
        (
            select
            a.tm,
            a.callsign,
            a.hash

            from 
            packets a,
            flights f,
            flightmap fm

            where 
            a.tm > now()::date
            and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)
            and a.raw != ''
            and fm.flightid = f.flightid
            and a.callsign = fm.callsign
            and f.active = 'y'
   
            order by
            a.tm,
            a.callsign
        ) as r
   ;"; 

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute")
    ));

    if (!$result) {
        printf("[]");
        //db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    if (sql_num_rows($result) > 0) {
        $data = sql_fetch_all($result)[0]["output"];
        if (is_array($data)) {
            if (count($data) > 0)
                printf ("%s", sql_fetch_all($result)[0]["output"]);
            else
                printf("[]");
        }
        else
            printf ("[]");
    }
    else
        printf ("[]");

    sql_close($link);

?>
