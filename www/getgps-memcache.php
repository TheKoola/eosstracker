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

    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


    /************
     * createDefaultStatus
     *
     * This will create a default GPS status object in geojson format
     ***********/
    function createDefaultStatus() {     

        global $documentroot;

        // get the user's configuration
        $config = readconfiguration();

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
        $gpsstatus->microsecs = microtime(true);

        // current local time
        $dt = new DateTime("now", new DateTimeZone($config["timezone"]));
        $timestring = $dt->format('Y-m-d\TH:i:s\Z');

        // create the default geojson object
        $geojson = new stdClass();
        $geojson->type = "FeatureCollection";
        $geojson->properties = new stdClass();
        $geojson->properties->name = "My station";
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


    /************
     * getGPSStatusFile
     *
     * read in the GPS JSON status file
     ***********/
    function getGPSStatusFile($filename) {     

        global $documentroot;

        // Without a file name we just return the default status
        if (! $filename)
            return $defaultstatus;

        // Read the GPS status file
        $cmdoutput = file_get_contents($documentroot . "/" . $filename);

        // couldn't read the GPS status file (or it doesn't exist)
        if ($cmdoutput == null) {

            // return the default status since we didn't get anything back from the status file
            return createDefaultStatus();
        }
     
        // we must have read something from the GPS status file, so return that as an object.
        return json_decode($cmdoutput);
    }



    /************
     * main code below
     ***********/


    // where we'll store the results
    $js = new stdClass();

    // name of the backend GPS status file
    $gpsfile = "gpsstatus.json";

    // status of our memcache attempt
    $cache_status = null;

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the process_status key from memcache
        $getresult = $memcache->get('gps_status');

        // close the memcache connection.
        $memcache->close();

        if ($getresult) {

            // convert the returned JSON to a PHP object
            $js = json_decode($getresult);
            $cache_status = "cache hit";
        }
        else {
            // cache miss.  Now get the gps status of the backend processes
            $js = getGPSStatusFile($gpsfile);
            $cache_status = "cache miss";

            // now add this to memcache with a TTL of 300 seconds
            //$memcache->set('gps_status', json_encode($js), false, 10);
        }
    } catch (Exception $e) {

        // close the memcache object, just in case
        $memcache->close();

        // get the gps status of the backend processes
        $js = getGPSStatusFile($gpsfile);
        $cache_status = "exception:  " . $e;
    }

    // add the cache status key/value pair
    if (property_exists($js, "properties"))
        $js->properties->memcache = $cache_status;

    // print out results
    printf("%s", json_encode($js));


?>


