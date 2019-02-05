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


/* This script allows one to load a RAW prediction file from EOSS manually */

include_once '../common/database.php';
include_once '../common/sessionvariables.php';

    if (count($argv) < 5) {
        printf ("usage:  %s <flightid> <launchsite> <thedate> <raw pred file path>\n", $argv[0]);
        return 1;
    }

    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }
 
    $flightid = $argv[1];
    $launchsite = $argv[2];
    $thedate = $argv[3];
    $url = $argv[4];

    $formerror = false;

    if ($formerror == false) {
//        $query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = '" . sql_escape_string($flightid) . "' and launchsite = '" . sql_escape_string($launchsite) . "' and thedate = '" . sql_escape_string($thedate) . "';";
        $query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            header("Location: setup.php");
        }
        else {
            // insert a new row into the flights table

           $content = file($url);
           $length = sizeof($content);
           $i = 0;
           foreach($content as $line) {
               $line_data = preg_split('/\s+/', $line);
               $thetime = substr($line_data[1], 0, 2) . ":" . substr($line_data[1], 2, 2);
               $altitude = $line_data[5];
               $latitude = $line_data[8];
               $longitude = $line_data[9];
                 
               if ($i > 4 && $i < ($length - 5)) {
                   $altrate = ($line_data[5] - $altitude_prev) / 60;
                   $latrate = ($line_data[8] - $latitude_prev) / 60;
                   $longrate = ($line_data[9] - $longitude_prev) / 60;
                   //$insertstmt = "insert into predictiondata values ('" . sql_escape_string($flightid) . "', '" . sql_escape_string($launchsite) . "', " . sql_escape_string($thedate) . "', '" . sql_escape_string($thetime) . "', " . round($altitude, 6) . ", " . round($latitude, 6) . ", " . round($longitude, 6) . ", " . round($altrate, 8) . ", " . round($latrate, 8) . ", " . round($longrate, 8) . ");";
                   $insertstmt = "insert into predictiondata values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);";
                   //print_r($line_data);
                   //printf ("<br>%s<br>\n", $insertstmt);
                   $result = pg_query_params($link, $insertstmt, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate), sql_escape_string($thetime), round($altitude, 6), round($latitude, 8), round($longitude, 8), round($altrate, 8), round($latrate, 8), round($longrate, 8)));
                   if (!$result) {
                       db_error(sql_last_error());
                       sql_close($link);
                       return 0;
                   }
               }

               $altitude_prev = $altitude;
               $latitude_prev= $latitude;
               $longitude_prev = $longitude;

               $i++;
           }
        }
    }

?>
