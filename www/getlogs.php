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

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    header("Content-type: text/plain;");
    $logfile = "/eosstracker/logs/start_session.log";
    $errfile = "/eosstracker/logs/start_session.log.stderr";
    $direwolffile = "/eosstracker/logs/direwolf.out";
    if (is_readable($logfile)) {
        $log = file($logfile);
        if ($log === false)
            $log = "Not available.";
    }
    else
	$log = "Not available.";
    if (is_readable($errfile)) {
        $err = file($errfile);
        if ($err === false)
            $err = "Not available.";
    }
    else
	$err = "Not available.";

    $beacons = [];
    $matches = [];
    if (is_readable($direwolffile)) {
        $dw = shell_exec('head -100 ' . $direwolffile);
        $dw_beacons = shell_exec("awk '/(^\[ig\] [A-Z]{1,2}[0-9]{1}[A-Z]{1,3})|(\[[0-9]+L [0-9]{2}:[0-9]{2}:[0-9]{2}\] [A-Z]{1,2}[0-9]{1}[A-Z]{1,3})/' " . $direwolffile);
        $p = preg_match_all('/^(\[[0-9]+L [0-9]{1,2}:[0-9]{2}:[0-9]{2}\]|\[ig\]) .*$/m', $dw_beacons, $matches);
   	    if ($p) {
            foreach ($matches[0] as $b) { 
	            if (strpos($b, "aprsc") === false && strpos($b, "logresp") === false)
	                $beacons[] = preg_replace(array('/^\[ig\] /', '/^\[[0-9]+L /'), array('[internet] ', '[RF '), $b) . "\n";
	        }
	        if (sizeof($beacons) > 0) { 
	            $beacons = array_reverse($beacons);
	            $disposeof = array_splice($beacons, 10);
	        }
	        else 
	            $beacons = "Not available.";
	    }
        else 
	        $beacons = "Not available.";
	    $filearray = explode("\n", $dw);
        if ($filearray === false) {
            $direwolflog = "Not available.";
        }
	    else {
            foreach($filearray as $f) {
	            $direwolflog[] = $f . "\n"; 
            }
	    }
    }
    else {
   	    $direwolflog = "Not available.";
        $beacons = "Not available.";
    }

    printf("{\"log\": %s, \"err\": %s, \"direwolf\" : %s, \"beacons\" : %s}", json_encode($log), json_encode($err), json_encode($direwolflog), json_encode($beacons));
?>

