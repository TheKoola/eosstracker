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
    
    // For future use...
    $prediction_type = "predicted"; 
    
    
    // Check the flightid HTML GET variable
    $formerror = false;
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true;


    // If the flightid wasn't given then exit.
    if ($formerror == true) {
        printf ("[]");
        return 0;
    }

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## Determine how many seconds have elapsed since the last packet from the flight.
    $query = "select
        extract(epoch from (now() - max(a.tm))) as secs

        from
        packets a,
        flights f,
        flightmap fm

        where
        f.flightid = $1
        and fm.flightid = f.flightid
        and a.callsign = fm.callsign;";

    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $rows = sql_fetch_all($result);
    $seconds_since_last_packet = $rows[0]['secs'];

    # If the last packet from the flight is older than the lookback period, then we just return.  
    # We don't want to display landing predictions for older stuff.
    if ($seconds_since_last_packet > $config["lookbackperiod"] * 60) {
        printf ("[]");
        sql_close($link);
        return 0;
    }

    
    ## get the latest time to live
    $query = 'select distinct on (l.tm, l.flightid)
        l.tm::timestamp without time zone, 
        l.flightid, 
        l.ttl

        from 
        landingpredictions l, 
        flights f,
        (select flightid, max(tm) as thetime from landingpredictions group by flightid order by flightid) as a 

        where 
        f.flightid = l.flightid 
        and f.active = \'t\' 
        and l.flightid = $1 
        and l.tm > (now() - (to_char(($2)::interval, \'HH24:MI:SS\'))::time)  
        and l.flightid = a.flightid
        and l.tm = a.thetime

        order by 
        l.tm asc, 
        l.flightid,
        l.ttl asc

        limit 1; ';
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid), sql_escape_string($config["lookbackperiod"] . " minute")));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $firsttimeinloop = 1;
    while ($row = sql_fetch_array($result)) {
        $thetime = $row['tm'];
        $flightid = $row['flightid'];
        $ttl = $row['ttl'];
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
        printf ("{ \"flightid\" : %s, \"time\" : %s, \"ttl\" : %s }", json_encode($flightid), json_encode($thetime), json_encode(($ttl <= 0 ? "n/a" : round($ttl/60.0)))); 
    }

    if (sql_num_rows($result) <= 0)
        printf("[]");

    sql_close($link);


?>
