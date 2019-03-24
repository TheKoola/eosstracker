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

    if(session_status() === PHP_SESSION_NONE) session_start();

    $documentroot = $_SERVER["DOCUMENT_ROOT"];

    $ray = array();
    $ray["timezone"] = "America/Denver";
    $ray["callsign"] = "";
    $ray["lookbackperiod"] = "180";
    $ray["iconsize"] = "24";
    $ray["plottracks"] = "off";
    $ray["ssid"] = "9";
    $ray["igating"] =  "false";
    $ray["beaconing"] = "false";
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
    $ray["symbol"] = "/k";
    $ray["overlay"] = "";
    $ray["ibeaconrate"] = "15:00";
    $ray["ibeacon"] = "false";
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

    //print_r($defaults);

    foreach(array_keys($defaults) as $key) {
        if(isset($_POST[$key]))
  	    $configuration[$key] = $_POST[$key];
        else if (!isset($configuration[$key]))
	    $configuration[$key] = $defaults[$key];
    }


    file_put_contents($documentroot . "/configuration/config.txt", json_encode($configuration));

    //header("Content-Type:  application/json;");
    printf ("%s", json_encode($configuration));
?>

