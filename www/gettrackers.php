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

    // Check the flightid HTML GET variable
    $get_flightid = "";
    $whereclause = "";
    if (isset($_GET["flightid"])) 
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) != "") 
            $whereclause = " and t.flightid = $1 ";
 
    

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


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
     tm.tactical = t.tactical " .
     ($get_flightid == "" ? "" : " and t.flightid = $1 ")  .

     "order by 
     t.tactical asc,
     tm.callsign asc
     ;";

    if ($get_flightid == "")
        $result = sql_query($query);
    else 
        $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));

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
           // printf ("<br><br>");
           // print_r($list);
           // printf ("<br><br>");
            printf ("{\"tactical\" : %s, \"callsign\" : %s, \"notes\" : %s }", 
                json_encode($list["tactical"]), 
                json_encode($list["callsign"]), 
                json_encode(($list["notes"] == "" ? "n/a" : $list["notes"])) 
            );
        }
        printf (" ] } ");
    }
    printf (" ]");

//    printf ("%s<br><br>", json_encode($trackers));
//    printf ("%s", json_encode($object));

    sql_close($link);

?>
