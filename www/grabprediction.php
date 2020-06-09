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


header("Content-Type:  application/json;");
session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';

// Get this brick's configuration
$config = readconfiguration();


/*********************
 *
 * Function to parse HTML content and return an array of the link targets.
 *
 *********************/
function getHrefs($source) {
    $links = [];
    $content = file_get_contents($source);
    $content = strip_tags($content, "<a>");
    $subString = preg_split("/<\/a>/", $content);
    foreach ($subString as $val) {
        if (stripos($val, "href=") !== false) {
            $val = preg_replace("/.*href=\"/sm", "", $val);
            $val = preg_replace("/\".*/", "", $val);
            $val = trim($val);
            if (stristr($val, "_raw.txt") !== false) {
                $links[] = $val;
            }
        }
    }
    return $links;
}


/*********************
 *
 * Function for adding a predict file to the database.  
 *
 *********************/
function getPredictFile($dbconn, $fid, $lsite, $url) {
    global $config;

    // Set the default timezone
    date_default_timezone_set($config["timezone"]);

    // Get the current date
    $thedate = date('Y-m-d');

    // Check if this prediction data already exists...delete it if it does, as we'll replace it with the predict file data
    $query = "delete from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3;";
    $result = pg_query_params($dbconn, $query, array(sql_escape_string($fid), sql_escape_string($lsite), sql_escape_string($thedate)));
    if (!$result) {
        return array("result" => 1, "error" => sql_last_error(), "flightid" => $fid);
    }

    // Get the location and elevation of the launchsite.  We need this for "adjusting" the prediction data from the RAW predict file
    $query = "select distinct launchsite, lat, lon, alt from launchsites where launchsite = $1;";
    $result = pg_query_params($dbconn, $query, array(sql_escape_string($lsite)));
    if (!$result) {
        return array("result" => 1, "error" => sql_last_error(), "flightid" => $fid);
    }

    // Number of rows returned
    $numrows_launchsite = sql_num_rows($result);

    // All of the launchsite rows
    $launchsite_rows = sql_fetch_all($result);

    // The the coords and elevation at the launchsite
    $thelaunchsite["lat"] = $launchsite_rows[0]["lat"];
    $thelaunchsite["lon"] = $launchsite_rows[0]["lon"];
    $thelaunchsite["alt"] = $launchsite_rows[0]["alt"];

    // Fetch the predict file.  
    $content = file($url);

    // number of bytes returned
    $l = sizeof($content);

    // initial state variables used to compute lat, lon, and vertical change rates
    $latitude_prev = 0;
    $longitude_prev = 0;
    $altitude_prev = 0;

    // Only want to proceed if the predict file actually contained some data (i.e. the size is > 0).
    if ($l) {

        // We only want to proceed if the first line of the predict file has the column labels we're looking for.
        // Files should start with this line of text:
        //     date/time P   elap grid   htMSL  pres dirspd     lat      lon       file      dist
        $okay = preg_match("/^[ \t]*date\/time[ \t]*P[ \t]*elap grid[ \t]*htMSL[ \t]*pres[ \t]*dirspd[ \t]*lat[ \t]*lon[ \t]*file[ \t]*dist.*/", $content[0]);
        if ($okay) {
            $i = 0;

            // Now loop through each line of the file
            foreach($content as $line) {

                // if this line starts with 12 columns, then continue...sanity check...
                $p = preg_match("/^[0-9]{8}[ \t]*[0-9]{4}[ \t]*[A-Z]{1}[ \t]*[0-9]{1,4}[ \t]*[0-9A-Z]{1,6}[ \t]*[0-9]{1,6}[ \t]*[0-9]{1,4}[ \t]*[0-9]{1,6}[ \t]*[0-9\.]{1,10}[ \t]*[0-9\,\-]{1,10}[ \t]*[0-9]{1,15}[ \t]*[0-9\.]{1,8}[ \t]/", $line);
                if ($p) {

                    // Split the line into an array using whitespace as the delimiter
                    $line_data = preg_split('/\s+/', $line);

                    // Format the time as HH:MM
                    $thetime = substr($line_data[1], 0, 2) . ":" . substr($line_data[1], 2, 2);

                    // grab the altitude, lat, and lon
                    $altitude = $line_data[5];
                    $latitude = $line_data[8];
                    $longitude = $line_data[9];
                      
                    // calculate change rates for lat, lon, and vertical
                    $altrate = ($line_data[5] - $altitude_prev) / 60;
                    $latrate = ($line_data[8] - $latitude_prev) / 60;
                    $longrate = ($line_data[9] - $longitude_prev) / 60;

                    // We only want to add those rows from the predict file that are equal to or greater than the launchsite elevation.  This trims off any extra rows we don't need.
                    // Notes:
                    //     This is obviously a compromise as the landing area elevation could be higher or lower than this, but we have to remember that this 
                    //     data is only used for pre-flight predictions and could be up to 24hrs old.  Okay, right, this data is also displayed (on the map) during an active 
                    //     flight prior to the flight descending, BUT the point is, the user will use this to give them an idea as "where to go", not for more 
                    //     precise landing predictions.  Think:  horseshoes and hand grenades.
                    if ($altitude > $thelaunchsite["alt"] || $i >= 0) {

                        // if $i == 0, then this is the first line of the predict file.
                        if ($i == 0) {
                            // This is the first line of text, so we add the first row, but using the original launchsite location for calculating rates...
                            // calculate rates
                            $altrate = ($line_data[5] - $thelaunchsite["alt"]) / 60;
                            $latrate = ($line_data[8] - $thelaunchsite["lat"]) / 60;
                            $longrate = ($line_data[9] - $thelaunchsite["lon"]) / 60;

                            // the database insert statement
                            $insertstmt = "insert into predictiondata (flightid, launchsite, thedate, thetime, altitude, latitude, longitude, altrate, latrate, longrate) 
                                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);";

                            // Execute the database statement
                            $result = pg_query_params($dbconn, $insertstmt, array(
                                sql_escape_string($fid), 
                                sql_escape_string($lsite), 
                                sql_escape_string($thedate), 
                                sql_escape_string($thetime), 
                                round($altitude, 6), 
                                round($latitude, 8), 
                                round($longitude, 8), 
                                round($altrate, 8), 
                                round($latrate, 8), 
                                round($longrate, 8)
                            ));

                            // check for errors in the database operation
                            if (!$result) {
                                return array("result" => 1, "error" => sql_last_error(), "flightid" => $fid);
                            }
                        }

                        // All subsequent lines land here...
                        else {
                            // the database insert statement
                            $insertstmt = "insert into predictiondata (flightid, launchsite, thedate, thetime, altitude, latitude, longitude, altrate, latrate, longrate) 
                                values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);";

                            // Execute the database statement
                            $result = pg_query_params($dbconn, $insertstmt, array(
                                sql_escape_string($fid), 
                                sql_escape_string($lsite), 
                                sql_escape_string($thedate), 
                                sql_escape_string($thetime), 
                                round($altitude, 6), 
                                round($latitude, 8), 
                                round($longitude, 8), 
                                round($altrate, 8), 
                                round($latrate, 8), 
                                round($longrate, 8)
                            ));

                            // check for errors in the database operation
                            if (!$result) {
                                return array("result" => 1, "error" => sql_last_error(), "flightid" => $fid);
                            }
                        }
    
                        // set previous values for the next iteration of this loop
                        $altitude_prev = $altitude;
                        $latitude_prev= $latitude;
                        $longitude_prev = $longitude;
     
                        // loop counter
                        $i++;

                    } // if ($altitude > $thelaunchsite["alt"] || $i >= 0) {

                } // if ($p) {

            } // foreach($content as $line) {

            // Success
            return array("result" => 0, "error" => "", "flightid" => $fid);

        } // if ($okay) {
        else
            return array("result" => 1, "error" => "Incorrect format.  Not the RAW prediction file.", "flightid" => $fid);
            

    } // if ($l) {
    else
        return array("result" => 1, "error" => "File empty.  No data to upload.", "flightid" => $fid);

 } // end of function:  getPredictFile


