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


    header("Content-Type:  application/json;");
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

    ## query packets from stations from the past 3hrs...
    $query = "
        select 
            st_asgeojson(p.*, 'location2d')::jsonb as output  
        from 
            packets p,
            flights f,
            flightmap fm

        where
            p.tm > now() - interval '03:00:00'
            and p.raw != ''
            and fm.flightid = f.flightid
            and p.callsign = fm.callsign
            and f.active = 'y'

        order by
            p.tm asc;
    "; 

    $result = pg_query($link, $query);

    if (!$result) {
        printf("[]");
        //db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $numrows = sql_num_rows($result);

    //printf("[ { \"numrows\": \"%d\" }, ", $numrows);
    printf("[");
    $i = 0;
    while ($row = sql_fetch_array($result)) {
        printf ("%s", $row["output"]);

        if ($i < $numrows - 1)
            printf(",");
        $i++;
    }
    printf("]");
    /*if (sql_num_rows($result) > 0) {
        $data = sql_fetch_all($result);
        if ($data) 
            printf ("%s", $data);
        else
            printf("[]");
    }
    else
        printf ("[]");
     */

    sql_close($link);

?>
