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
<div style="margin-bottom 30px;">
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <span id="headerlabel">Telemetry</span>
    </p>
</div>
<span id="flightid" data-flightid="<?php echo $get_flightid;?>" ></span>
<div id="metadata" style="margin-left: 30px; margin-bottom: 30px;"></div>
<div id="altitudeplot" style="margin-left: 30px;"></div>
<div id="map" style="margin-left: 30px;"></div>
<div id="temperatureplot" style="margin-left: 30px;"></div>
<div id="airdensityplot" style="margin-left: 30px;"></div>

<?php
    include $documentroot . '/common/footer.php';
?>
</div>
</body>
</html>
