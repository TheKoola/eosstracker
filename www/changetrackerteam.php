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


    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    // Check the tactical HTML GET variable
    if (isset($_GET["tactical"])) {
        $get_tactical = check_string($_GET["tactical"], 20);
    }
    else
        $get_tactical = "";

    // Check the callsign HTML GET variable
    if (isset($_GET["callsign"])) {
        $get_callsign = strtoupper(check_string($_GET["callsign"], 20));
    }
    else
        $get_callsign = "";


    ## if any of the GET parameters are not supplied, then exit...
    if ($get_callsign == "" || $get_tactical == "") {
        printf ("[]");
        return 0;
    }
  

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## Query to determine if the original callsign is in the trackers table
    $query = "select
     tm.callsign,
     tm.tactical,
     tm.notes

     from
     trackers tm
   
     where
     tm.callsign = $1
     ;";

    ## Execute the query...
    $result = pg_query_params($link, $query, array(sql_escape_string($get_callsign)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    ## if the number of rows is zero, then we couldn't find this original callsign in the trackers table...so we exit.
    $num = sql_num_rows($result);
    if ($num == 0) {
        printf ("[]");
        sql_close($link);
        return 0;
    }

    ## We're here, so we now update this record for the original callsign...
    $query = "update trackers set tactical=$1 where callsign=$2;";
    $result = pg_query_params($link, $query, array(sql_escape_string($get_tactical), sql_escape_string($get_callsign)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    
    ## if we've made it this far, return the list of trackers including the record just updated...
    $query = "select
     t.tactical,
     tm.callsign,
     tm.notes,
     case
         when t.flightid = '' or t.flightid is null then 'At Large'
         else t.flightid
     end as flightid

     from
     teams t,
     trackers tm

     where
     tm.tactical = t.tactical 

     order by
     t.tactical asc,
     tm.callsign asc
     ;";

    $result = sql_query($query);

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $trackers = [];
    $teams = [];

    while ($row = sql_fetch_array($result)) {
        $trackers[$row["tactical"]][] = array("tactical" => $row['tactical'], "callsign" => $row['callsign'], "notes" => $row['notes']);
        $teams[$row["tactical"]] = $row["flightid"];
    }

    $outerfirsttime = 0;
    printf ("[ ");
    foreach ($trackers as $tactical => $ray) {
        if ($outerfirsttime == 1)
            printf (", ");
        $outerfirsttime = 1;
        printf ("{ \"tactical\" : %s, \"flightid\" : %s, \"trackers\" : [ ", json_encode($tactical), json_encode($teams[$tactical]));
        $firsttime = 0;
        foreach ($ray as $k => $list) {
            if ($firsttime == 1)
                printf (", ");
            $firsttime = 1;
            printf ("{\"tactical\" : %s, \"callsign\" : %s, \"notes\" : %s }", 
                json_encode($list["tactical"]), 
                json_encode($list["callsign"]), 
                json_encode(($list["notes"] == "" ? "n/a" : $list["notes"])) 
            );
        }
        printf (" ] } ");
    }
    printf (" ]");

    sql_close($link);

?>
