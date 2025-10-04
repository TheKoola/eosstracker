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


    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include_once $documentroot . '/common/functions.php';
    include_once $documentroot . '/common/trackers.php';

    /**********
     * processInputs
     *
     * This will process the GET arguments and return an object with the found variables or null if there was an error
     **********/
    function processInputs(array $getarray): ?object {

        // default object that we'll return
        $obj = new stdClass();
        $obj->result = 0;
        $obj->error = "";

        // Check the notes HTML GET variable
        if (isset($getarray["tactical"])) {
            $get_tactical = check_string($getarray["tactical"], 20);
        }
        else
            $get_tactical = "";

        // Check the callsign HTML GET variable
        if (isset($getarray["callsign"])) {
            $get_callsign = strtoupper(check_string($getarray["callsign"], 20));
        }
        else
            $get_callsign = "";

        // if any of the GET parameters are not supplied, then exit...
        if ($get_tactical == "" || $get_callsign == "") {
            $obj->error = "HTML form error";
            return $obj;
        }

        // update the object with the results
        $obj->callsign = $get_callsign;
        $obj->tactical = $get_tactical;
        $obj->result = 1;
        $obj->error = "";

        return $obj;
    }
  
     
    /************
    * main code below
    *************/

    // parse any GET arguments
    $arguments = processInputs($_GET);

    // if all supplied arguments checkout...then proceed to insert the data into the database
    if ($arguments->result == 1) {

        // insert the new tracker
        $results = changeTrackerTeam($arguments->callsign, $arguments->tactical);

        // if successful, then delete the memcache tracker key so it will re-cache the results upon next read by the browser.
        if ($results)
            deleteTrackerKey();

        // refetch trackers list
        $js = getTrackers();

        if ($js)
            // send results of SQL insert to browser
            printf("%s", json_encode($js));
        else
            printf("[]");
    }
    else
        // there was an error with the arguments...just send back blank JSON
        printf("[]");
?>


