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

    // Global that contains the location of the server root directory.
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];

    // Grab some functions
    include $documentroot . '/common/functions.php';

    // global that contains the user specified configuration for this backend system
    $config = readconfiguration();

    /*********************
     * Function to send an SSE message to the browser
     *********************/
    function sendSSE($event, $id, $data) {

        // send the event to the browser
        if ($event && $id >= 0 && $data) {
            // Send the SSE event to the browser
            printf("event: %s\n", $event);
            printf("id: %d\n", $id);
            printf("data: %s\n\n", $data);

            // flush any output to the browser
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



    /*********************
     * Check for the existance of a "microsecs" property within geojson and return its value
     *********************/
    function getMicroSecs($js) {

        if (!$js)
            return null;

        // check if there was a microsecs value within the GeoJson data provided
        $microsecs = 0;
        if (property_exists($js, "properties")) {
            $properties = $js->properties;
            if (property_exists($properties, "microsecs")) {
                $microsecs = $properties->microsecs;
                if ($microsecs < 0)
                    $microsecs = 0;
            }
        }

        return $microsecs;
    }

    /*********************
     * Set the Properties->gpssource value for the GPS geojson structure
     *********************/
    function setSourceText($geojsonObj, $text) {

        // check if the properties key exists
        if (property_exists($geojsonObj, "properties")) {

            // set (or create) the gpssource key and set its value to the text provided.
            $geojsonObj->properties->gpssource = $text;
        }
        else {

            // the properties key didn't exist, so we need to create it.
            $geojsonObj->properties = new stdClass();
            $geojsonObj->properties->gpssource = $text;
        }

        return $geojsonObj;
    }


    /*********************
     * Function to get the GPS status from the gpsstatus.json file
     * Unlike a position update from the database, this contains satellite, device path, and other status elements.
     *********************/
    function getGPSFileStatus() {
        global $documentroot;

        // the gps status file created by the habtracker-daemon.py program
        $gpsfile = "gpsstatus.json";

        $microsecs = 0;

        // read the gpsstatus.json file
        if(($cmdoutput = @file_get_contents($documentroot . "/" . $gpsfile)) === false) {
            return null;
        }

        if ($cmdoutput == null) {
            return null;
        }

        // convert the returned JSON to a PHP object
        $js = json_decode($cmdoutput, false);
        $js = setSourceText($js, "gpsstatus file");

        return $js;
    }


    /*********************
     * Function to get the GPS status from memcache...if it exists
     *********************/
    function getGPSStatusMemcache() {

        // store results here
        $js = null;

        try {
            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);

            // Something happened getting connected to the memcache daemon
            if (!$connectionresult) {
                return null;
            }

            // attempt to get the process_status key from memcache
            $getresult = $memcache->get('gps_status');

            // close the memcache connection
            $memcache->close();

            if ($getresult) {

                // convert the returned JSON to a PHP object
                $js = json_decode($getresult, false);
                $js = setSourceText($js, "memcache");
            }

        } catch (Exception $e) {

            // close the memcache connection, just in case
            $memcache->close();

            // some issue reading from memcache
            return null;
        }

        return $js;
    }


    /*********************
     * Wrapper function to get the GPS status from memcache or the gpsstatus.json file
     *********************/
    function getGPSStatus() {

        // Check memcache for an updated GPS geojson object
        $js = getGPSStatusMemcache();

        // if nothing from memcache, then check the GPS status file
        if (!$js) 
            $js = getGPSFileStatus();

        // if nothing from memcache or the GPS status file, then we return a blank, default GPS status object
        if (!$js)
            $js = createDefaultGPSStatus();

        // if we're here, then we've been able to acquire a valid GPS status
        return $js;
    }


    /************
     * createDefaultStatus
     *
     * This will create a default GPS status object in geojson format
     ***********/
    function createDefaultGPSStatus() {

        global $config;

        // default gps status
        $gpsstatus = new stdClass();
        $gpsstatus->status = "no device";
        $gpsstatus->host = "n/a";
        $gpsstatus->devicepath = "";
        $gpsstatus->speed_mph = 0.0;
        $gpsstatus->mode = 0;
        $gpsstatus->lat = 0.0;
        $gpsstatus->lon = 0.0;
        $gpsstatus->altitude = 0.0;
        $gpsstatus->utc_time = "";
        $gpsstatus->satellites = array();

        $dt = null;

        try {

            // current local time
            $dt = new DateTime("now", new DateTimeZone($config["timezone"]));
        } catch (Exception $e) {

            // if there was a problem with the user specified time zone (shouldn't be), then just default to America/Denver.
            $dt = new DateTime("now", new DateTimeZone("America/Denver"));
        }
        $timestring = $dt->format('Y-m-d\TH:i:s\Z');

        // create the default geojson object
        $geojson = new stdClass();
        $geojson->type = "FeatureCollection";
        $geojson->properties = new stdClass();
        $geojson->properties->name = "My station";
        $geojson->properties->gpssource = "Default GPS Status";
        $geojson->properties->microsecs = microtime(true);
        $geojson->features[] = new stdClass();
        $geojson->features[0]->properties = new stdClass();
        $geojson->features[0]->properties->type = "Feature";
        $geojson->features[0]->properties->speed_mph = 0.0;
        $geojson->features[0]->properties->altitude = 0.0;
        $geojson->features[0]->properties->bearing = 0.0;
        $geojson->features[0]->properties->time = $timestring;
        $geojson->features[0]->properties->gps = $gpsstatus;
        $geojson->features[0]->properties->callsign = "My Location";
        $geojson->features[0]->properties->tooltip = "";
        $geojson->features[0]->properties->id = "My Location";
        $geojson->features[0]->properties->symbol = "1x";
        $geojson->features[0]->properties->comment = "default stuff";
        $geojson->features[0]->properties->frequency = "";
        $geojson->features[0]->properties->iconsize = "24";
        $geojson->features[0]->geometry = new stdClass();
        $geojson->features[0]->geometry->type = "Point";
        $geojson->features[0]->geometry->coordinates = array(0.0, 0.0);

        return $geojson;
    }



    /**************************************************
    **************************************************
    * Main body below
    **************************************************
    **************************************************/


    // Connect to the database
    /*
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    // start listening for postgresql NOTIFY events
    pg_query($link, "LISTEN new_packet;");
    */

    ob_end_flush();

    // counter to increment upon each result sent to the browser
    $inc = 0;

    // sleep counter.  If this gets large (ex > 15), then send out a 'blank' update to the browsers
    $sleepcounter = 0;

    // how long we wait (approximately in seconds) before sending a heartbeat packet to the browser
    $threshold = 15;

    // last GPS status timestamp.
    $gpstimestamp = 0;
    $currenttime = microtime(true);
    $lastgpsupdate = $currenttime;

    // send a heartbeat message to the browser, initially.
    sendSSEHeartbeat();

    // first time through the loop flag.  Used to make sure we send initial gps status to the browser in the case of default or stale data.
    $firsttime = true;

    while (!connection_aborted()) {

        // The result from our postgresql LISTEN command.
        //$result = pg_get_notify($link);

        // check if we got anything back from the postgresql database
        //if ($result) { 
        //

        // where we'll store the JSON text message that we'll send to the browser.
        $payload = null;

        // get the current GPS status.  This will always return a valid object.
        $gps = getGPSStatus();

        // get the current time.  So we can compare it to a stale (or default) GPS status.
        $currenttime = microtime(true);

        // by default, we're not going to send this to the browser
        $cleartosend = false;

        // if there was a gps object returned...
        if ($gps) {

            // extract the EPOCH seconds from the returned geojson
            $gpstimestamp = getMicroSecs($gps);

            // boolean to determine if data from the GPS is stale
            $staledata = (($currenttime - $gpstimestamp) > $threshold * 2 ? true : false);

            // check if this was just a default geojson structure or is stale data.  If that's the case, then we don't want to repeatedly pepper the browser with lots of blank geojson
            // objects.  So we trottle.
            if ($gps->properties->gpssource == "Default GPS Status" || $staledata) {

                // determine if we should send this to the browser or not.
                if ((floor($currenttime - $lastgpsupdate) % ($threshold * 2) == 0 && $currenttime - $lastgpsupdate > $threshold) || $firsttime) {
                    $cleartosend = true;
                }
            }
            else {

                // this was a real GPS status so we always want to send that to the browser, but only if there's new data from the GPS (look at the timestamps)
                if ((int)$gpstimestamp != (int)$lastgpsupdate)
                    $cleartosend = true;
            }
        }

        // send GPS status to the browser if we're clear to do so.
        if ($cleartosend && $gps) {

            // Send this message to the browser and increment our counter
            sendSSE("gps_status", $inc, json_encode($gps));
            $inc += 1;

            // update the last GPS timestamp time
            $lastgpsupdate = $currenttime;

            // zero out the sleep counter, but only if this was NOT the default GPS status
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

        $firsttime = false;
    }

    // done.

?>
