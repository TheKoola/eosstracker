<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2023 Jeff Deaton (N6BA)
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
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


    // Get the process status from the backend
    function getStatus() {
        $cmdoutput = shell_exec('/eosstracker/bin/procstatus.py');
        if ($cmdoutput == null) {
            return [];
        }

        return json_decode($cmdoutput);
    }


    #######################
    # main
    #######################

    // where we'll store the results
    $js = [];

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the process_status key from memcache
        $getresult = $memcache->get('process_status');
        if ($getresult) {
            $js = json_decode($getresult);
        }
        else {
            // cache miss.  Now get the status of the backend processes
            $js = getStatus();

            // now add this to memcache with a TTL of 300 seconds
            $memcache->set('process_status', json_encode($js), false, 300);
        }
    } catch (Exception $e) {
        // Connect to the backend and run the python script to determine process status
        $js = getStatus();
    }

    // print out results
    printf("%s", json_encode($js));
?>

