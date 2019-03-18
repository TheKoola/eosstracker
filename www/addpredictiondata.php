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
        printf("{\"result\": \"1\", \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

try {
    
    // Undefined | Multiple Files | $_FILES Corruption Attack
    // If this request falls under any of them, treat it invalid.
    if (
        !isset($_FILES['file']['error']) ||
        is_array($_FILES['file']['error'])
    ) {
        throw new RuntimeException('Invalid parameters.');
    }

    // Check $_FILES['file']['error'] value.
    switch ($_FILES['file']['error']) {
        case UPLOAD_ERR_OK:
            break;
        case UPLOAD_ERR_NO_FILE:
            throw new RuntimeException('No file sent.');
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE:
            throw new RuntimeException('Exceeded filesize limit.');
        default:
            throw new RuntimeException('Unknown errors.');
    }

    // You should also check filesize here. 
    if ($_FILES['file']['size'] > 1000000) {
        throw new RuntimeException('Exceeded filesize limit.');
    }
    if ($_FILES['file']['size'] <= 0) {
        throw new RuntimeException('File has zero size.');
    }

    // DO NOT TRUST $_FILES['file']['mime'] VALUE !!
    // Check MIME Type by yourself.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if (false === $ext = array_search(
        $finfo->file($_FILES['file']['tmp_name']),
        array(
            'txt' => 'text/plain'
        ),
        true
    )) {
        throw new RuntimeException('Invalid file format.');
    }

    // You should name it uniquely.
    // DO NOT USE $_FILES['file']['name'] WITHOUT ANY VALIDATION !!
    // On this example, obtain safe unique name from its binary data.
/*    if (!move_uploaded_file(
        $_FILES['file']['tmp_name'],
        sprintf('/tmp/%s.%s',
            sha1_file($_FILES['file']['tmp_name']),
            $ext
        )
    )) {
        throw new RuntimeException('Failed to move uploaded file.');
    }
 */


} catch (RuntimeException $e) {
    printf("{\"result\": 1, \"error\": \"%s\"}", $e->getMessage());
    exit;
}

    $formerror = false;
    if (isset($_POST["flightid"])) 
        $flightid = strtoupper($_POST["flightid"]);
    else
        $formerror = true;
    if (isset($_POST["thedate"]))
        $thedate = $_POST["thedate"];
    else
        $formerror = true;
    if (isset($_POST["launchsite"]))
        $launchsite = $_POST["launchsite"];
    else
        $formerror = true;

    if ($thedate == "" || $flightid == "" || $launchsite == "")
        $formerror = true;


    if ($formerror == false) {
        $query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
        if (!$result) {
            printf("{\"result\": \"1\", \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            printf("{\"result\" : \"1\", \"error\": \"Record already exists.\"}");
        }
        else {

           $content = file($_FILES['file']['tmp_name']);
           $l = sizeof($content);
           $latitude_prev = 0;
           $longitude_prev = 0;
           $altitude_prev = 0;
  
           // Check the length of the content we just got back
           if ($l) {

               // make sure the first line has the column labels we're looking for
               $okay = preg_match("/^[ \t]*date\/time[ \t]*P[ \t]*elap grid[ \t]*htMSL[ \t]*pres[ \t]*dirspd[ \t]*lat[ \t]*lon[ \t]*file[ \t]*dist.*/", $content[0]);
               if ($okay) {
                   $i = 0;

                   // Now loop through each line of the file
                   foreach($content as $line) {
                       // if this line starts with 12 columns, then continue...
                       $p = preg_match("/^[0-9]{8}[ \t]*[0-9]{4}[ \t]*[A-Z]{1}[ \t]*[0-9]{1,3}[ \t]*[0-9A-Z]{5}[ \t]*[0-9]{1,6}[ \t]*[0-9]{1,4}[ \t]*[0-9]{1,6}[ \t]*[0-9\.]{1,10}[ \t]*[0-9\,\-]{1,10}[ \t]*[0-9]{1,15}[ \t]*[0-9\.]{1,8}[ \t]/", $line);
                       if ($p) {
                           // Split the line into an array using whitespace as the delimiter
                           $line_data = preg_split('/\s+/', $line);
 
                           // Format the time as HH:MM
                           $thetime = substr($line_data[1], 0, 2) . ":" . substr($line_data[1], 2, 2);

                           // grab the altitude, lat, and lon
                           $altitude = $line_data[5];
                           $latitude = $line_data[8];
                           $longitude = $line_data[9];
                             
                           // calculate rates
                           $altrate = ($line_data[5] - $altitude_prev) / 60;
                           $latrate = ($line_data[8] - $latitude_prev) / 60;
                           $longrate = ($line_data[9] - $longitude_prev) / 60;

                           if ($i > 0) {
                               // the database insert statement
                               $insertstmt = "insert into predictiondata values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);";

                               // Execute the database statement
                               $result = pg_query_params($link, $insertstmt, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate), sql_escape_string($thetime), round($altitude, 6), round($latitude, 8), round($longitude, 8), round($altrate, 8), round($latrate, 8), round($longrate, 8)));
   
                               // check for errors in the database operation
                               if (!$result) {
                                   printf("{\"result\": 0, \"error\": %s}", json_encode(sql_last_error()));
                                   sql_close($link);
                                   return 0;
                               }
                           }
           
                           // set previous values for the next iteration of this loop
                           $altitude_prev = $altitude;
                           $latitude_prev= $latitude;
                           $longitude_prev = $longitude;
        
                           // loop counter
                           $i++;
                       }
                   }
                   printf("{\"result\": 0, \"error\": \"\"}");
               }
               else
                   printf("{\"result\": 1, \"error\": \"Incorrect format.  Not the RAW prediction file.\"}");
               
           }
           else
               printf("{\"result\": 1, \"error\": \"File empty.  No data to upload..\"}");
        }
    }
    else
        printf("{\"result\": 1, \"error\": \"HTML Form error.\"}");

?>
