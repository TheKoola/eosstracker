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


/* Import the database functions */
$documentroot = $_SERVER["DOCUMENT_ROOT"];
//include_once $documentroot . "database.php";
include_once $documentroot . "/common/database.php";

/* Set the timezone */
putenv("TZ=America/Denver");


function db_error($string) {
    printf ("<p class=\"normal-black\">We're sorry, but an error has occured.  Please retry your request.<br>Error: %s</p>\n", $string);
}


function get_time_byTZ($gmt_plus=0) {
    $sec_diff=date('Z')-($gmt_plus*3600);
    if ($gmt_plus>=0) $gmt_plus='+'.$gmt_plus;
    $time=strtotime($sec_diff=(($sec_diff<=0)?'+':'-').abs($sec_diff).' seconds');
    return $time;
}


function getipaddr () {
    if (getenv("HTTP_CLIENT_IP") && strcasecmp(getenv("HTTP_CLIENT_IP"), "unknown"))
        $ip = getenv("HTTP_CLIENT_IP");
     else if (getenv("HTTP_X_FORWARDED_FOR") && strcasecmp(getenv("HTTP_X_FORWARDED_FOR"), "unknown"))
        $ip = getenv("HTTP_X_FORWARDED_FOR");
     else if (getenv("REMOTE_ADDR") && strcasecmp(getenv("REMOTE_ADDR"), "unknown"))
        $ip = getenv("REMOTE_ADDR");
     else if (isset($_SERVER['REMOTE_ADDR']) && $_SERVER['REMOTE_ADDR'] && strcasecmp($_SERVER['REMOTE_ADDR'], "unknown"))
        $ip = $_SERVER['REMOTE_ADDR'];
     else
        $ip = "unknown";

    return $ip;
}

?>
