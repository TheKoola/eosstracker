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

    $command = "ls -1 /dev/ttyS[0-3]";
    $cmdoutput = shell_exec($command);
    if ($cmdoutput == null) {
        printf ("[]");
        return 0;
    }

    $a = explode("\n", $cmdoutput);
    $ports = [];
    foreach($a as $line) {
        $okay = preg_match('/^\/dev\/ttyS[0-9]*/', trim($line));
	$device = substr(trim($line), 9);
	if ($okay)
	    $ports[] = array("device" => $device, "serialport" => trim($line));
    }

    printf("%s", json_encode($ports));
?>
