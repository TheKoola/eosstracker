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


$pagetitle="APRS:  Setup";
if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<script src="/common/aprssymbols.js"></script>
<script src="/common/setup.js"></script>
<script src="/common/trackers.js"></script>
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
             }
             else  {
                signEle.text('+');
             }
        });
    }

    $(document).ready(function () {

        refreshPage();
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

        var freq_a = "#freqSelectionLink";
        var freq_l = "#freqSelectionLinkSign";
        var freq_e = "#freqSelection";
        $(freq_a).click({element: freq_e, link: freq_l }, toggle);

        var sync_a = "#syncupLink";
        var sync_l = "#syncupSign";
        var sync_e = "#syncup";
        $(sync_a).click({element: sync_e, link: sync_l }, toggle);

        var syncpackets_a = "#syncpacketsLink";
        var syncpackets_l = "#syncpacketsSign";
        var syncpackets_e = "#syncpackets";
        $(syncpackets_a).click({element: syncpackets_e, link: syncpackets_l }, toggle);

        // Update the Map link in the menu bar
        setTimeout(function() {
            updateMapLink();
        }, 10);

        setInterval(function () {
            updateMapLink();
        }, 5000);

    });

    /***********
    * updateMapLink
    *
    * This function will query the server for the latest GPS position and update the Map link in the menubar accordingly.
    ***********/
    function updateMapLink() {
        // Get the position from GPS and update the "Map" link in the main menu with the current lat/lon.
        //     The idea is that this will open the map screen centered on the current location preventing the map from having to "recenter"
        //     itself thus improving the user map experience.
        setTimeout (function () {
            $.get("getposition.php", function(data) {
                var lastposition = JSON.parse(data);
                var lat = lastposition.geometry.coordinates[1];
                var lon = lastposition.geometry.coordinates[0];
                var zoom = 10;

                var maplink = document.getElementById("maplink");
                var url = "/map.php?latitude=" + lat + "&longitude=" + lon + "&zoom=" + zoom;
                maplink.setAttribute("href", url);
            });
        }, 10);
    }

