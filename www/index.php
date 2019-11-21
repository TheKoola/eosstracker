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
$pagetitle="APRS:  Home";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<script src="/common/index.js"></script>
<div>
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        System Status
    </p>
    <div id="antenna-data"></div>
    
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        System Processes
    </p>

    <!-- start/stop buttons -->
    <div class="div-table" style="clear: both;">
        <div class="table-row">
            <div class="table-header-cell">Start and Stop Processes:</div>
        </div>
        <div class="table-row">
            <div class="table-cell">
                <p class="normal-italic" style="margin-top: 10px; font-size: 1.1em;">Use these controls to start or stop the system daemons.</p>
                <p style="margin-top: 10px; margin-bottom: 10px;"><button name="Start" id="startbutton" style="font-size: 1.1em;" onclick="startUpProcesses();">Start</button> 
                    &nbsp; 
                    <button name="Shutdown" id="stopbutton" style="font-size: 1.1em;" onclick="shutDownProcesses();">Stop</button>
                </p>
            </div>
        </div>
    </div>

    <!-- GPS state -->
    <div class="div-table" style="float: left;">
        <div class="table-row">
            <div class="table-header-cell" style="text-align: center;">GPS Status</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;"><span id="gpsdata">n/a</span></div>
        </div>
    </div>

    <!-- System processes -->
    <div class="div-table" style="float: left;">
        <div class="table-row">
            <div class="table-header-cell">Process</div>
            <div class="table-header-cell" style="border-left: none; text-align: center;">Status</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">direwolf</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="direwolf-status"><mark class="notokay">Not okay</mark></span><span id="direwolferror"></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">aprsc</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="aprsc-status"><mark class="nookay">Not okay</mark></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">gpsd</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="gpsd-status"><mark class="nookay">Not okay</mark></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">backend daemon</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="habtracker-d-status"><mark class="nookay">Not okay</mark></span></div>
        </div>
    </div>


    <!-- Configuration settings -->
    <div class="div-table" style="float: left;">
        <div class="table-row">
            <div class="table-header-cell" style="text-align: center;">Configuration Item</div>
            <div class="table-header-cell" style="text-align: center; border-left: none;">Setting</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Hostname</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none; font-family:  'Lucida Console', Monaco, monospace;"><?php echo $_SERVER["HTTP_HOST"]; echo "<br>" . $_SERVER["SERVER_ADDR"]; ?></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Node Name</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none; font-family:  'Lucida Console', Monaco, monospace;"><?php if (is_readable("nodeid.txt")) echo file_get_contents("nodeid.txt"); ?></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Callsign and SSID:</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none; font-family:  'Lucida Console', Monaco, monospace;"><span id="callsign"></span><span id="ssid"></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Timezone:</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="timezone"></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Igating:</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="igating"></span></div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">Beaconing:</div>
            <div class="table-cell" style="text-align: right; border-left: none; border-top: none;"><span id="beaconing"></span></div>
        </div>
    </div>



    <!-- Notices -->
    <div style="clear: both; padding-top: 20px;">
        <p class="normal-italic"><strong>Note:</strong> Process status is updated automatically every 5secs.</p>
        <p class="normal-italic"><strong>Note:</strong> GPS state is only updated while system processes are running</p>
    </div>


    <!-- System log output -->
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        System Logs
    </p>
    <p class="packetdata-header">Stdout</p>
    <pre class="packetdata"><span id="logfile"></span></pre>
    <p class="packetdata-header">Stderr</p>
    <pre class="packetdata" ><span id="errfile"></span></pre>
    <p class="packetdata-header">Transmitted Beacons (last 10 transmissions)</p>
    <pre class="packetdata" ><span id="beacons"></span></pre>
    <p class="packetdata-header">Direwolf output (limited to the first 100 lines)</p>
    <pre class="packetdata" ><span id="direwolf"></span></pre>
    <p><span id="debug"></span></p>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>

</body>
</html>
