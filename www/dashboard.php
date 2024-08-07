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


$pagetitle="APRS:  Dashboard";
if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header-dashboard.php';
?>
<body style="background-image: linear-gradient(#383838, #909090); background-repeat: no-repeat; background-attachment: fixed; width: 100%; height: 100%; margin: 0; color: white; font-family: 'Lucida Console', Monaco, monospace;">
<div style="text-align: center; width: 98%; height: 100%; margin-left: auto; margin-right: auto;">
    <div style="border-bottom: 5px double white; text-align: center; width: 98%; margin-left: auto; margin-right: auto;">
        <p style="color: lightgray; text-align: center; font-variant: small-caps;font-size: 2.2em;">
            Dashboard 
            <font style="font-size: .6em;">
                (view: <a href="#b" style="color: white;" id="listSelectionLink"><span id="listSelectionLinkSign">normal</span></a>
                 <span id="audioalerts" style="display: none;">audio: <a href="#a" style="color: white;" id="audioSelectionLink"><span id="audioSelectionLinkSign">disabled</span></a></span>)
            </font>
            <span id="flights" style="color: lightgray; font-size: .9em;"></span>
        </p>
    </div> 
    <div id="error"></div>
    <div id="stationlist" style="float: right; text-align: left; vertical-align: top; display: none;"></div>
    <div id="station" style="text-align: left; vertical-align: top; word-break: break-all; word-wrap: break-word;"></div>
</div>
<?php
    include $documentroot . '/common/footer.php';
?>
</body>
</html>
