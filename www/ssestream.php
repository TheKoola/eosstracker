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

    // Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ##################
    # function to send an event to the client
    ##################
    function sendtoclient($ev, $id, $data) {

        // echo this SSE event to the browser session
        echo "event: " . $ev . "\n";
        if ($id)
            echo "id: " . $id . "\n";
        echo "data: " . $data . "\n\n";

        // flush any output to the browser
        flush(); 
    }


    ################################
    # Main code
    ################################

    // start listening for postgresql NOTIFY events
    pg_query($link, "LISTEN new_packet; LISTEN new_position;");

    // close PHP output buffering.  We do this so SSE events aren't "queued" up to the browser - we get an event, we send an event.  ;)
    ob_end_flush();  

    // counter to increment upon each result sent to the browser
    $inc = 0;

    // keepalive threshold in secs
    $keepalive_threshold = 20;

    // current timestamp (secs since epoch)
    $last = time();

    // Loop until the client aborts the connection (ex. closed the page)
    while (!connection_aborted()) {

        // The result from our postgresql LISTEN command.
        $result = pg_get_notify($link);

        // check if we got anything back from the postgresql database
        if ($result) { 

            // the event we've listened to
            $event = $result["message"];

            // the data
            $payload = $result["payload"];

            // Send the SSE event to the browser
            sendtoclient($event, $inc, $payload);

            // Increment our counter
            $inc++;

            // update the timestamp
            $last = time();
        }
        else {
            // check how long it's been since we sent anything to the client
            $delta = time() - $last;
            if ($delta > $keepalive_threshold) {

                // if it's been too long, then send a 'keepalive' event to the client
                sendtoclient("keepalive", Null, "keepalive");

                // update the timestamp
                $last = time();
            }

            // wait this long before checking for any incoming packets
            sleep(1); 
        }
    }

    // done.

?>
