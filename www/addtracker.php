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


    // Check the notes HTML GET variable
    if (isset($_GET["notes"])) {
        $get_notes = check_string($_GET["notes"], 64);
    }
    else
        $get_notes = "";

    // Check the callsign HTML GET variable
    if (isset($_GET["callsign"])) {
        $get_callsign = strtoupper(check_string($_GET["callsign"], 20));
    }
    else
        $get_callsign = "";


    // Check the team HTML GET variable
    if (isset($_GET["team"])) {
        $get_team = check_string($_GET["team"], 20);
    }
    else
        $get_team = "";


    ## if any of the GET parameters are not supplied, then exit...
    if ($get_team == "" || $get_callsign == "" || $get_notes == "") {
        printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");
        return 0;
    }
  

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $query = "insert into trackers values (upper(btrim($1)), $2, $3);";
    $result = pg_query_params($link, $query, array(sql_escape_string($get_callsign), sql_escape_string($get_team), sql_escape_string($get_notes)));
    if (!$result) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }
    
    // If we've made it this far then sucess!!
    printf ("{\"result\" : 1, \"error\": \"\"}");

    sql_close($link);

?>
