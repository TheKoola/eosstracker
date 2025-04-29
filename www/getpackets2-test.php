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
            a.flightid,
            jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(st_asgeojson(a.*, 'location2d')::jsonb)
            ) as features
        from 
            (   select 
                    f.flightid,
                    p.*
                
                from 
                    packets p,
                    flights f,
                    flightmap fm

                where
                    p.tm > '2025-03-23 00:00:00' 
                    and p.tm < '2025-03-23 08:15:00'
                    and p.raw != ''
                    and p.callsign in ('KC0D-3', 'AE0SS-4')
                    and fm.flightid = f.flightid
                    and p.callsign = fm.callsign
                    and f.flightid = 'EOSS-369'
                order by
                    f.flightid,
                    p.tm asc
            ) as a
        group by 
            a.flightid
        ;
    ";

    $result = pg_query($link, $query);

    if (!$result) {
        printf("[]");
        //db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $numrows = sql_num_rows($result);

    printf("[");

    // loop counter
    $i = 0;

    // loop through any rows returned
    while ($row = sql_fetch_array($result)) {
        if ($i > 0)
            printf(",");
        printf("%s", $row["features"]);
        $i++;
    }
    printf("]");

    sql_close($link);
?>
