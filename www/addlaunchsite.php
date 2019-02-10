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


    if (isset($_GET["launchsite"])) {
        $get_launchsite = $_GET["launchsite"];
    }
    else {
        $get_launchsite = "";
    }

    $get_lat = "";
    if (isset($_GET["lat"])) {
	if (Is_Numeric($_GET["lat"]))
            $get_lat = $_GET["lat"];
    }
    
    $get_lon = "";
    if (isset($_GET["lon"])) {
	if (Is_Numeric($_GET["lon"]))
            $get_lon = $_GET["lon"];
    }

    $get_alt = "";
    if (isset($_GET["alt"])) {
	if (Is_Numeric($_GET["alt"]))
            $get_alt = $_GET["alt"];
    }

    ## if any of the GET parameters are not supplied, then exit...
    if ($get_launchsite == "" || $get_lat == "" || $get_lon == "" || $get_alt == "") {
        printf ("{\"result\" : 0, \"error\": \"HTML form error: invalid value\"}");
        return 0;
    }

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $query = "insert into launchsites values ($1, $2, $3, $4);";
    $result = pg_query_params($link, $query, array(sql_escape_string($get_launchsite), $get_lat, $get_lon, $get_alt));
    if (!$result) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }
    
    // If we've made it this far then sucess!!
    printf ("{\"result\" : 1, \"error\": \"\"}");

    sql_close($link);

?>
