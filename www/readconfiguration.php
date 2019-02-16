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

    $fallbackJSON = "{ \"timezone\" : \"America\/Denver\", \"callsign\" : \"NOCALL\", \"lookbackperiod\" : \"180\", \"iconsize\" : \"24\", \"plottracks\" : \"off\" }";

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



    // Check timezone 
    if (!isset($configuration["timezone"]))
	    $configuration["timezone"] = $defaults["timezone"];

    // Check callsign 
    if (!isset($configuration["callsign"]))
	    $configuration["callsign"] = $defaults["callsign"];

    // Check lookbackperiod
    if (!isset($configuration["lookbackperiod"]))
	    $configuration["lookbackperiod"] = $defaults["lookbackperiod"];

    // Check iconsize
    if (!isset($configuration["iconsize"]))
	    $configuration["iconsize"] = $defaults["iconsize"];

    // Check plottracks
    if (!isset($configuration["plottracks"]))
	    $configuration["plottracks"] = $defaults["plottracks"];

    // Check SSID
    if (!isset($configuration["ssid"]))
	    $configuration["ssid"] = $defaults["ssid"];

    // Check igating
    if (!isset($configuration["igating"]))
	    $configuration["igating"] = $defaults["igating"];

    // Check beaconing
    if (!isset($configuration["beaconing"]))
	    $configuration["beaconing"] = $defaults["beaconing"];

    // Check fastspeed
    if (!isset($configuration["fastspeed"]))
	    $configuration["fastspeed"] = $defaults["fastspeed"];

    // Check slowspeed
    if (!isset($configuration["slowspeed"]))
	    $configuration["slowspeed"] = $defaults["slowspeed"];

    // Check fastrate
    if (!isset($configuration["fastrate"]))
	    $configuration["fastrate"] = $defaults["fastrate"];

    // Check slowrate
    if (!isset($configuration["slowrate"]))
	    $configuration["slowrate"] = $defaults["slowrate"];
    
    // Check beaconlimit
    if (!isset($configuration["beaconlimit"]))
	    $configuration["beaconlimit"] = $defaults["beaconlimit"];

    // Check fastturn
    if (!isset($configuration["fastturn"]))
	    $configuration["fastturn"] = $defaults["fastturn"];

    // Check slowturn
    if (!isset($configuration["slowturn"]))
	    $configuration["slowturn"] = $defaults["slowturn"];

    //header("Content-Type:  application/json;");
    printf ("%s", json_encode($configuration));

?>

