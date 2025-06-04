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
$pagetitle="EOSS Flight Telemetry Viewer";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include_once $documentroot . '/common/header-telemetry.php';


// Check the flightid HTML GET variable
$get_flightid = "";
if (isset($_GET["flightid"])) {
    $get_flightid = strtoupper(check_string($_GET["flightid"], 20));
}

?>
<script src="/common/telemetry.js"></script>
<span id="flightid" data-flightid="<?php echo $get_flightid;?>" ></span>
<div style="margin-bottom 30px;">
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <span id="headerlabel">Telemetry</span>
    </p>
</div>
<div style="display: grid; grid-gap: 5px; grid-template-columns: 1fr 1fr; margin-left: 30px;">

    <!-- the previous and next flight links -->
    <div style="border: 0; text-align: left; font-size: 1.2em;"                       class="normal" id="prevflight">Previous flight: EOSS-123</div>
    <div style="border: 0; text-align: right;  font-size: 1.2em; margin-right: 30px;" class="normal" id="nextflight">Next flight: EOSS-456</div>

    <!-- the table of data specific to this flight -->
    <div style="grid-column: 1 / span 2; margin-bottom: 30px;margin-right: 30px;" id="metadata"></div>

    <!-- the charts -->
    <div><div id="altitudeplot-title"></div><div id="altitudeplot" style="text-align: left;"></div></div>
    <div><div id="map-title"><p class="normal" style="border: 0; text-align: left; font-size: 1.2em; font-variant: small-caps;">Map to be inserted here</p></div><div id="map"></div></div>
    <div><div id="ascent_velocityplot-title"></div><div id="ascent_velocityplot" style="text-align: left;"></div></div>
    <div><div id="descent_velocityplot-title"></div><div id="descent_velocityplot" style="text-align: left;"></div></div>
    <div><div id="temperatureplot-title"></div><div id="temperatureplot" style="text-align: left;"></div></div>
    <div><div id="airdensityplot-title"></div><div id="airdensityplot" style="text-align: left;"></div></div>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>
</div>
</body>
</html>
