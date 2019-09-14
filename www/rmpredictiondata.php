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
include_once $documentroot . '/common/functions.php';



    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    $formerror = false;

    // Check the flightid HTML GET variable
    $flightid = "";
    if (isset($_GET["flightid"])) {
        if (($flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    // Check the thedate HTML GET variable
    $thedate = "";
    if (isset($_GET["thedate"])) { 
        if (($thedate = check_date($_GET["thedate"])) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    // Check the launchsite HTML GET variable
    $launchsite = "";
    if (isset($_GET["launchsite"])) {
        if (($launchsite = check_string($_GET["launchsite"], 64)) == "")
            $formerror = true;
    }
    else
        $formerror = true;
 

    if ($formerror == false) {
        #$query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = '" . sql_escape_string($flightid) . "' and launchsite = '" . sql_escape_string($launchsite) . "' and thedate = '" . sql_escape_string($thedate) . "'";
        $query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3;";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform deletes
            ##$query = "delete from predictiondata where flightid = '" . sql_escape_string($flightid) . "' and launchsite = '" . sql_escape_string($launchsite) . "' and thedate = '" . sql_escape_string($thedate) . "'";
            $query = "delete from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3;";
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                //printf ("<br><br>SQL=%s\n", $query);
                return 0;
            }
        }
    }
    printf ("[]");

?>
