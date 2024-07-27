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
    include $documentroot . '/common/functions.php';
    
    $gitpull_script = "/eosstracker/sbin/gitpullupdate.bash";

    $output = shell_exec('sudo -H -u eosstracker ' . $gitpull_script);
    if ($output) {
        // If there was output from the command, the strip off newlines and carrage returns. 
        $output = str_replace("\n", "", $output);
        $output = str_replace("\r", "", $output);
    }
    else {
        $output = "Unable to run 'git pull'";
    }

    // form up a JSON structure to send back to the client
    $json = array("output" => $output);

    // print out our JSON
    printf ("%s", json_encode($json));
?>
