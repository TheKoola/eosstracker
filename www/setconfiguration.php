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



    // Check the timezone parameter
    if (isset($_POST["timezone"]))
  	    $configuration["timezone"] = $_POST["timezone"];
    else if (!isset($configuration["timezone"]))
	    $configuration["timezone"] = $defaults["timezone"];

    // Check the callsign parameter
    if (isset($_POST["callsign"]))
  	    $configuration["callsign"] = $_POST["callsign"];
    else if (!isset($configuration["callsign"]))
	    $configuration["callsign"] = $defaults["callsign"];

    // Check the callsign lookbackperiod
    if (isset($_POST["lookbackperiod"]))
  	    $configuration["lookbackperiod"] = $_POST["lookbackperiod"];
    else if (!isset($configuration["lookbackperiod"]))
	    $configuration["lookbackperiod"] = $defaults["lookbackperiod"];

    // Check the callsign iconsize
    if (isset($_POST["iconsize"]))
  	    $configuration["iconsize"] = $_POST["iconsize"];
    else if (!isset($configuration["iconsize"]))
	    $configuration["iconsize"] = $defaults["iconsize"];

    // Check the callsign plottracks
    if (isset($_POST["plottracks"]))
  	    $configuration["plottracks"] = $_POST["plottracks"];
    else if (!isset($configuration["plottracks"]))
	    $configuration["plottracks"] = $defaults["plottracks"];

    file_put_contents($documentroot . "/configuration/config.txt", json_encode($configuration));

    //header("Content-Type:  application/json;");
    printf ("%s", json_encode($configuration));
?>

