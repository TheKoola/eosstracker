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

    // Check the freq HTML GET variable and make sure it's between 144.00 and 146.00 for our SDR system.
    if (isset($_GET["freq"])) {
        if (check_number($_GET["freq"], 144.0, 146.0))
            $freq = floatval($_GET["freq"]);
        else
            $formerror = true;
    }
    else
        $formerror = true;


    if ($formerror == false) {
        $query = "select freq from freqs where freq = $1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($freq)));
        if (!$result) {
            printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        $row = sql_fetch_array($result);
        $thefreq = $row["freq"];
        if ($numrows > 0 && $thefreq != 144.390) {
            // perform SQL updates to the freqs table here...
            $query = "delete from freqs where freq = $1;";
            $result = pg_query_params($link, $query, array(sql_escape_string($freq)));
            if (!$result) {
                printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
            printf ("{\"result\" : 1, \"error\": \"\"}");
        }
        else
            printf ("{\"result\" : 0, \"error\": \"Frequency does not exist\"}");
    }
    else
       printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");

    sql_close($link);

?>
