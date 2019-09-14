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


    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $formerror = false;

    // Check the launchsite HTML GET variable
    if (isset($_GET["launchsite"])) {
        if(($launchsite = check_string($_GET["launchsite"], 64)) == "")
            $formerror = true;
    }
    else
        $formerror = true;


    if ($formerror == false) {
        $query = "select l.launchsite from launchsites l where l.launchsite = $1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($launchsite)));
        if (!$result) {
            printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform SQL updates to the flightmap table here...
            $query = "delete from launchsites where launchsite = $1;";
            $result = pg_query_params($link, $query, array(sql_escape_string($launchsite)));
            if (!$result) {
                printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
            printf ("{\"result\" : 1, \"error\": \"\"}");
        }
        else
            printf ("{\"result\" : 0, \"error\": \"Launch site does not exist\"}");
    }
    else
       printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");

    sql_close($link);

?>
