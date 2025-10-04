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


    /************
     * getConfigurationFile
     *
     * read in the configuration file for this backend system 
     ***********/
    function getConfigurationFile() {
        global $documentroot;

        // fallback JSON object
        $ray = array();
        $ray["timezone"] = "America/Denver";
        $ray["callsign"] = "";
        $ray["lookbackperiod"] = "180";
        $ray["iconsize"] = "24";
        $ray["plottracks"] = "off";
        $ray["ssid"] = "9";
        $ray["igating"] =  False;
        $ray["beaconing"] = False;
        $ray["passcode"] = "";
        //$ray["fastspeed"] = "45";
        //$ray["fastrate"] = "01:00";
        //$ray["slowspeed"] = "5";
        //$ray["slowrate"] = "10:00";
        //$ray["fastturn"] = "20";
        //$ray["slowturn"] = "60";
        //$ray["mobilestation"] = True;
        $ray["beaconlimit"] = "02:00";
        $ray["audiodev"] = "0";
        $ray["serialport"] = "none";
        $ray["serialproto"] = "RTS";
        $ray["comment"] = "EOSS Tracker";
        $ray["includeeoss"] = True;
        $ray["eoss_string"] = "EOSS";
        $ray["symbol"] = "/k";
        $ray["overlay"] = "";
        $ray["ibeacon"] = False;
        $ray["airdensity"] = False;
        $ray["gpshost"] = "";
        $fallbackJSON = json_encode($ray);

        // Defaults
        $defaultsJSON = file_get_contents($documentroot . "/configuration/defaults.txt");
        if ($defaultsJSON === false)
            $defaults = json_decode($fallbackJSON, true);
        else 
            $defaults = json_decode($defaultsJSON, true);


        // Get the configuration data from config.txt
        $configJSON = file_get_contents($documentroot . "/configuration/config.txt");
        if ($configJSON === false)
            $configuration = $defaults;
        else 
            $configuration = json_decode($configJSON, true);

        foreach(array_keys($defaults) as $key) {
            if(!array_key_exists($key, $configuration))
                $configuration[$key] = $defaults[$key];
        }

        // Workaround to make sure this is never on until the plottracks feature is fully disposed of.  ;)
        $configuration["plottracks"] = "off";

        return (object) $configuration;
    }



    /************
     * main code below
     ***********/


    // where we'll store the results
    $js = new stdClass();

    // status of our memcache attempt
    $cache_status = null;

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the process_status key from memcache
        $getresult = $memcache->get('configuration');

        if ($getresult) {

            // convert the returned JSON to a PHP object
            $js = json_decode($getresult, false);
            $cache_status = "cache hit";
        }
        else {
            // cache miss.  Now get the gps status of the backend processes
            $js = getConfigurationFile();
            $cache_status = "cache miss";

            // now add this to memcache with a TTL of 900 seconds.  
            $memcache->set('configuration', json_encode($js), false, 900);
        }

        // close the memcache connection.
        $memcache->close();

    } catch (Exception $e) {

        // close the memcache object, just in case
        $memcache->close();

        // get the gps status of the backend processes
        $js = getConfigurationFile();
        $cache_status = "exception:  " . $e;
    }

    // add the cache status key/value pair
    $js->memcache_status = $cache_status;

    // print out results
    printf("%s", json_encode($js));


?>




