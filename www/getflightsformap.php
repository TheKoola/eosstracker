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


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## query the list of callsigns for those flights that are active
    #$query = 'select array_to_json(array_agg(r)) from (select distinct f.flightid, fm.callsign from flights f, flightmap fm  where fm.flightid = f.flightid and f.active = true order by f.flightid desc) as r';
    $query = 'select f.flightid from flights f where f.active = true order by f.flightid desc;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    if (sql_num_rows($result) <= 0) {
        sql_close($link);
        printf ("[]");
        return 0;
    }

    $object = [];
    $output = [];
    while($row = sql_fetch_array($result)) {
        $flightid = $row["flightid"];
        $query2 = 'select fm.callsign from flightmap fm where fm.flightid = $1 order by fm.callsign desc;';
        $result2 = pg_query_params($link, $query2, array($flightid));
        if (!$result2) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        
        $object = [];
        $callsigns = [];
        while ($row2 = sql_fetch_array($result2)) {
            $callsigns[] = $row2["callsign"];
        }
        $object["flightid"] = $flightid;
        $object["callsigns"] = $callsigns;
        $output[] = $object;
    }

    printf ("%s", json_encode($output));

    sql_close($link);

?>
