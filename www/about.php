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
$pagetitle="APRS:  About";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<div style="width: 90%;"> 
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        About
    </p>
    <p>
	    The EOSS Tracker application aids tracking and recovery of high altitude balloons by  
        leveraging open source software and the amateur radio 
        <a target="_blank" href="http://www.aprs.org">Automatic Packet Reporting System</a> 
        to provide near real time status and location updates.
    </p>
    <div style="margin: 10px; border: solid 1px black; background-color: white; float: right; box-shadow: 5px 5px 8px black; padding: 10px;">
        <a target="_blank" href="https://www.eoss.org"> 
            <img src="/images/graphics/eoss-logo-small.png">
        </a>
    </div>
    <p style="margin-top: 10px;">
        <a target="_blank" href="https://www.eoss.org">Edge of Space Sciences</a> uses the 
        EOSS Tracker application to help fulfill their mission of promoting science and 
        education through high altitude balloons and amateur radio.
    </p>
</div>
<?php
    include $documentroot . '/common/footer.php';
?>
</body>
</html>
