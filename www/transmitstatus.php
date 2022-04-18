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
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    // Check the thetime HTML GET variable
    if (isset($_GET["transmit_text"])) {
        $get_transmit_text = check_string($_GET["transmit_text"], 64);
    }
    else
        $get_transmit_text = "";

    // The priority HTML GET variable
    $get_priority = -1;
    if (isset($_GET["priority"]))
        if (check_number($_GET["priority"], 0, 3))
            $get_priority = intval($_GET["priority"]);

    ## if any of the GET parameters are not supplied, then exit...
    if ($get_priority < 0 || $get_transmit_text == "") {
        printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");
        return 0;
    }
  
    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $xmit_text = "p" . $get_priority . $get_transmit_text;

    $query = "insert into statusqueue values (now(), $1, FALSE);";
    $result = pg_query_params($link, $query, array(sql_escape_string($xmit_text)));
    if (!$result) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }
    
    printf ("{\"result\" : 1, \"error\": \"\"}");

    sql_close($link);

?>
