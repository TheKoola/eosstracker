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
include_once $documentroot . "/common/database.php";

function db_error($string) {
    printf ("<p class=\"normal-black\">We're sorry, but an error has occured.  Please retry your request.<br>Error: %s</p>\n", $string);
}


// This checks that the string is made up of only alpha chars and is <= some length limit.  If successful it returns the string, otherwise it returns a null string.
function check_string($string, $string_length) {
    if (preg_match("#^[a-zA-Z0-9.(), _-]+$#", htmlspecialchars_decode($string)) && strlen(htmlspecialchars_decode($string)) <= $string_length)
        return htmlspecialchars_decode($string);
    else
        return "";
}


// This checks if a value is a number and that it is within certain range limits.  Returns 1 if true, or 0 if false.
function check_number($var, $lower_limit, $upper_limit) {
    if (is_numeric($var)) {
        $v = floatval($var);
        if ($v >= $lower_limit && $v <= $upper_limit)
            return 1;
        else
            return 0;
    }
    else
        return 0;
}


// This checks if a value a date format (ex. YYYY-MM-DD, DD/MM/YYYY, etc.).
function check_date($d) {
    $v = date_create(htmlspecialchars_decode($d));
    if ($v) {
        $year = date_format($v, 'Y');
        $month = date_format($v, 'm');
        $day = date_format($v, 'd');
        $thedate = date_format($v, 'Y-m-d');
        if (checkdate($month, $day, $year)) 
            return $thedate;
        else
            return "";
    }
    else
        return "";
}


// This checks if a value a datetime format (ex. YYYY-MM-DD hh:mm:ss, DD/MM/YYYY hh:mm:ss, etc.)
function check_datetime($d) {
    $v = date_create(htmlspecialchars_decode($d));
    if ($v) {
        $year = date_format($v, 'Y');
        $month = date_format($v, 'm');
        $day = date_format($v, 'd');
        $thedate = date_format($v, 'Y-m-d H:i:s');
        if (checkdate($month, $day, $year)) 
            return $thedate;
        else
            return "";
    }
    else
        return "";
}

?>
