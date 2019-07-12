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

    $defaultstatus = array("status" => "no device",  "devicepath" => "", "speed_mph" => 0.0,  "mode" => 0, "lat" => "NaN", "altitude" => "NaN", "lon" => "NaN", "utc_time" => "", "satellites" => array());

    $cmdoutput = file_get_contents($documentroot . "/gpsstatus.json");
    if ($cmdoutput == null) {
        printf ("%s", json_encode($defaultstatus));
        return 0;
    }
 
    printf("%s", $cmdoutput);

?>

