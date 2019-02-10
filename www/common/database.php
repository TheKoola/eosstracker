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

/* Read the configuration info */

function readconfiguration() {

    $fallbackJSON = "{ \"timezone\" : \"America\/Denver\", \"callsign\" : \"NOCALL\", \"lookbackperiod\" : \"180\", \"iconsize\" : \"24\", \"plottracks\" : \"off\" }";
    $documentroot = $_SERVER["DOCUMENT_ROOT"]; 

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
    if (!isset($configuration["timezone"]))
	    $configuration["timezone"] = $defaults["timezone"];

    // Check the callsign parameter
    if (!isset($configuration["callsign"]))
	    $configuration["callsign"] = $defaults["callsign"];

    // Check the callsign lookbackperiod
    if (!isset($configuration["lookbackperiod"]))
	    $configuration["lookbackperiod"] = $defaults["lookbackperiod"];

    // Check the callsign iconsize
    if (!isset($configuration["iconsize"]))
	    $configuration["iconsize"] = $defaults["iconsize"];

    // Check the callsign plottracks
    if (!isset($configuration["plottracks"]))
	    $configuration["plottracks"] = $defaults["plottracks"];

    //header("Content-Type:  application/json;");
    return $configuration;
}



/* This will connect to the database */
function connect_to_database() {
    $config = readconfiguration();

    if(isset($config["timezone"]))
        $linkvar = pg_connect("host=localhost dbname=aprs user=eosstracker password=Thisisthedatabasepassword! options='-c timezone=" . $config['timezone'] . "'");
    else
        $linkvar = pg_connect("host=localhost dbname=aprs user=eosstracker password=Thisisthedatabasepassword!");

    return $linkvar;
}


/* Perform a SQL query. */
/*     It accepts a string that contains the SQL statements */
/*     It will return the "result handle" or 0 if there was an error */

function sql_query ($sql, $link = NULL) {
    if ($sql == '')
        return 0;

    if (is_null($link))
        $results = pg_query($sql);
    else
        $results = pg_query($link, $sql);
    return $results;
}

   
/* Report the last SQL error */
/*     It will return a string with the last SQL error encountered */

function sql_last_error () {
    return pg_last_error();
}
   

/* Get an array containing the results of the query */
/*     It accepts a "results handle" from a previous sql query */
/*     It will return an array of the results */

function sql_fetch_array ($results) {
    if ($results == 0)
        return 0;
    //$array = pg_fetch_array($results, NULL, PGSQL_ASSOC); 
    $array = pg_fetch_array($results, NULL);
    return $array;
}

/* Get an array containing all of the results of the query */
/*     It accepts a "results handle" from a previous sql query */
/*     It will return an array of the results */

function sql_fetch_all ($results) {
    if ($results == 0)
        return 0;
    //$array = pg_fetch_all($results, PGSQL_ASSOC); 
    $array = pg_fetch_all($results);
    return $array;
}


/* Escapes a string for prepping a SQL query */

/* Escapes a string for prepping a SQL query */
/*     It accepts a string that contains the SQL query to be escaped */
/*     It returns an escaped string */

function sql_escape_string ($str) {
    if ($str == '')
        return '';
    $tempstr =  pg_escape_string(stripslashes($str));

    //$newstr = str_replace ("\\\"", "\"", $tempstr); 
    $newstr = $tempstr;
    return $newstr;
}


/* Close the SQL connection */
/*     It accepts an active "link" connection */

function sql_close ($link) {
    pg_close ($link);
}


/* Returns the number of rows within an active result set */
/*     It accepts an active "result" handle */
/*     It returns the number of rows */

function sql_num_rows ($results) {
    if ($results == 0)
        return 0;
    return pg_num_rows($results);
}


/* Moves the current row within a result set */
/*     It accepts an active "result" handle and the desired row number */
/*     It returns true or false */

function sql_result_seek ($result, $rownum) {
    if ($result == 0)
        return 0;
    return pg_result_seek($result, $rownum);
}



/* Returns the number of fields within the result (i.e. columns) */

function sql_num_fields ($result) {
    if ($result == 0)
        return 0;
    return pg_num_fields($result);
}


/* Returns the field name */

function sql_field_name ($result, $field) {
    if ($result == 0)
        return 0;
    return pg_field_name($result, $field);
}


?>
