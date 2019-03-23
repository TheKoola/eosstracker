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
$pagetitle="APRS:  Setup";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header-setup.php';

?>
<script>

    /************
     * toggle
     *
     * This function will toggle the visiblity of elements.
    *************/
    function toggle(event) {
        var ele = $(event.data.element);
        var signEle = $(event.data.link);
        ele.slideToggle('fast', function() {
            if (ele.is(':visible')) {
                signEle.text('-');
                //document.getElementById("error-JEFF-275").innerHTML = "toggling...minus:  " + divId + ", " + switchTag;
             }
             else  {
                signEle.text('+');
                //document.getElementById("error-JEFF-275").innerHTML = "toggling...plus:  " + divId + ", " + switchTag;
             }
        });
    }

    $(document).ready(function () {

        getTrackers();
        getFlights();
        getPredictions();
        getLaunchSites();
	getTimeZones();
	getConfiguration();
        var configuration_a = "#configurationSelectionLink";
        var configuration_l = "#configurationSelectionLinkSign";
        var configuration_e = "#configurationSelection";
        $(configuration_a).click({element: configuration_e, link: configuration_l }, toggle);

        var trackers_a = "#trackersSelectionLink";
        var trackers_l = "#trackersSelectionLinkSign";
        var trackers_e = "#trackersSelection";
        $(trackers_a).click({element: trackers_e, link: trackers_l }, toggle);

        var flights_a = "#flightsSelectionLink";
        var flights_l = "#flightsSelectionLinkSign";
        var flights_e = "#flightsSelection";
        $(flights_a).click({element: flights_e, link: flights_l }, toggle);

        var prediction_a = "#predictionSelectionLink";
        var prediction_l = "#predictionSelectionLinkSign";
        var prediction_e = "#predictionSelection";
        $(prediction_a).click({element: prediction_e, link: prediction_l }, toggle);

        var launchsite_a = "#launchsiteSelectionLink";
        var launchsite_l = "#launchsiteSelectionLinkSign";
        var launchsite_e = "#launchsiteSelection";
        $(launchsite_a).click({element: launchsite_e, link: launchsite_l }, toggle);

        var map_a = "#mapSelectionLink";
        var map_l = "#mapSelectionLinkSign";
        var map_e = "#mapSelection";
        $(map_a).click({element: map_e, link: map_l }, toggle);

    });


