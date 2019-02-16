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

    $command = "awk '/^[ \t]*[0-9]/ && !/HDMI/' /proc/asound/cards";
    $cmdoutput = shell_exec($command);
    if ($cmdoutput == null) {
        printf ("[]");
        return 0;
    }

    $a = explode("\n", $cmdoutput);
    $cards = [];
    foreach($a as $line) {
        $ray = preg_split('/\]:/', trim($line));
	$idx = substr($ray[0], 0, 1);
	if (is_numeric($idx))
	    $cards[] = array("device" => $idx, "description" => trim($ray[1]));
    }

    printf("%s", json_encode($cards));
?>