</script>
<div>
    <div id="errors"></div>


    <!-- ###################################### -->
    <!-- Flights configuration section -->
    <!-- ###################################### -->
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <a href="#flights" class="header" id="flightsSelectionLink">(<span style="color: red;" id="flightsSelectionLinkSign">+</span>) Flights</a>
    </p>
    <div id="flightsSelection" style="display: none;">
        <p class="normal-italic">
            Use this section to add new flights or update existing ones.  To track a flight within the Map screens, enable "Track Flight" which will also enable landing prediction calculations for the flight.
        </p>
        <p class="subheader">
            Add a New Flight
        </p>
        <p><span id="newflighterror"></span></p>
        <p>
            <form name="addnewflight_form" id="addnewflight_form">
                <table class="packetlist" style="margin-left: 30px; width:  auto;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th colspan=4 class="packetlistheader" style="text-align: center;">Enter Flight and Associated Beacons</th></tr>
                <tr><td colspan=5 class="packetlist-highlight">
                        Flight
                    </td>
                </tr>
                <tr><td rowspan=2 class="packetlist" style="padding: 5px; text-align: center;">
                        <input class="submitbutton" type="submit" value="Add" form="addnewflight_form" onclick="return addFlight();"> 
                    </td>
                    <td class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="newflightid" 
                            placeholder="FLIGHTID-xxx" style="text-transform: uppercase;" 
                            pattern="[a-zA-Z0-9_]{1,10}-[0-9]{1,3}" size="13" maxlength="23" 
                            title="must be alphanumeric (underscores are allowed), 1-10 chars in length, 
                                endng with a suffix of '-xxx' consisting of 3 digits" 
                            name="newflightid" autocomplete="off" autocapitalize="off" spellcheck="false" 
                            autocorrect="off" required="required">
                    </td>
                    <td class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="newflightnotes" placeholder="Description" size="15" 
                            maxlength="64" required="required"
                            pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()">
                    </td>
                    <td class="packetlist" style="text-align: center; padding: 5px;">
                        Launch Site: 
                        <select form="addnewflight_form" id="newflightlaunchsite"></select>
                    </td>
                    <td class="packetlist" style="text-align: center; padding: 5px;">
                        Tracking: 
                        <input type="checkbox" form="addnewflight_form" id="newflightmonitoring" checked>
                    </td>
                </tr>
                <tr><td colspan=4 class="packetlist-highlight">
                        Beacons
                    </td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center; padding: 5px;">
                        1
                    </td>
                    <td class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="beacon1_call" placeholder="callsign" style="text-transform: uppercase;"  
                            pattern="[a-zA-Z0-9_-]{1,20}" 
                            title="must be alphanumeric, 1-20 chars in length, and can include underscores ('_') and hyphens ('-')"
                            size="10" maxlength="20" name="newbeacon1" autocomplete="off" autocapitalize="off" 
                            spellcheck="false" autocorrect="off" required="required"
                            pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()">
                    </td>
                    <td class="packetlist" style="padding: 5px;"> 
                        <select form"addnewflight_form" id="beacon1_frequency"></select>
                    </td> 
                    <td colspan=2 class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="beacon1_description" placeholder="Description" size="21" 
                            maxlength="64" required="required"
                            pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()">
                    </td>
                </tr>
                <tr>
                    <td class="packetlist" style="text-align: center; padding: 5px;">
                        2
                    </td>
                    <td class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="beacon2_call" placeholder="callsign" style="text-transform: uppercase;"  
                            pattern="[a-zA-Z0-9_-]{1,20}" 
                            title="must be alphanumeric, 1-20 chars in length, and can include underscores ('_') and hyphens ('-')"
                            size="10" maxlength="20" name="newbeacon2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
                    </td>
                    <td class="packetlist" style="padding: 5px;">
                        <select form"addnewflight_form" id="beacon2_frequency"></select>
                    </td> 
                    <td colspan=2 class="packetlist" style="padding: 5px;">
                        <input type="text" form="addnewflight_form" id="beacon2_description" placeholder="Description" size="21" maxlength="64"
                        pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()">
                    </td>
                </tr>
                </table>
            </form>
        </p>


        <p class="subheader">
            Add a New Beacon to an Existing Flight
        </p>
        <p ><span id="addnewbeaconerror"></span></p>
        <p>
            <form name="addnewbeacon_form" id="addnewbeacon_form">
            <table class="packetlist" style="margin-left: 30px; width:  auto;" cellpadding=0 cellspacing=0 border=0>
            <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Flight ID</th><th class="packetlistheader">Callsign</th><th class="packetlistheader">Frequency</th><th class="packetlistheader">Description</th></tr>
            <tr><td class="packetlist" style="padding: 5px;"><input type="submit" form="addnewbeacon_form" value="Add" class="submitbutton"  onclick="addBeacon(); return false;" ></td>
                <td class="packetlist" style="padding: 5px;"><select form="addnewbeacon_form" id="addnewbeacon_flightid"></td>
                <td class="packetlist" style="padding: 5px;">
                    <input type="text" form="addnewbeacon_form" id="addnewbeacon_call" placeholder="callsign" style="text-transform: uppercase;"  
                        pattern="[a-zA-Z0-9_-]{1,20}" title="must be alphanumeric, 1-20 chars in length, and can include underscores ('_') and hyphens ('-')"
                        size="21" maxlength="20" name="addnewbeacon_call" autocomplete="off" 
                        autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                <td class="packetlist" style="padding: 5px;"><select form="addnewbeacon_form" id="addnewbeacon_frequency"></select>
                </td> 
                <td class="packetlist" style="padding: 5px;"><input type="text" form="addnewbeacon_form" id="addnewbeacon_description" placeholder="Description" size="21" maxlength="64" required="required"
                    pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()"></td>
            </tr>
            </table>
            </form>
        </p>
        <p class="subheader">
            Existing Flights
        </p>
        <p >
            <span id="flights"></span>
        </p>
    </div>
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <a href="#trackers" class="header" id="trackersSelectionLink">(<span style="color: red;" id="trackersSelectionLinkSign">+</span>) Trackers</a>
    </p>


    <!-- ###################################### -->
    <!-- Trackers configuration section -->
    <!-- ###################################### -->
    <div id="trackersSelection" style="display: none;">
        <p class="normal-italic">
            Use this section to add new trackers or update existing ones.  Trackers can be assigned to teams and teams assigned to a flight. 
        </p>
        <p style="margin-top: 10px;">
            <span id="trackers"></span>
            
        </p>
        <p class="subheader">
            Add a New Tracker:
        </p>
        <p><span id="newtrackererror"></span></p>
        <p>
            <form name="addnewtracker_form" id="addnewtracker_form">
            <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
            <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Callsign</th><th class="packetlistheader">Notes</th><th class="packetlistheader">Team Assignment</th></tr>
            <tr><td class="packetlist" style="padding: 5px; text-align: center;"><input type="submit" value="Add" class="submitbutton" form="addnewtracker_form" onclick="addTracker(); return false;" ></td>
                <td class="packetlist" style="padding: 5px;"><input type="text" form="addnewtracker_form" id="newtrackercall" placeholder="callsign" style="text-transform: uppercase;" 
                    pattern="([a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}|[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}-[0-9]{1,2})" size="9" maxlength="9" name="newtrackercall" 
                    autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                <td class="packetlist" style="padding: 5px;"><input type="text" form="addnewtracker_form" id="newtrackernotes" size="15" maxlength="64" required="required"
                    pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()"></td>
                <td class="packetlist" style="padding: 5px;"><select form="addnewtracker_form" id="newtrackerteam"></select>
            </td></tr>
            </table>
            </form>
        </p>
    </div>
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <a href="#prediction" class="header" id="predictionSelectionLink">(<span style="color: red;" id="predictionSelectionLinkSign">+</span>) Prediction Data</a>
    </p>


            <!-- ###################################### -->
            <!-- Prediction data configuration section -->
            <!-- ###################################### -->
            <div id="predictionSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to add prediction data to the database for a specific flight.  Select the RAW prediction file for upload.
            </p>
            <p class="subheader">
                Add Predictions Automatically
            </p>
            <p>
                <form name="predict-sync" id="predict-sync">
                    <table cellpadding=0 cellspacing=0 border=0>
                    <tr><td>
                        <input class="submitbutton" style="margin: 5px; margin-left: 30px;" type="submit" value="Download Predict Files..." form="predict-sync" onclick="getPredictFiles(); return false;">
                    </td>
                    <td>
                        <span style="margin: 5px; text-align: left;" id="predict-status"></span>
                    </td>
                    </table>
                </form>  
            </p>
            <p class="normal-italic" style="margin-top: 10px;">
                Clicking the "Download Predict Files..." button will attempt to download the RAW predict files from 
                <a class="normal-link-black" href="https://www.eoss.org/predict">https://www.eoss.org/predict</a> for each flight that was recently added (< 2 weeks) 
                to the system.  This requires an Internet connection.
            </p>
            <p class="subheader">
                Add a Prediction Manually
            </p>
            <p ><span id="addpredictionerror"></span></p>
            <p >
                <span id="newprediction"></span>
                <form name="newprediction_form" id="newprediction_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Flight ID</th><th class="packetlistheader">The Date</th><th class="packetlistheader">Launch Site</th><th class="packetlistheader">RAW File</th></tr>
                <tr><td class="packetlist" style="padding: 5px; text-align: center;"><input type="submit" value="Add" class="submitbutton"  form="newprediction_form"  onclick="addPrediction(); return false;"></td>
                    <td class="packetlist" style="padding: 5px;"><select form="newprediction_form" name="newprediction_flightids" id="newprediction_flightids"></select></td>
                    <td class="packetlist" style="padding: 5px;"><input type="date"  form="newprediction_form" name="newprediction_thedate" id="newprediction_thedate" placeholder="yyyy-mm-dd" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required"></td>
                    <td class="packetlist" style="padding: 5px;"><select form="newprediction_form" name="newprediction_launchsite" id="newprediction_launchsite"></select>
                    <td class="packetlist" style="padding: 5px;"><input type="file"  form="newprediction_form" name="newprediction_file" id="newprediction_file" required="required" >
                </td></tr>
                </table>
                </form>
            </p>
            <p class="subheader">
                Existing Predictions
            </p>
            <p >
                <span id="predictiondata"></span>
            </p>
            <p>
                <form name="deletepredictions" id="deletepredictions">
                    <table cellpadding=0 cellspacing=0 border=0 style="margin-top: 10px;">
                    <tr><td>
                        <input class="submitbutton" style="margin: 5px; margin-left: 30px;" type="submit" value="Delete Old Predict Files" form="deletepredictions" onclick="deletePredictFiles(); return false;">
                    </td>
                    <td>
                        <span style="margin: 5px; text-align: left;" id="deletepredictions-status"></span>
                    </td>
                    </table>
                </form>  
            </p> 
            <p class="normal-italic" style="margin-top: 10px;">
                Clicking the "Delete Old Predict Files" button will delete all predict files that are older than two weeks.
            </p>
            </div>


            <!-- ###################################### -->
            <!-- Launch Site data configuration section -->
            <!-- ###################################### -->
            <p class="header">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#lsites" class="header" id="launchsiteSelectionLink">(<span style="color: red;" id="launchsiteSelectionLinkSign">+</span>) Launch Sites</a>
            </p>
            <div id="launchsiteSelection" style="display: none;">
            <p class="normal-italic">
                Use this selection to add new launch sites along with their latitude, longitude, and elevation.
            </p>
            <p class="subheader">
                Add a Launch Site
            </p>
            <p ><span id="addlaunchsiteerror"></span></p>
            <p >
                <span id="newlaunchsite"></span>
                <form name="launchsite_form" id="launchsite_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Launch Site</th><th class="packetlistheader">Latitude<br>(decimal degrees)</th><th class="packetlistheader">Longitude<br>(decimal degrees)</th><th class="packetlistheader">Elevation<br>(feet)</th></tr>
                <tr><td class="packetlist" style="padding: 5px; text-align: center;"><input type="submit" value="Add" class="submitbutton" form="launchsite_form" onclick="addLaunchSite(); return false;"></td>
                    <td class="packetlist" style="padding: 5px;"><input type="text"  form="launchsite_form" size="25" maxlength="64" name="launchsite_name" id="launchsite_name" 
                        pattern="[a-zA-Z0-9.(), _-]{1,64}" title="valid characters include: a-zA-Z0-9 _-,.()"
                        autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="launch site">
                    <td class="packetlist" style="padding: 5px;"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_lat" id="launchsite_lat" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="latitude" min="-90" max="90" step=".01">
                    <td class="packetlist" style="padding: 5px;"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_lon" id="launchsite_lon" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="longitude" min="-180" max="180" step=".01">
                    <td class="packetlist" style="padding: 5px;"><input type="number"  form="launchsite_form" style="width: 100px;" size="15" name="launchsite_alt" id="launchsite_alt" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" placeholder="altitude" max="15000" min="-300" step="100">
                </td></tr>
                </table>
                </form>
            </p>
            <p class="subheader">
                Existing Launch Sites
            </p>
            <p >
                <span id="launchsites"></span>
            </p>
            </div>

            <!-- ###################################### -->
            <!-- Frequency configuration section -->
            <!-- ###################################### -->
            <p class="header">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#freq" class="header" id="freqSelectionLink">(<span style="color: red;" id="freqSelectionLinkSign">+</span>) Frequencies</a>
            </p>
            <div id="freqSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to manage the frequencies used for APRS beacons.  Added frequencies must be part of the 2m Ham band and between 144MHz and 146MHz.  
                The standard North American APRS frequency of 144.390MHz is fixed and not editable.
            </p>
            <p class="subheader">
                Add a New Frequency:
            </p>
            <p ><span id="addfrequencyerror"></span></p>
            <p >
                <form name="addnewfreq_form" id="addnewfreq_form">
                <table class="packetlist" style="margin-left: 30px; width: 30%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader" style="text-align: center;">Frequency</th></tr>
                <tr><td class="packetlist" style="padding: 5px; text-align: center;"><input type="submit" value="Add" class="submitbutton" form="addnewfreq_form"  onclick="addFrequency(); return false;" ></td>
                    <td class="packetlist" style="padding: 5px; text-align: center;">
                        <input type="text" form="addnewfreq_form" id="newfrequency" oninput="setCustomValidity('');" onchange="validateFrequency();"
                            placeholder="14x.xxx" pattern="14[0-9]{1}\.[0-9]{1,3}" size="8" maxlength="7" name="newfrequency" autocomplete="off" 
                            autocapitalize="off" spellcheck="false" autocorrect="off" required="required">
                    </td>
                </tr>
                </table>
                </form>
            </p>
            <p class="subheader">
                Existing Frequencies:
            </p>
            <p >
                <span id="frequencies"></span>
            </p>
            </div>


    <!-- ###################################### -->
    <!-- Sync up section -->
    <!-- ###################################### -->
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <a href="#syncup" class="header" id="syncupLink">(<span style="color: red;" id="syncupSign">+</span>) Synchronize Flights, Trackers, etc.</a>
    </p>
    <div id="syncup" style="display: none;">
        <p class="normal-italic">
            Click the "Synchronize..." button to synchronize this system's flight and tracker definitions with the EOSS Kiosk system running on <a href="https://track.eoss.org/" class="normal-link-black">track.eoss.org</a>.
        </p>
        <p class="subheader">
            Synchronize With The EOSS Kiosk System:
        </p>
        <p>
            <form name="initial-sync" id="initial-sync">
                    <input class="submitbutton" style="margin: 5px; margin-left: 30px;" type="submit" value="Synchronize..." form="initial-sync" onclick="syncData(); return false;">
                    <span id="syncup-status"></span>
            </form>  
            <div id="syncup-div" style="margin-top: 10px;"></div>
        </p>
        <p class="normal-italic">
            Please restart the System Processes from the <a href="/" class="normal-link-black">Home</a> page for changes to take effect.
        </p>
    </div>

    <!-- ###################################### -->
    <!-- Get missing packets section -->
    <!-- ###################################### -->
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        <a href="#syncpackets" class="header" id="syncpacketsLink">(<span style="color: red;" id="syncpacketsSign">+</span>) Check For Missing Flight Packets</a>
    </p>
    <div id="syncpackets" style="display: none;">
        <p class="normal-italic" style="margin-top: 20px;">
            Click the "Get Missing Packets..." button to download any APRS packets from active flights from the system running on <a href="https://track.eoss.org/" class="normal-link-black">track.eoss.org</a> that are NOT present on this local system.  
        </p>
        <p class="subheader">
            Check for missing APRS packets from active flights:
        </p>
        <p>
            <form name="packets-sync" id="packets-sync">
                    <input class="submitbutton" style="margin: 5px; margin-left: 30px;" type="submit" value="Get Missing Packets..." form="packets-sync" onclick="syncPackets(); return false;">
                    <span id="syncpackets-status"></span>
            </form>  
            <div id="syncpackets-div" style="margin-top: 10px;"></div>
        </p>
    </div>


            <!-- ###################################### -->
            <!-- Configuration section -->
            <!-- ###################################### -->
            <p class="header">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                <a href="#configuration" class="header" id="configurationSelectionLink">(<span style="color: red;" id="configurationSelectionLinkSign">+</span>) System Configuration</a>
            </p>
            <div id="configurationSelection" style="display: none;">
            <p class="normal-italic">
                Use this section to set configuration parameters for the HAB Tracker system.  These settings are system-wide and are not configurable on a per user basis.
            These values are <font style="text-decoration: underline;">OPTIONAL</font> and not required for regular, read-only/receive-only operation.  A valid ham radio callsign is mandatory    if igating (ex. uploading of APRS packets to the Internet) or beaconing via APRS is desired (i.e. transmitting APRS packets over radio frequencies).
            Changes to settings require the system processes to be restarted (on the <a href="/" class="normal-link-black">Home page</a>) before taking effect.  Settings are persistent across process restarts and computer reboots/power-cycles.
            </p>
            <p><span id="configurationsettings_error"></span></p>
            <p style="margin-top: 20px; margin-bottom: 10px;">
                <form name="configuration_form" id="configuration_form">
                <table class="packetlist" style="margin-left: 30px; margin-right: 30px; width: 80%;" cellpadding=0 cellspacing=0 border=0>
		<tr><th colspan=2 class="packetlistheader">Configuration Item</th><th class="packetlistheader" style="text-align: center;">Value</th></tr>
        <tr><td class="packetlist-highlight2"  rowspan=1 style="padding-top: 20px; padding-bottom: 20px;">
                <div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">Identity</div>
            </td>

            <td class="packetlist"><strong>Callsign and SSID</strong>.  Enter your ham radio callsign and select an appropriate SSID.</td>
		    <td class="packetlist" style="text-align: center; white-space: nowrap;">Callsign: <input type="text" form="configuration_form" id="callsign" oninput="setCustomValidity('');" onchange="validateCallsign();" placeholder="callsign" style="text-transform: uppercase;"  pattern="[a-zA-Z]{1,2}[0-9]{1}[a-zA-Z]{1,3}" size="9" maxlength="6" name="callsign" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" >
                    &nbsp; SSID: 
                    <select id="ssid" name="ssid" form="configuration_form" onchange="validateCallsign();">
                        <option value="0">none</option>
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


		<tr><td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps; ">Timezone</td></tr>
        <tr> <td class="packetlist-highlight2"  rowspan=1 style="padding-top: 20px; padding-bottom: 20px;">
                 <div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">Timezone</div>
             </td>

             <td class="packetlist">
                 <strong>Timezone</strong> used throughout the interface.  Changes to the timezone take effect immediately across all web screens, but do not impact the local computer system time.  This timezone setting is persistent across process restarts and computer reboots/power-cycles.
             </td>

             <td class="packetlist"  style="text-align: right;">Timezone: 
                 <select form="configuration_form" id="settimezone"></select>
             </td>
        </tr> 


		<tr><td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps; ">Global Positioning System (GPS)</td></tr>
        <tr> <td class="packetlist-highlight2"  rowspan=1 style="padding-top: 20px; padding-bottom: 20px;">
                 <div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">GPS</div>
             </td>

             <td class="packetlist">
                 <strong>GPS</strong> is used to determine the location and altitude of this system.  For a locally attached GPS device (ex. serial or USB connection) leave this blank or "localhost".  To 
                     leverage the GPS connected to another system enter the IP address or hostname of that system here.  This assumes the "other" system is running GPSD and is accessible on the same
                     network as this system.
             </td>

             <td class="packetlist"  style="text-align: right;">GPSD Host: 
                 <input form="configuration_form" id="gpshost" style="text-align: center;" size="16" maxlength="64" name="gpshost" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" placeholder="localhost">
             </td>
        </tr> 


		<tr><td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps; ">KA9Q-Radio</td></tr>
        <tr> <td class="packetlist-highlight2"  rowspan=1 style="padding-top: 20px; padding-bottom: 20px;">
                 <div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">KA9Q-Radio</div>
             </td>

             <td class="packetlist">
                 <strong>KA9Q-Radio</strong> uses a novel approach in distributing audio streams from radio frequencies.  If this option is enabled, this system will listen for any audio streams produced
                     by a KA9Q-Radio instance running on the local network.  
             </td>
             <td class="packetlist"  id="ka9qradiotext" style="text-align: center; white-space: nowrap;">Listen for KA9Q-Radio: <input type="checkbox" form="configuration_form" name="ka9qradio" id="ka9qradio"></td>
        </tr> 



		<tr><td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps; ">APRS-IS Internet Uplink</td></tr>
        <tr> <td class="packetlist-highlight2"  rowspan=1>
             <div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">APRS-IS</div></td>
             <td class="packetlist" id="aprstext1"><strong>Additional Area of Interest</strong>. An optional, additional area of interest can be added so that when connected to an Internet connection, the system will have access to packets in this geographic area as well.  The default coordinates are approximately at Last Chance, Colorado (39.75, -103.60).  All coordinates should be entered in decimal degrees and radius values in kilometers.</td>
             <td class="packetlist"  id="aprstext2" style="text-align: right;">
                    Latitude: <input type="number"  form="configuration_form" style="text-align: right;" size="6" name="filter_lat" id="filter_lat" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" placeholder="latitude" min="-90" max="90" step=".01"><br>
                    Longitude: <input type="number"  form="configuration_form" style="text-align: right;" size="6" name="filter_lon" id="filter_lon" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off"  placeholder="longitude" min="-180" max="180" step=".01"><br>
                    Radius (km): <input type="number"  form="configuration_form" style="text-align: right;" size="6" name="filter_radius" id="filter_radius" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off"  placeholder="radius" max="5000" min="100" step="50">
             </td>
        </tr> 


		<tr><td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps; ">Igating to the Internet</td></tr>
		<tr>
