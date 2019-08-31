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


    // Check the launchsite HTML GET variable
    if (isset($_GET["launchsite"])) {
        $get_launchsite = check_string($_GET["launchsite"], 64);
    }
    else
        $get_launchsite = "";


    // Check the lat HTML GET variable.  This is the latitude so it should be between -90 and +90.
    $get_lat = "";
    if (isset($_GET["lat"])) 
        if (check_number($_GET["lat"], -90, 90))
            $get_lat = floatval($_GET["lat"]);

    // Check the lon HTML GET variable.  This is the longitude so it should be between -180 and +180.
    $get_lon = "";
    if (isset($_GET["lon"])) 
        if (check_number($_GET["lon"], -180, 180))
            $get_lon = floatval($_GET["lon"]);

    // Check the alt HTML GET variable.  The elevation of a launch site "should" be between -300ft (aka death valley) and 15k feet.
    $get_alt = "";
    if (isset($_GET["alt"])) 
        if (check_number($_GET["alt"], -300, 15000))
            $get_alt = intval($_GET["alt"]);


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
