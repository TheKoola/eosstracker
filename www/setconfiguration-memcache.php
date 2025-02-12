<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020, Jeff Deaton (N6BA)
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

        $ray = array();
        $ray["timezone"] = "America/Denver";
        $ray["callsign"] = "";
        $ray["lookbackperiod"] = "180";
        $ray["iconsize"] = "24";
        $ray["plottracks"] = "off";
        $ray["ssid"] = "9";
        $ray["igating"] =  "false";
        $ray["beaconing"] = "false";
        $ray["objectbeaconing"] = "false";
        $ray["passcode"] = "";
        $ray["fastspeed"] = "45";
        $ray["fastrate"] = "01:00";
        $ray["slowspeed"] = "5";
        $ray["slowrate"] = "10:00";
        $ray["beaconlimit"] = "02:00";
        $ray["fastturn"] = "20";
        $ray["slowturn"] = "60";
        $ray["audiodev"] = "0";
        $ray["serialport"] = "none";
        $ray["serialproto"] = "RTS";
        $ray["comment"] = "EOSS Tracker";
        $ray["includeeoss"] = "true";
        $ray["eoss_string"] = "EOSS";
        $ray["symbol"] = "/k";
        $ray["overlay"] = "";
        $ray["ibeaconrate"] = "15:00";
        $ray["ibeacon"] = "false";
        $ray["airdensity"] = "false";
        $ray["mobilestation"] = "true";
        $ray["gpshost"] = "";
        $ray["ka9qradio"] = "false";
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

        // Workaround to make sure this is never on until the plottracks feature is fully disposed of.  ;)
        $configuration["plottracks"] = "off";

        return $configuration;
    }


    /************
     * main code below
     ***********/

    $configuration = Array();

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // read in the default configuration
        $defaults = getConfigurationFile();

        // loop through the provided POST JSON data...if any...updating the configuration
        foreach(array_keys($defaults) as $key) {
            if(isset($_POST[$key]))
            $configuration[$key] = $_POST[$key];
            else if (!isset($configuration[$key]))
            $configuration[$key] = $defaults[$key];
        }

        // add a timestamp so we know when the last time we updated the configuration
        $configuration["timestamp"] = microtime(true);

        // Save the update configuration to the config.txt file.
        file_put_contents($documentroot . "/configuration/config.txt", json_encode($configuration));

        // Now add this to memcache with a TTL of 900 seconds.  
        $memcache->set('configuration', json_encode($configuration), false, 900);

        // close the memcache connection.
        $memcache->close();

    } catch (Exception $e) {

        // close the memcache object, just in case
        $memcache->close();
    }

    // print out results
    printf("%s", json_encode($configuration));

?>




