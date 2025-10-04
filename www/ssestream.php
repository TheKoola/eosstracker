<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2025 Jeff Deaton (N0JD)
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

    // Global that contains the location of the server root directory.
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];

    // Grab some functions
    include_once $documentroot . '/common/functions.php';

    // include the event source objects
    include_once $documentroot . '/eventsources.php';




    /*********************
     * Function to send an SSE message to the browser
     *********************/
    function sendSSE($id, $seq, $data) {

        // send the event to the browser
        if ($id && $seq >= 0 && $data) {
            // Send the SSE event to the browser
            printf("event: %s\n", $id);
            printf("id: %d\n", $seq);
            printf("data: %s\n\n", $data);

            // flush any output to the browser
            flush(); 
        }
    }

    /*********************
     * Function to send an SSE message to the browser
     *********************/
    function sendSSEText($text) {

        if ($text) {
            // send the event to the browser
            printf("%s", $text);

            // flush output to the browser
            flush(); 
        }
    }


    /*********************
     * Function to send an SSE heartbeat/keepalive message to the browser
     *********************/
    function sendSSEHeartbeat() {
        printf("data: keepalive\n\n");
        flush();
    }


    /************
     * getRequestedEvents
     *
     * Returns an array with the various event source objects that the end user's browser is requesting.
     ***********/
    function getRequestedEvents() {
        global $documentroot;

        // what does the browser want to receive SSE events for?  By default only configuration update events are sent.
        $events = Array();

        // GPS Status
        $get_gpsstatus = "";
        if (isset($_GET["gpsstatus"])) {
            $get_gpsstatus = strtoupper(check_string($_GET["gpsstatus"], 20));
            if ($get_gpsstatus == "TRUE")
                $events[] = new GPSEvent();
        }

        // New APRS packets
        $get_packets = "";
        if (isset($_GET["packets"])) {
            $get_packets = strtoupper(check_string($_GET["packets"], 20));
            if ($get_packets == "TRUE")
                $events[] = new PacketEvent();
        }

        // tracker updates
        $get_trackers = "";
        if (isset($_GET["trackers"])) {
            $get_trackers = strtoupper(check_string($_GET["trackers"], 20));
            if ($get_trackers == "TRUE")
                $events[] = new TrackerEvent();
        }

        // Backend status
        $get_backendstatus = "";
        if (isset($_GET["backendstatus"])) {
            $get_backendstatus = strtoupper(check_string($_GET["backendstatus"], 20));
            if ($get_backendstatus == "TRUE")
                $events[] = new StatusEvent();
        }

        // Application telemetry
        $get_apptelemetry = "";
        if (isset($_GET["apptelemetry"])) {
            $get_apptelemetry = strtoupper(check_string($_GET["apptelemetry"], 20));
            if ($get_apptelemetry == "TRUE")
                $events[] = new AppStatusEvent();
        }


        // Backend logging updates
        $get_mainlog = "";
        if (isset($_GET["mainlog"])) {
            $get_mainlog = strtoupper(check_string($_GET["mainlog"], 20));
            if ($get_mainlog == "TRUE") 
                $events[] = new LogEvent("mainlog", $documentroot . "/logs/start_session.log");
        }

        // stderr outupt
        $get_stderr = "";
        if (isset($_GET["stderr"])) {
            $get_stderr = strtoupper(check_string($_GET["stderr"], 20));
            if ($get_stderr == "TRUE") 
                $events[] = new LogEvent("stderr", $documentroot . "/logs/start_session.log.stderr");
        }

        // Backend logging updates
        $get_direwolflog = "";
        if (isset($_GET["direwolflog"])) {
            $get_direwolflog = strtoupper(check_string($_GET["direwolflog"], 20));
            if ($get_direwolflog == "TRUE") 
                $events[] = new LogEvent("direwolflog", $documentroot . "/logs/direwolf.out");
        }

        // Backend configuration updates
        $get_configuration = "";
        if (isset($_GET["configuration"])) {
            $get_configuration = strtoupper(check_string($_GET["configuration"], 20));
            if ($get_configuration == "TRUE")
                $events[] = new ConfigEvent();
        }

        return $events;
    }



    /**************************************************
    **************************************************
    * Main body below
    **************************************************
    **************************************************/

    // determine which events we're supposed to report on
    $events = getRequestedEvents();

    // stop flushing
    ob_end_flush();

    // sleep counter.  If this gets large (ex > 15), then send out a 'blank' update to the browsers
    $sleepcounter = 0;

    // how long we wait (approximately in seconds) before sending a heartbeat packet to the browser
    $threshold = 15;

    // loop through the events we're supposed to track setting the threshold interval
    foreach ($events as $e) {
        $e->setThreshold($threshold);
    }

    // send a heartbeat message to the browser, initially.
    sendSSEHeartbeat();

    while (!connection_aborted()) {

        // loop through each event, checking if there's anything to send to the browser
        $eventcount = 0;
        foreach ($events as $e) {

            // ask this event to generate an SSE event.  Should return null if nothing to send
            $ssetext = $e->generateSSEText();

            // if there is text to send
            if ($ssetext) {

                // Send this message to the browser and increment our counter
                sendSSEText($ssetext);

                // increment our event counter.  Let's us know if we've sent anything to the browser when the foreach loop is done.
                $eventcount++;
            }
        }

        // did we send anything to the browser?
        if ($eventcount > 0) {

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
            usleep(0.5 * 1000000);

            // increment the sleep counter
            $sleepcounter++;
        }
    }

    // the browser connection was broken so close all events
    foreach ($events as $e) {
        $e->close();
    }

    // done.

?>
