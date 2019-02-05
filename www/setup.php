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
include $documentroot . '/common/sessionvariables.php';

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
                    <td class="packetlist"><input type="text" form="addnewtracker_form" id="newtrackercall" placeholder="call" style="text-transform: uppercase;" pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}" size="9" maxlength="9" name="newtrackercall" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
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
                Use this section to add prediction data to the database for a specific flight.  Paste in the URL from the prediction page, for the "RAW" prediction file for a specific launch site.
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