</script>
<div class="main">
    <div class="gallery-area">
            <div id="errors"></div>
            <div id="errors2"></div>

            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#trackers" class="header" id="trackersSelectionLink">(<span style="color: red;" id="trackersSelectionLinkSign">+</span>) Trackers</a>
            </p>
            <p class="normal-black"><span id="debug"></span></p>
            <div id="trackersSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to add new trackers or update existing ones.  Trackers can be assigned to teams and teams assigned to a flight. 
            </p>
            <p class="normal-black">
                <span id="trackers"></span>
                
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Add a New Tracker:
            </p>
            <p class="normal-black"><span id="newtrackererror"></span></p>
            <p class="normal-black">
                <form name="addnewtracker_form" id="addnewtracker_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Callsign</th><th class="packetlistheader">Notes</th><th class="packetlistheader">Team Assignment</th></tr>
                <tr><td class="packetlist"><input type="image" form="addnewtracker_form" src="/images/graphics/addicon.png" style="width: 22px; height: 22px;" onclick="addTracker(); return false;" ></td>
                    <td class="packetlist"><input type="text" form="addnewtracker_form" id="newtrackercall" placeholder="call" style="text-transform: uppercase;" pattern="([a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}|[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2})" size="9" maxlength="9" name="newtrackercall" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>

                    <td class="packetlist"><input type="text" form="addnewtracker_form" id="newtrackernotes" size="15" maxlength="64" required="required"></td>
                    <td class="packetlist"><select form="addnewtracker_form" id="newtrackerteam"></select>
                </td></tr>
                </table>
                </form>
            </p>
            </div>
            <div id="error"></div>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#flights" class="header" id="flightsSelectionLink">(<span style="color: red;" id="flightsSelectionLinkSign">+</span>) Flights</a>
            </p>
            <div id="flightsSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to add new flights or update existing ones.  To track a flight within the Map screens, enable "Track Flight" which will also enable landing prediction calculations for the flight.
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Add a New Flight:
            </p>
            <p class="normal-black"><span id="newflighterror"></span></p>
            <p class="normal-black">
                <form name="addnewflight_form" id="addnewflight_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th colspan=4 class="packetlistheader" style="text-align: center;">Enter Flight and Associated Beacons</th></tr>
                <tr><td colspan=5 class="packetlist" style="background-color: lightsteelblue; text-align: center;">Flight</td></tr>
                <tr><td rowspan=2 class="packetlist"><input type="image" form="addnewflight_form" src="/images/graphics/addicon.png" style="width: 22px; height: 22px;" onclick="addFlight(); return false;" ></td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="newflightid" placeholder="EOSS-xxx" style="text-transform: uppercase" pattern="[a-zA-Z]{1,4}-[0-9]{1,3}" size="8" maxlength="8" name="newflightid" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="newflightnotes" placeholder="Description" size="15" maxlength="64" required="required"></td>
                    <td class="packetlist" style="text-align: center;">Launch Site: <select form="addnewflight_form" id="newflightlaunchsite"></select></td>
                    <td class="packetlist" style="text-align: center;">Tracking: <input type="checkbox" form="addnewflight_form" id="newflightmonitoring" checked></td>
                </td></tr>
                <tr><td colspan=4 class="packetlist" style="background-color: lightsteelblue; text-align: center;">Beacons</td></tr>
                <tr>
                    <td class="packetlist" style="text-align: center;">1</td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="beacon1_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="newbeacon1" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                    <td class="packetlist"><select form"addnewflight_form" id="beacon1_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td colspan=2 class="packetlist"><input type="text" form="addnewflight_form" id="beacon1_description" placeholder="Description" size="15" maxlength="64" required="required"></td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center;">2</td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="beacon2_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="newbeacon2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off"></td>
                    <td class="packetlist"><select form"addnewflight_form" id="beacon2_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td colspan=2 class="packetlist"><input type="text" form="addnewflight_form" id="beacon2_description" placeholder="Description" size="15" maxlength="64" ></td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center;">3</td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="beacon3_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="newbeacon3" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" ></td>
                    <td class="packetlist"><select form"addnewflight_form" id="beacon3_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td colspan=2 class="packetlist"><input type="text" form="addnewflight_form" id="beacon3_description" placeholder="Description" size="15" maxlength="64" ></td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center;">4</td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="beacon4_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="newbeacon4" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" ></td>
                    <td class="packetlist"><select form"addnewflight_form" id="beacon4_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td colspan=2 class="packetlist"><input type="text" form="addnewflight_form" id="beacon4_description" placeholder="Description" size="15" maxlength="64" ></td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center;">5</td>
                    <td class="packetlist"><input type="text" form="addnewflight_form" id="beacon5_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="newbeacon5" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" ></td>
                    <td class="packetlist"><select form"addnewflight_form" id="beacon5_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td colspan=2 class="packetlist"><input type="text" form="addnewflight_form" id="beacon5_description" placeholder="Description" size="15" maxlength="64" ></td>
                </tr>
                </table>
                </form>
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Add a New Beacon to an Existing Flight
            </p>
            <p class="normal-black"><span id="addnewbeaconerror"></span></p>
            <p class="normal-black">
                <form name="addnewbeacon_form" id="addnewbeacon_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Flight ID</th><th class="packetlistheader">Callsign</th><th class="packetlistheader">Frequency</th><th class="packetlistheader">Description</th></tr>
                <tr><td class="packetlist"><input type="image" form="addnewbeacon_form" src="/images/graphics/addicon.png" style="width: 22px; height: 22px;" onclick="addBeacon(); return false;" ></td>
                    <td class="packetlist"><select form="addnewbeacon_form" id="addnewbeacon_flightid"></td>
                    <td class="packetlist"><input type="text" form="addnewbeacon_form" id="addnewbeacon_call" placeholder="call-xx" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2}" size="9" maxlength="9" name="addnewbeacon_call" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                    <td class="packetlist"><select form="addnewbeacon_form" id="addnewbeacon_frequency">
                        <option value="144.340">144.340MHz</option>
                        <option value="144.360">144.360MHz</option>
                        <option value="144.905">144.905MHz</option>
                        <option value="145.045">145.045MHz</option>
                        <option value="145.535">145.535MHz</option>
                        <option value="145.645">145.645MHz</option>
                        <option value="145.710">145.710MHz</option>
                        <option value="145.765">145.765MHz</option>
                        </select>
                    </td> 
                    <td class="packetlist"><input type="text" form="addnewbeacon_form" id="addnewbeacon_description" placeholder="Description" size="15" maxlength="64" required="required"></td>
                </tr>
                </table>
                </form>
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Existing Flights
            </p>
            <p class="normal-black">
                <span id="flights"></span>
            </p>
            </div>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#prediction" class="header" id="predictionSelectionLink">(<span style="color: red;" id="predictionSelectionLinkSign">+</span>) Prediction Data</a>
            </p>
            <div id="predictionSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to add prediction data to the database for a specific flight.  Select the RAW prediction file for upload.
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Add a Prediction
            </p>
            <p class="normal-black"><span id="addpredictionerror"></span></p>
            <p class="normal-black">
                <span id="newprediction"></span>
                <form name="newprediction_form" id="newprediction_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Flight ID</th><th class="packetlistheader">The Date</th><th class="packetlistheader">Launch Site</th><th class="packetlistheader">RAW File</th></tr>
                <tr><td class="packetlist"><input type="image" form="newprediction_form" src="/images/graphics/addicon.png" style="width: 22px; height: 22px;" onclick="addPrediction(); return false;"></td>
                    <td class="packetlist"><select form="newprediction_form" name="newprediction_flightids" id="newprediction_flightids"></select></td>
                    <td class="packetlist"><input type="date"  form="newprediction_form" name="newprediction_thedate" id="newprediction_thedate" placeholder="mm-dd-yyyy" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                    <td class="packetlist"><select form="newprediction_form" name="newprediction_launchsite" id="newprediction_launchsite"></select>
                    <!--<td class="packetlist"><input type="text"  form="newprediction_form" size="25" name="newprediction_url" id="newprediction_url" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="url"> -->
                    <td class="packetlist"><input type="file"  form="newprediction_form" name="newprediction_file" id="newprediction_file" required="required" >
                </td></tr>
                </table>
                </form>
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Existing Predictions
            </p>
            <p class="normal-black">
                <span id="predictiondata"></span>
            </p>
            </div>


            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#lsites" class="header" id="launchsiteSelectionLink">(<span style="color: red;" id="launchsiteSelectionLinkSign">+</span>) Launch Sites</a>
            </p>
            <div id="launchsiteSelection" style="display: none;">
            <p class="normal-italic">
                Use this selection to add new launch sites along with their latitude, longitude, and elevation.
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Add a Launch Site
            </p>
            <p class="normal-black"><span id="addlaunchsiteerror"></span></p>
            <p class="normal-black">
                <span id="newlaunchsite"></span>
                <form name="launchsite_form" id="launchsite_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Launch Site</th><th class="packetlistheader">Latitude<br>(decimal degrees)</th><th class="packetlistheader">Longitude<br>(decimal degrees)</th><th class="packetlistheader">Elevation<br>(feet)</th></tr>
                <tr><td class="packetlist"><input type="image" form="launchsite_form" src="/images/graphics/addicon.png" style="width: 22px; height: 22px;" onclick="addLaunchSite(); return false;"></td>
                    <td class="packetlist"><input type="text"  form="launchsite_form" size="25" name="launchsite_name" id="launchsite_name" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="launch site">
                    <td class="packetlist"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_lat" id="launchsite_lat" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="latitude" min="-90" max="90" step=".01">
                    <td class="packetlist"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_lon" id="launchsite_lon" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="longitude" min="-180" max="180" step=".01">
                    <td class="packetlist"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_alt" id="launchsite_alt" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="altitude" max="30000" min="-300" step="100">
                </td></tr>
                </table>
                </form>
            </p>
            <p class="normal-black" style="font-weight: bold;">
                Existing Launch Sites
            </p>
            <p class="normal-black">
                <span id="launchsites"></span>
            </p>
            </div>

            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#configuration" class="header" id="configurationSelectionLink">(<span style="color: red;" id="configurationSelectionLinkSign">+</span>) System Configuration</a>
            </p>
            <div id="configurationSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to set configuration parameters for the HAB Tracker system.  These settings are system-wide and are not configurable on a per user basis.
            </p>
            <p class="header" style="font-size: 1.2em;"> 
                <img class="bluesquare" style="width: 8px; margin: 0px; padding: 7px; padding-right: 15px;"  src="/images/graphics/smallbluesquare.png">
                Timezone
            <p class="normal-black"><span id="settimezone_error"></span></p>
            <p class="normal-black">
                Changes to the timezone take effect immediately across all web screens, but do not impact the local computer system time.  The timezone setting is persistent across process restarts and computer reboots/power-cycles.
                <form name="timezone_form" id="timezone_form">
                <table class="packetlist" style="margin-left: 30px; margin-right: 30px; width: auto;" cellpadding=0 cellspacing=0 border=0>
		<tr><th class="packetlistheader">Configuration Item</th><th class="packetlistheader" style="text-align: center;">Value</th></tr>
                <tr><td class="packetlist"><strong>Timezone</strong> used throughout the interface.</td>
		    <td class="packetlist" style="white-space: nowrap; padding: 5px;">Timezone: <select form="timezone_form" id="settimezone" onchange="setTimeZone(this);"></select></td>
                </tr>
                </table>
                </form>
            </p>

            <p class="header" style="font-size: 1.2em;"> 
                <img class="bluesquare" style="width: 8px; margin: 0px; padding: 7px; padding-right: 15px;"  src="/images/graphics/smallbluesquare.png">
                Transmitting and Igating 
            </p>
	    <p class="normal-black">
            These values are <font style="text-decoration: underline;">OPTIONAL</font> and not required for regular, read-only/receive-only operation.  A valid ham radio callsign is mandatory    if igating (ex. uploading of APRS packets to the Internet) or beaconing via APRS is desired (i.e. transmitting APRS packets over radio frequencies).
            </p>
	    <p class="normal-black">
                Changes to settings require the system processes to be restarted (on the <a href="/" class="normal-link-black">Home page</a>) before taking effect.  Settings are persistent across process restarts and computer reboots/power-cycles.
            </p>
            <p class="normal-black"><span id="configurationsettings_error"></span></p>
            <p class="normal-black">
                <form name="configuration_form" id="configuration_form">
                <table class="packetlist" style="margin-left: 30px; margin-right: 30px; width: auto;" cellpadding=0 cellspacing=0 border=0>
		<tr><th colspan=2 class="packetlistheader">Configuration Item</th><th class="packetlistheader" style="text-align: center;">Value</th></tr>
		<tr><td colspan=2 class="packetlist"><strong>Callsign and SSID</strong>.  Enter your ham radio callsign and select an appropriate SSID.</td>
		    <td class="packetlist" style="text-align: center; white-space: nowrap;">Callsign: <input type="text" form="configuration_form" id="callsign" oninput="setCustomValidity('');" onchange="validateCallsign();" placeholder="callsign" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}" size="9" maxlength="6" name="callsign" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" >
                    &nbsp; SSID: 
                    <select id="ssid" name="ssid" form="configuration_form" onchange="validateCallsign();">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                        <option value="7">7</option>
                        <option value="8">8</option>
                        <option value="9" selected="selected">9</option>
                        <option value="10">10</option>
                        <option value="11">11</option>
                        <option value="12">12</option>
                        <option value="13">13</option>
                        <option value="14">14</option>
                        <option value="15">15</option>
                    </select>
                    </td>
                </tr> 


		<tr>
                    <td colspan=3 class="packetlist" style="background-color: lightsteelblue; text-align: center; font-size: 1.1em; font-variant: small-caps; ">Igating to the Internet</td></tr>


		<tr>