/*********************************** main code *********************************/

    // Connect to the database  
    $link = connect_to_database();
    if (!$link) {
        printf("[{\"result\": \"1\", \"error\": \"%s\", \"flightid\" : \"Error\"}]", json_encode(sql_last_error()));
        return 0;
    }

    // Get the list of active flights
    $query = "select distinct flightid, launchsite from flights where active = 'y'";
    $result = pg_query($link, $query);

    // If this failed, then we have to exit.
    if (!$result) {
        printf("[{\"result\": \"1\", \"error\": \"%s\", \"flightid\" : \"Error\"}]", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }

    // The number of rows returned
    $numrows = sql_num_rows($result);

    // If the number of rows was 0, then there aren't any active flights.
    if ($numrows == 0) {
        printf("[{\"result\": \"1\", \"error\": \"No flights are active\", \"flightid\" : \"Error\"}]");
        sql_close($link);
        return 0;
    }

    // Get the list of RAW predict files from the prediciton page
    $hrefs = getHrefs("https://www.eoss.org/predict");

    // An array for translating the launchs site location names to the abbreviations used with the RAW predict filename
    $sites = [
        "Crow Valley" => "bgdco", 
        "Deer Trail" => "dtrco", 
        "Eaton" => "eatco", 
        "Genoa" => "grvco",
        "Wiggins" => "iggco",
        "Limon" => "licco",
        "Windsor" => "wsrco"
    ];

    printf ("[");

    // Loop through each active flight returned
    $firsttime = 1;
    while ($row = sql_fetch_array($result)) {

        if (!$firsttime) 
            printf(", ");
        $firsttime = 0;

        // The flight and launchsite for this flight
        $flightid = $row["flightid"];
        $launchsite = $row["launchsite"];

        // The flight suffix.  For example:  283, 299, etc.
        $flight_suffix = explode("-", $flightid)[1];

        // Defaults for some state variables
        $predict_url = "";
        $exists = false;
        $ret = array("result" => 1, "error" => "Unable to download prediction file for '" . $launchsite . "'.", "flightid" => $flightid);

        // We only proceed if the launchsite was in our translation list.  If it's not, then the launchsite is likely a custom name the user added...and we don't want to process that.
        if (array_key_exists($launchsite, $sites)) {
                
            // Expression to match a filename
            $p = "/e" . preg_quote($flight_suffix) . "_.*_" . preg_quote($sites[$launchsite]) . "_raw\.txt/";

            // Find the correct predict file for our launch site in the list of predict files
            foreach ($hrefs as $filename) {
                //printf ("filename:%s, p:%s, preg_match: %d\n", $filename, $p, preg_match($p, $filename));
                
                if (preg_match($p, $filename)) {

                    // found a matching predict file, so break out of the "foreach..." loop.
                    $predict_url = "https://www.eoss.org/predict/" . $filename;
                    break;
                }
            }

            // If the predict_url contains a filename, then we found a match in the "foreach..." loop above.
            if ($predict_url != "") {

                // Get HTML headers by trying to load the URL 
                $file_headers = get_headers($predict_url, 0);

                // Check if the predict file exists or not
                if(!empty($file_headers) && stristr($file_headers[0], "404 Not Found") === false) {
                    $exists = true;

                    // Call the getPredictFile function which will add this predict file to the database
                    $ret = getPredictFile($link, $flightid, $launchsite, $predict_url);
                }
                else   
                    // We couldn't download this predict file (eg. maybe this system isn't connected to the Internet or the eoss.org site is down).
                    $exists = false;
            }
        }
        else {
            $ret["error"] = "Prediction file unavailable for non-standard launch site '" . $launchsite . "'.";
        }

        printf("%s", json_encode($ret));
    }

    printf ("]");

    sql_close($link);
    return 0;

?>


