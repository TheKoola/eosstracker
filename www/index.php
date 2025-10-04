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


$pagetitle="APRS:  Home";
if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<script src="/common/index.js"></script>
<div>
    <div id="error" class="nodeid" style="margin-left: 10px; color: white;"></div>
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        System Status
    </p>
    <!-- backend connection status -->
    <div class="div-table" style="float: none;" id="backendtable">
        <div class="table-row">
            <div class="table-cell toprow" style="border: none;">Connection status:</div>
            <div class="table-cell toprow" style="border: none;" id="backendconnection">n/a</div>
        </div>
    </div>
    <div id="antenna-data"></div>
    
    <div class="packetdata" id="ssedata"></div>

    <!-- start/stop buttons 
    <div class="div-table" style="clear: both;">
        <div class="table-row">
            <div class="table-cell header important toprow">Start and Stop Processes:</div>
        </div>
        <div class="table-row">
            <div class="table-cell">
                <p class="normal-italic" style="margin: 5px; font-size: 1.1em;">Use these controls to start or stop the system daemons.</p>
                <p style="margin: 10px; margin-left: 5px; ">
                    <button type="button" value="Start" class="graybutton" name="Start" id="startbutton" onclick="startUpProcesses();">Start</button> 
                    &nbsp; 
                    <button type="button" value="Stop" name="Shutdown" id="stopbutton" class="graybutton"  onclick="shutDownProcesses();">Stop/Abort</button>
                </p>
            </div>
        </div>
    </div>
    -->


    <!-- GPS state -->
    <div class="div-table" style="float: left;">
        <div class="table-row">
            <div class="table-cell header toprow" style="text-align: center;">GPS Status</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;"><span id="gpsdata">n/a</span></div>
        </div>
    </div>

    <!-- active flights -->
    <span id="flighttable"></span>

    <!-- active trackers -->
    <span id="trackertable"></span>

    <!-- active configuration -->
    <span id="configtable"></span>


    <!-- Notices -->
    <div style="clear: both; padding-top: 20px;">
        <p class="normal-italic"><strong>Note:</strong> GPS state is only updated while system processes are running</p>
    </div>


    <!-- System log output -->
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        System Logs
    </p>
    <p class="packetdata-header">Main Log</p>
    <div id="mainlog" class="packetdata" style="height: 20rem; overflow: scroll;"></div>
    <p class="packetdata-header">Direwolf Output</p>
    <div id="direwolf" class="packetdata" style="height: 20rem; overflow: scroll;"></div>
    <p><span id="debug"></span></p>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>

</body>
</html>