<td class="packetlist-highlight2" rowspan=3><div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">IGating</div></td>
                    <td class="packetlist" id="igatingtext1"><strong>Enable igating</strong> for received APRS packets.  This assumes the system has Internet connectivity.</td>
                    <td class="packetlist"  id="igatingtext2" style="text-align: center; white-space: nowrap;">Enable igating: <input type="checkbox" form="configuration_form" name="igating" disabled="disabled" id="igating" onchange="checkIgating();"></td>
        </tr> 

		<tr id="passcodesection">
                    <td class="packetlist" id="passcodetext1"><strong>APRS-IS passcode</strong> for connections to APRS-IS systems.</td>
                    <td class="packetlist" id="passcodetext2" style="text-align: center; white-space: nowrap;">Passcode: <input type="text" disabled="disabled" form="configuration_form" name="passcode" id="passcode"  placeholder="nnnnn" pattern="[0-9]{1,5}" onchange="validatePasscode();" size="5" maxlength="5" oninput="setCustomValidity('');"></td>
        </tr> 

		<tr id="beacontoaprsissection">
		    <td class="packetlist" id="ibeaconratetext1" ><strong>Beacon to APRS-IS</strong> at this this rate (i.e. every mins:secs), directly over an internet connection.  Instead of relying 
		      solely on RF beaconing for getting APRS beacons to APRS-IS servers, this system can beacon directly to APRS-IS if enabled.  <br><strong>Note:</strong>  If RF beaconing is enabled below, APRS-IS direct beaconing will use those beaconing rates instead of the time value listed here.</td>
		    <td class="packetlist" id="ibeaconratetext2" style="white-space: nowrap; text-align: center;">
                    Enable: <input type="checkbox" name="ibeacon" disabled="disabled" id="ibeacon" onchange="checkIgating();"> &nbsp;
		    Mins:secs <input type="text" form="configuration_form" id="ibeaconrate" name="ibeaconrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
        </tr> 

        <tr id"aprscommentseciton1">
		    <td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps;">APRS Comment and Station Symbol</td>
        </tr>

		<tr id="aprscommentsection2">
                    <td class="packetlist-highlight2" rowspan=2 ><div style="-webkit-transform: rotate(270deg);  -ms-transform: rotate(270deg); transform: rotate(270deg); font-variant: small-caps; vertical-align: middle; text-align: center;">Comment and Symbol</div></td>
		<td class="packetlist" id="beaconingtext81"><strong>APRS comment</strong>.  For each outgoing packet, this comment will be included (limited to 60 characters).</td>
		    <td class="packetlist" id="beaconingtext82" style="text-align: center; white-space: nowrap;"><input type="text" form="configuration_form" id="comment" name="comment" size="25" maxlength="60" pattern="[^|~]+" placeholder="comment" onchange="validateComment();" oninput="setCustomValidity('');"></td>
        </tr>

        <tr id="aprssymbolsection">
            <td class="packetlist" id="beaconingtext101"><strong>APRS symbol</strong>.  Choosed the appropriate symbol to represent your station.</td>
		    <td class="packetlist" id="beaconingtext102" style="white-space: nowrap; text-align: center; white-space: nowrap;">
                    <div style="float: right;" name="overlaytext" id="overlaytext">Overlay Character:
                        <input type="text" form="configuration_form" id="overlay" name="overlay" size="1" maxlength="1" 
                            style="text-transform: uppercase;" pattern="[0-9A-Z]" disabled="disabled" placeholder="x" onchange="changeSymbol();">
                    </div>
                    <div style="margin-right: 20px; float: right;" id="symbolicon"></div>
                <div style="clear: both; text-align: center;">
                    <select style="vertical-align: middle;" form="configuration_form" name="symbol" id="symbol" onchange="changeSymbol();"></select>
                </div>
            </td>
        </tr>

        <tr>
		    <td colspan=3 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps;">APRS RF Beaconing</td>
        </tr>
		<tr>
            <td class="packetlist-highlight2" rowspan=13><div style="-webkit-transform: rotate(270deg);  
                -ms-transform: rotate(270deg); 
                transform: rotate(270deg); 
                font-variant: small-caps; 
                vertical-align: middle; 
                text-align: center;">Beaconing</div></td>
            <td class="packetlist" id="beaconingtexta"><strong>Enable RF beaconing</strong> of position with APRS over RF.  This requires an external radio set to an appropriate frequency.</td>
            <td class="packetlist" id="beaconingtextb" style="text-align: center; white-space: nowrap;">Enable beaconing: <input type="checkbox" name="beaconing" disabled="disabled" id="beaconing" onchange="checkBeaconing();" ></td>
        </tr>
		<tr>
            <td class="packetlist" id="objectbeacona"><strong>Enable beaconing of landing predictions</strong> over RF so other stations have access to this system's 
                predicted landing locations.  This will transmit an APRS object (flag symbol) every 2 minutes using the latest predicted landing coordinates.  The name of the objects 
                will take the form of, YOURCALLSIGN.xx.
            </td>
            <td class="packetlist" id="objectbeaconb" style="text-align: center; white-space: nowrap;">Enable object beaconing: <input type="checkbox" name="objectbeaconing" disabled="disabled" id="objectbeaconing"></td>
        </tr>

        <tr><td class="packetlist" id="beaconingtext9a"><strong>Prepend EOSS to your APRS path</strong> when tracking flights with EOSS.  The system will alway use WIDE1-1,WIDE2-1, but one can optionally can prepend "EOSS" or "EOSSx" to the beginning of that path.  For example, EOSS,WIDE1-1,WIDE2-1. Be mindful not to transmit normal 144.39MHz packets with this option enabled.
