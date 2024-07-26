<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2023 Jeff Deaton (N6BA)
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

    header("X-Accel-Buffering: no"); // disable ngnix webServer buffering
    header("Content-Type: text/event-stream");
    header("Cache-Control: no-cache");

    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];

    include $documentroot . '/common/functions.php';


    /*********************
     * Function to send an SSE message to the browser
     *********************/
    function sendSSE($event, $id, $data) {

        // send the event to the browser
        if ($event && $id && $data) {
            // Send the SSE event to the browser
            echo "event: $event\n";
            echo "id: $id\n";
            echo "data: " . $data . "\n\n";
        }

        // flush any output to the browser
        flush(); 
    }

    /*********************
     * Function to send an SSE heartbeat/keepalive message to the browser
     *********************/
    function sendSSEHeartbeat() {
        echo "data: keepalive\n\n";
        flush();
    }

    /*********************
     * Function to get the GPS status from the gpsstatus.json file
     * Unlike a position update from the database, this contains satellite, device path, and other status elements.
     *********************/
    function getGPSStatus() {
        global $documentroot;
        $defaultstatus = array("status" => "no device",  "devicepath" => "", "speed_mph" => 0.0,  "mode" => 0, "lat" => "NaN", "altitude" => "NaN", "lon" => "NaN", "utc_time" => "", "satellites" => array());
        $cmdoutput = file_get_contents($documentroot . "/gpsstatus.json");
        if ($cmdoutput == null) {
            return $defaultstatus;
        }
        return json_decode($cmdoutput, true);
    }



    /**************************************************
    **************************************************
    * Main body below
    **************************************************
    **************************************************/


    // Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    // start listening for postgresql NOTIFY events
    pg_query($link, "LISTEN new_packet; LISTEN new_position;");

    // close PHP output buffering.  We do this so SSE events aren't "queued" up to the browser - we get an event, we send an event.  ;)
    ob_end_flush();  

    // counter to increment upon each result sent to the browser
    $inc = 0;

    // sleep counter.  If this gets large (ex > 15), then send out a 'blank' update to the browsers
    $sleepcounter = 0;

    // how long we wait (approximately in seconds) before sending a heartbeat packet to the browser
    $threshold = 5;

    while (!connection_aborted()) {

        // The result from our postgresql LISTEN command.
        $result = pg_get_notify($link);

        // check if we got anything back from the postgresql database
        if ($result) { 

            // the event we've listened to
            $event = $result["message"];

            // the data
            $payload = $result["payload"];

            // For GPS position change events, also grab the local gpsstatus.json file and merge the contents of that into the payload.
            if ($event == "new_position") {

                // get the current GPS status
                $gps = getGPSStatus();

                // only if we were able to get the contents of the GPS status file
                if ($gps) {

                    // convert the GPS position change payload to an object
                    $json = json_decode($payload, true);

                    // Update with select elements from the GPS status file
                    $json["properties"]["gps"] = array(
                        "satellites" => $gps["satellites"],
                        "devicepath" => $gps["devicepath"],
                        "mode" => $gps["mode"],
                        "status" => $gps["status"]
                    );

                    // convert back to JSON text
                    $payload = json_encode($json);
                }
            }

            // Send this message to the browser
            sendSSE($event, $inc, $payload);

            // Increment our counter
            $inc++;

            // zero out the sleep counter
            $sleepcounter = 0;
        }
        else if ($sleepcounter > $threshold) {

            // send a heartbeat message to the browser
            sendSSEHeartbeat();

            // zero out the sleep counter
            $sleepcounter = 0;
        }
        else {

            // sleep for a small amount of seconds
            sleep(1);

            // increment the sleep counter
            $sleepcounter++;
        }
    }

    // done.

?>