<td class="packetlist" rowspan=3 style="background-color: #ffbf00;"><div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">IGating</div></td>
                    <td class="packetlist" id="igatingtext1"><strong>Enable igating</strong> for received APRS packets.  This assumes the system has Internet connectivity.</td>
                    <td class="packetlist"  id="igatingtext2" style="text-align: center; white-space: nowrap; color: lightgrey;">Enable igating: <input type="checkbox" name="igating" disabled="disabled" id="igating" onchange="checkIgating();"></td>
                </tr> 
		<tr>
                    <td class="packetlist" id="passcodetext1"><strong>APRS-IS passcode</strong> for connections to APRS-IS systems.</td>
                    <td class="packetlist" id="passcodetext2" style="text-align: center; white-space: nowrap; color: lightgrey;">Passcode: <input type="text" disabled="disabled" name="passcode" id="passcode"  placeholder="nnnnn" pattern="[0-9]{1,5}" onchange="validatePasscode();" size="5" maxlength="5" oninput="setCustomValidity('');"></td>
                </tr> 

		<tr>
		    <td class="packetlist" id="ibeaconratetext1" ><strong>Beacon to APRS-IS</strong> at this this rate (i.e. every mins:secs), directly over an internet connection.  Instead of relying 
		      solely on RF beaconing for getting APRS beacons to APRS-IS servers, this system can beacon directly to APRS-IS if enabled.  <br><strong>Note:</strong>  If RF beaconing is enabled below, APRS-IS direct beaconing will use those beaconing rates instead of the time value listed here.</td>
		    <td class="packetlist" id="ibeaconratetext2" style="white-space: nowrap; text-align: center; color: lightgrey;">
                    Enable: <input type="checkbox" name="ibeacon" disabled="disabled" id="ibeacon" onchange="checkIgating();"> &nbsp;
		    Mins:secs <input type="text" form="configuration_form" id="ibeaconrate" name="ibeaconrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr> 

                <tr>
		    <td colspan=3 class="packetlist" style="background-color: lightsteelblue; text-align: center; font-size: 1.1em; font-variant: small-caps;">APRS Comment and Station Symbol</td>
                </tr>
		<tr>
                    <td class="packetlist" rowspan=2 style="background-color: #ffbf00;"><div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">Comment and Symbol</div></td>
		<td class="packetlist" id="beaconingtext81"><strong>APRS comment</strong>.  For each outgoing packet, this comment will be included (limited to 60 characters).</td>
		    <td class="packetlist" id="beaconingtext82" style="text-align: center; color: lightgrey; white-space: nowrap;"><input type="text" form="configuration_form" id="comment" name="comment" size="25" maxlength="60" pattern="[^|~]+" placeholder="comment" onchange="validateComment();" oninput="setCustomValidity('');"></td>
                </tr>

		<tr><td class="packetlist" id="beaconingtext101"><strong>APRS symbol</strong>.  Choosed the appropriate symbol to represent your station.</td>
		    <td class="packetlist" id="beaconingtext102" style="white-space: nowrap; text-align: center; color: lightgrey; white-space: nowrap;">
		    <table cellpadding=0 cellspacing=0 border=0>
		    <tr><td style="vertical-align: middle;"><div style="position: relative; text-align: center; margin-right: 5px;" id="symbolicon"></div></td>
			<td style="vertical-align: middle; white-space: nowrap;"><span style="color lightgrey;" name="overlaytext" id="overlaytext">Overlay: </span>
                            <input type="text" form="configuration_form" id="overlay" name="overlay" size="1" maxlength="1" style="text-transform: uppercase;" pattern="[0-9A-Z]" disabled="disabled" placeholder="x" onchange="changeSymbol();">
                            <br><select style="vertical-align: middle;" form="configuration_form" name="symbol" id="symbol" onchange="changeSymbol();"></select></td>
                    </tr>
                    </table>
                </tr>

                <tr>
		    <td colspan=3 class="packetlist" style="background-color: lightsteelblue; text-align: center; font-size: 1.1em; font-variant: small-caps;">APRS RF Smart Beaconing</td>
                </tr>
		<tr>
                    <td class="packetlist" rowspan=11 style="background-color: #ffbf00;"><div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">Beaconing</div></td>
                    <td class="packetlist" id="beaconingtexta"><strong>Enable RF beaconing</strong> of position with APRS over RF.  This requires an external radio set to an appropriate frequency.</td>
                    <td class="packetlist" id="beaconingtextb" style="text-align: center; white-space: nowrap; color: lightgrey;">Enable beaconing: <input type="checkbox" name="beaconing" disabled="disabled" id="beaconing" onchange="checkBeaconing();" ></td>
                    </td>
                </tr>

		<tr><td class="packetlist" id="beaconingtext9a"><strong>Include EOSS within your APRS path</strong> when tracking flights with EOSS.  This system will alway use WIDE1-1,WIDE2-1, but one optionally can append "EOSS" to that path.  For example, WIDE1-1,WIDE2-1,EOSS. </td>
		    <td class="packetlist" id="beaconingtext9b" style="text-align: center; color: lightgrey; white-space: nowrap;">Include EOSS:  <input type="checkbox" name="includeeoss" disabled="disabled" id="includeeoss" form="configuration_form" checked></td>
                </tr>


		<tr><td class="packetlist" id="beaconingtext1a"><strong>Fast speed threshold</strong>.  For speeds above this value, beacon this frequently.</td>
		    <td class="packetlist" id="beaconingtext1b" style="white-space: nowrap; text-align: center; color: lightgrey;">Mph <input type="number" form="configuration_form" id="fastspeed" name="fastspeed" required="required" min="1" max="99" placeholder="nn">
		    Mins:secs <input type="text" form="configuration_form" id="fastrate" name="fastrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext2a"><strong>Slow speed threshold</strong>.  For speeds below this value, beacon this frequently.</td>
		    <td class="packetlist" id="beaconingtext2b" style="white-space: nowrap; text-align: center; color: lightgrey;">Mph <input type="number" form="configuration_form" id="slowspeed" name="slowspeed" required="required" min="1" max="99"  placeholder="nn" onchange="validateSlowSpeed();" oninput="setCustomValidity('');">
		    Mins:secs <input type="text" form="configuration_form" id="slowrate" name="slowrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
                <tr><td class="packetlist" id="beaconingtext3a"><strong>Frequency threshold</strong>.  Never beacon more frequently than this.</td>
                    <td class="packetlist" id="beaconingtext3b" style="text-align: center; color: lightgrey;">Mins:secs <input type="text" form="configuration_form" id="beaconlimit" name="beaconlimit" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext4a"><strong>Fast speed direction change threshold</strong>.  For speeds above the fast threshold, beacon when the direction travel changes by at least this many degrees.</td>
		    <td class="packetlist" id="beaconingtext4b" style="text-align: center; color: lightgrey;">Degrees <input type="number" form="configuration_form" id="fastturn" name="fastturn" required="required" size="5" maxlength="5" min="1" max="359" placeholder="nnn" required="required">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext5a"><strong>Slow speed direction change threshold</strong>.  For speeds below the slow threshold, beacon when the direction travel changes by at least this many degrees.</td>
		    <td class="packetlist" id="beaconingtext5b" style="text-align: center; color: lightgrey;">Degrees <input type="number" form="configuration_form" id="slowturn" name="slowturn" required="required" size="5" maxlength="5" min="1" max="359" placeholder="nnn" required="required">
                    </td>
                </tr>
                <tr>
                    <td colspan=2 class="packetlist" style="background-color: lightsteelblue; text-align: center; font-size: 1.1em; font-variant: small-caps;">External Radio Connection</td></tr>
		<tr>
		<tr><td class="packetlist" id="beaconingtext6a"><strong>System audio output device</strong>.  Choose the audio device on this system that will be used to output audio to an external radio.  Device 0 is usually the onboard headphone jack.</td>
		    <td class="packetlist" id="beaconingtext6b" style="text-align: center; color: lightgrey; white-space: nowrap;"><select form="configuration_form" id="audiodev" name="audiodev"></select></td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext7a"><strong>External radio PTT connection</strong>.  Choose the serial device on this system that will be used to trigger the PTT on the external radio. Select "NONE" if using a third party device like SignaLink or VOX on the radio.  See the Dire Wolf User's Guide for details.</td>
		    <td class="packetlist" id="beaconingtext7b" style="text-align: center; color: lightgrey; white-space: nowrap;">Port: <select form="configuration_form" id="serialport" name="serialport"></select>
			Line Ctrl: <select form="configuration_form" id="serialproto" name="serialproto">
                            <option value="RTS">RTS</option>
                            <option value="-RTS">-RTS</option>
                            <option value="DTR">DTR</option>
                            <option value="-DTR">-DTR</option>
                        </select>
                    </td>
                </tr>
                <tr><td colspan=3 class="packetlist" style="text-align: center; padding: 10px;"><input style="font-variant: small-caps; font-family:  'Gill Sans', GillSans, Helvetica, san-serif; font-size: 1.4em; background-color: lightsteelblue; color: black;" type="submit" value="Save Settings" onclick="setConfiguration(); return false;"></td></tr>

                </table>
                </form>
            </p>
            </div>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>
</div>

</div>
</div>
</div>
</div>
</div>
</body>
</html>