<br><u>For satellite operations</u>, select <strong>ARISS</strong>, however, for this to be successful the external radio used for transmissions will need to be tuned to 145.825MHz.
</td>
            <td class="packetlist" id="beaconingtext9b" style="text-align: center; white-space: nowrap;">
            Enable/Disable <input type="checkbox" name="includeeoss" disabled="disabled" id="includeeoss" form="configuration_form" checked onchange="checkEOSS();">
            &nbsp; String: <select form="configuration_form" name="eoss_string" id="eoss_string" disabled="disabled">
                <option value="EOSS" selected="selected">EOSS</option>
                <option value="EOSSA">EOSSA</option>
                <option value="EOSSB">EOSSB</option>
                <option value="EOSSC">EOSSC</option>
                <option value="EOSSD">EOSSD</option>
                <option value="EOSSE">EOSSE</option>
                <option value="EOSSF">EOSSF</option>
                <option value="EOSSG">EOSSG</option>
                <option value="EOSSX">EOSSX</option>
                <option value="ATLA">ATLA</option>
                <option value="COLU">COLU</option>
                <option value="DISC">DISC</option>
                <option value="VOYA">VOYA</option>
                <option value="ARISS">ARISS</option>
            </select>
            </td>
        </tr>

        <tr><td class="packetlist" id="mobiletext1"><strong>Type of Station. </strong>Check this box if this system is on a vehicle or other facility that 
            moves (ex. car, boat, plane, spaceship, etc.).  Selecting this enables APRS "Smart" beaconing and uses the below parameters.  If this system is in a fixed location (ex. 
            a house, building, tower, etc.) then do not select this. </td>
            <td class="packetlist" id="mobiletext2" style="white-space: nowrap; text-align: center;">Mobile station:
                <input type="checkbox" name="mobilestation" id="mobilestation" disabled="disabled" form="configuration_form" checked onchange="checkMobile();"></td>
        </tr> 

		<tr><td class="packetlist" id="beaconingtext1a"><strong>Fast speed threshold</strong>.  For speeds above this value, beacon this frequently.</td>
		    <td class="packetlist" id="beaconingtext1b" style="white-space: nowrap; text-align: center;">Mph <input type="number" form="configuration_form" id="fastspeed" name="fastspeed" required="required" min="1" max="99" placeholder="nn">
		    Mins:secs <input type="text" form="configuration_form" id="fastrate" name="fastrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext2a"><strong>Slow speed threshold</strong>.  For speeds below this value, beacon this frequently.</td>
		    <td class="packetlist" id="beaconingtext2b" style="white-space: nowrap; text-align: center;">Mph <input type="number" form="configuration_form" id="slowspeed" name="slowspeed" required="required" min="1" max="99"  placeholder="nn" onchange="validateSlowSpeed();" oninput="setCustomValidity('');">
		    Mins:secs <input type="text" form="configuration_form" id="slowrate" name="slowrate" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
                <tr><td class="packetlist" id="beaconingtext3a"><strong>Frequency threshold</strong>.  Never beacon more frequently than this.</td>
                    <td class="packetlist" id="beaconingtext3b" style="text-align: center;">Mins:secs <input type="text" form="configuration_form" id="beaconlimit" name="beaconlimit" required="required" size="5" maxlength="5" pattern="([0-5][0-9]|[0-9]):[0-5][0-9]" placeholder="mm:ss">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext4a"><strong>Fast speed direction change threshold</strong>.  For speeds above the fast threshold, beacon when the direction travel changes by at least this many degrees.</td>
		    <td class="packetlist" id="beaconingtext4b" style="text-align: center;">Degrees <input type="number" form="configuration_form" id="fastturn" name="fastturn" required="required" size="5" maxlength="5" min="1" max="359" placeholder="nnn" required="required">
                    </td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext5a"><strong>Slow speed direction change threshold</strong>.  For speeds below the slow threshold, beacon when the direction travel changes by at least this many degrees.</td>
		    <td class="packetlist" id="beaconingtext5b" style="text-align: center;">Degrees <input type="number" form="configuration_form" id="slowturn" name="slowturn" required="required" size="5" maxlength="5" min="1" max="359" placeholder="nnn" required="required">
                    </td>
                </tr>
                <tr>
                    <td colspan=2 class="packetlist-highlight" style="font-size: 1.1em; font-variant: small-caps;">External Radio Connection</td></tr>
		<tr>
		<tr><td class="packetlist" id="beaconingtext6a"><strong>System audio output device</strong>.  Choose the audio device on this system that will be used to output audio to an external radio.  Device 0 is usually the onboard headphone jack.</td>
		    <td class="packetlist" id="beaconingtext6b" style="text-align: center; white-space: nowrap;"><select form="configuration_form" id="audiodev" name="audiodev"></select></td>
                </tr>
		<tr><td class="packetlist" id="beaconingtext7a"><strong>External radio PTT connection</strong>.  Choose the serial device on this system that will be used to trigger the PTT on the external radio. Select "NONE" if using a third party device like SignaLink or VOX on the radio.  See the Dire Wolf User's Guide for details.</td>
		    <td class="packetlist" id="beaconingtext7b" style="text-align: center; white-space: nowrap;">Port: <select form="configuration_form" id="serialport" name="serialport"></select>
			Line Ctrl: <select form="configuration_form" id="serialproto" name="serialproto">
                            <option value="RTS">RTS</option>
                            <option value="-RTS">-RTS</option>
                            <option value="DTR">DTR</option>
                            <option value="-DTR">-DTR</option>
                        </select>
                    </td>
                </tr>
                <tr><td colspan=3 class="packetlist" style="text-align: center; padding: 10px;"><input class="submitbutton" style="font-size: 1.4em;" type="submit" value="Save Settings" onclick="setConfiguration(); return false;">
            <p  style="text-align: center;"><span id="configurationsettings_error2"></span></p>
            </td></tr>

                </table>
                </form>
            </p>
            </div>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>

</body>
</html>
