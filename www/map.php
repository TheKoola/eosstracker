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


    session_start();
    $pagetitle="APRS:  Map";
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include_once $documentroot . '/common/functions.php';
    include_once $documentroot . '/common/logo.php';

    $config = readconfiguration();


    // The followfeatureid HTML GET variable
    $get_followfeatureid = "";
    if (isset($_GET["followfeatureid"]))  
        $get_followfeatureid = check_string($_GET["followfeatureid"], 20);
    if ($get_followfeatureid != "")
        $pagetitle = "APRS:  " .  $get_followfeatureid;

    // The showallstations HTML GET variable
    $get_showallstations = 0;
    if (isset($_GET["showallstations"]))
        if (check_number($_GET["showallstations"], 0, 1))
            $get_showallstations = intval($_GET["showallstations"]);

    // Sanitize the latitude HTML GET variable
    $get_latitude = 0;
    if (isset($_GET["latitude"])) 
        if (check_number($_GET["latitude"], -90, 90))
            $get_latitude = floatval($_GET["latitude"]);

    // Sanitize the longitude HTML GET variable
    $get_longitude = 0;
    if (isset($_GET["longitude"]))
        if (check_number($_GET["longitude"], -180, 180))
            $get_longitude = floatval($_GET["longitude"]);


    // Sanitize the zoom HTML GET variable
    $get_zoom = 0;
    if (isset($_GET["zoom"]))
        if (check_number($_GET["zoom"], 1, 20))
            $get_zoom = intval($_GET["zoom"]);


    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $query = 'select f.flightid, f.description from flights f where f.active = true order by f.flightid desc;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $object = [];
    $output = [];
    $flightlist = [];
    $flightlist = sql_fetch_all($result);
    $numflights = sql_num_rows($result);
    

    while($row = sql_fetch_array($result)) {
        $flightid = $row["flightid"];
        $query2 = 'select fm.callsign from flightmap fm where fm.flightid = $1 order by fm.callsign desc;';
        $result2 = pg_query_params($link, $query2, array($flightid));
        if (!$result2) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        
        $object = [];
        $callsigns = [];
        while ($row2 = sql_fetch_array($result2)) {
            $callsigns[] = $row2["callsign"];
        }
        $object["flightid"] = $flightid;
        $object["callsigns"] = $callsigns;
        $output[] = $object;
    }


    include $documentroot . '/common/header-map.php';

?>
<script>
    /* Set the global variables */
    var flightids = <?php echo json_encode($output); ?>;
    var followfeatureid = "<?php echo $get_followfeatureid; ?>";
    var showallstations = Number("<?php echo $get_showallstations; ?>");
    var latitude = Number("<?php echo $get_latitude; ?>");
    var longitude = Number("<?php echo $get_longitude; ?>");
    var zoom = Number("<?php echo $get_zoom; ?>");
</script>
<script src="/common/map.js"></script>
<script>
    /* Startup the map...*/
    $(document).ready(startup);
</script>

    <!-- this is for the sidebar html -->
    <div id="sidebar" class="sidebar collapsed">

        <!-- Nav tabs -->
        <div class="sidebar-tabs">
            <ul role="tablist">
                <!-- <li><a href="#screenw" role="tab"><span id="screenw"></span></a></li> -->
                <!-- <li><a href="#screenh" role="tab"><span id="screenh"></span></a></li> -->
                <li><a href="#home" role="tab"><img src="/images/graphics/home.png" width="30" height="30"></a></li>
                <li><a href="#profile" role="tab"><img src="/images/graphics/profile.png" width="30" height="30"></a></li>
                <!-- <li><a href="#messages" role="tab"><img src="/images/graphics/messages.png" width="30" height="30"></a></li> -->
<?php
    if ($numflights > 0) {
        foreach ($flightlist as $row){
            list($prefix, $suffix) = explode('-', $row['flightid']);
            printf("<li><div style=\"text-align: center; vertical-align:  middle;\"><strong><a href=\"#%s_sidebar\" role=\"tab\" class=\"flightlink\">%s</a></strong></div></li>", $row['flightid'], $suffix);
        }
    }
?>
            </ul>

            <ul role="tablist">
                <li id="spd" role="hud"><a href="#nothing" role="hud" onclick="toggleSpeed();"><strong>SPD</strong></a></li>
                <li id="hud" role="hud"><a href="#nothing" role="hud" onclick="toggleHUD();"><strong>HUD</strong></a></li>
                <li><a href="#settings" role="tab"><img src="/images/graphics/gear.png" width="30" height="30"></a></li>
            </ul>
        </div> <!-- end of sidebar-tabs -->

        <!-- Tab panes -->
        <div class="sidebar-content">

            <!-- Home sidebar pane -->
            <div class="sidebar-pane" id="home">
                    <h1 class="sidebar-header">Home<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span> </h1>
                <div class="div-table">
                    <p class="logo" style="margin-top:  30px; margin-bottom: 0px;"><?php if (isset($logo)) printf("%s", $logo); else printf("No Logo"); ?></p>
                    <p style="margin-top: 0px; font-size: 1.1em; color:  #0052cc; font-style:  italic; text-shadow: 5px 5px 10px gray; margin-bottom:  30px;">
                        Tracking High Altitude Balloons
                    </p>
                    <p class="section-header" style="text-decoration: underline;">Welcome</p>
                    <p class="lorem">Welcome to the map utilty for the EOSS Tracker application.  From this map screen one can monitor positions of 
                        balloon flights, track where they've been, and find out where they're going.  Have fun!
                    </p>
                </div>
                <div class="div-table" style="margin-top: 30px;">
                    <p class="section-header" style="text-decoration: underline;">Flights</p>
                    <p class="lorem">
                        Active flights are listed within the sidebar on the left-hand side by their flight number and are also listed here.  Select a flight 
                        to show detailed information like altitude, heading, speed, etc..
                    </p>
                    <?php
                        if ($numflights > 0) {
                            printf ("<ul>");
                            foreach ($flightlist as $row) {
                                printf ("<li class=\"lorem\"><a href=\"#%s_sidebar\" onclick=\"opensidebar('%s');\">%s</a>, %s</li>", $row["flightid"], $row["flightid"], $row["flightid"], $row["description"]);
                            }
                            printf ("</ul></p>");
                        }
                        else {
                           printf ("<ul><li class=\"lorem\">No flights are actively being tracked.</li></ul>");

                        }
                    ?>
                </div>
                <div class="div-table" style="margin-top: 30px;">
                    <p class="section-header" style="text-decoration: underline;">System Status</p>
                    <p class="normal" style="margin-bottom: 0px;">Current Status: <span id="systemstatus"></span></p>
                    <p class="normal" style="margin-top: 0px; margin-bottom: 20px;">System Name: &nbsp;  <?php echo $_SERVER["HTTP_HOST"]; ?></p>
                    <div class="table-row">
                        <div class="table-cell header toprow">Process</div>
                        <div class="table-cell header toprow">Status</div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell">direwolf</div>
                        <div class="table-cell"><span id="direwolf-status"></span></div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell">aprsc</div>
                        <div class="table-cell"><span id="aprsc-status"></span></div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell">gpsd</div>
                        <div class="table-cell"><span id="gpsd-status"></span></div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell">backend daemon</div>
                        <div class="table-cell"><span id="habtracker-d-status"></span></div>
                    </div>
                </div>
                <div id="myerror"></div>
            </div>   <!-- end of Home sidebar pane -->

            <!-- profile sidebar pane (the trackers list) -->
            <div class="sidebar-pane" id="profile">
                <h1 class="sidebar-header">Trackers<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span></h1>
                <div class="div-table">
                    <p class="lorem">This tab shows the list of active trackers for the current mission.</p>
                    <p class="section-header">Tracker List</p>
                </div>
                <div id="trackers"></div>
                <div id="newtrackererror"></div>
            </div>  <!-- end of profile sidebar pane -->


            <!-- messages sidebar pane (live packet stream) -->
            <!--
            <div class="sidebar-pane" id="messages">
                <h1 class="sidebar-header">Live Packet Stream<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span></h1>
                <p class="section-header">Live Packet Stream: &nbsp; <span id="livePacketStreamState"><mark style="background-color: red;">off</mark></span></p>
                <p class="lorem">This tab will display all APRS packets received on today's date for a given flight.  
                    Packets are displayed in reverse chronological order with the latest packets on top, oldest on bottom.</p>

                <p class="section-header"><a href="#" class="section-link" id="livePacketFlightSelectionLink">(<span style="color: red;" id="livePacketFlightSelectionSign">-</span>) Select flight</a>:</p>
                <div id="livePacketFlightSelection">
                    <p class="lorem">To start the packet stream, select a flight, then click start.  Once running, the packet display will be automatically updated every 5 seconds.</p>
                    <p><span id="flightsLivePacketStream"></span></p>
                    <p class="section-header"><button name="livepacketstart" id="livepacketstart" >Start</button><button name="livepacketstop" id="livepacketstop">Stop</button></p>
                </div>
 
                <p class="section-header"><a href="#" class="section-link" id="livePacketSearchLink">(<span style="color: red;" id="livePacketSearchSign">-</span>) Search</a>:</p>
                <div id="livePacketSearch">
                    <p class="lorem">Enter search characters to filter the displayed packets.  All searches are case insensitive, so "AAA" is equivalent to "aaa".</p>
                    <p>
                    <input type="text" size="16" maxlength="128" name="searchfield" id="searchfield" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
                    <select id="operation">
                        <option value="and" selected="selected">And</option>
                        <option value="or">Or</option>
                        <option value="not">Not</option>
                    </select>
                    <input type="text" size="16" maxlength="128" name="searchfield2" id="searchfield2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" >
                    </p>
                    <p><button onclick="clearLivePacketFilters();">Clear</button></p>
                </div>
                <p class="section-header">Packets: <mark><span id="packetcount">0</span></mark></p>
                <div class="packetdata"><p class="packetdata"><span id="packetdata"></span></p></div>
            </div> -->  <!-- end of messages sidebar pane -->


            <!-- settings sidebar pane -->
            <div class="sidebar-pane" id="settings">
                <h1 class="sidebar-header">Settings<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span></h1>
                <div class="div-table">
                    <p class="section-header">Global Map Preferences:</p>
                    <p class="lorem">Changes to these settings affect all users and viewers of the map.</p>
                </div>

                <form id="userpreferences" action="preferences.php" name="userpreferences">

                <div class="div-table">
                    <div class="table-row">
                        <div class="table-cell header toprow big">Configuration Item</div>
                        <div class="table-cell header toprow big">Input</div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell" >Lookback Period:<br>
                            <p class="lorem">How far back in time the map will look, when plotting APRS objects and paths.</p>
                        </div>
                        <div class="table-cell">
                             <input type="text" name="lookbackperiod" id="lookbackperiod" size="4" pattern="[0-9]{1,3}" placeholder="nnn"
                                 form="userpreferences" title="from 1 to 999 minutes"> minutes
                        </div>
                    </div>
                    <div class="table-row">
                        <div class="table-cell">Icon Size:<br>
                            <p class="lorem">Changes how large the icons are for APRS objects on the map.</p>
                        </div>
                        <div class="table-cell">
                            <input type="text" name="iconsize" id="iconsize" size="3" maxlength="2" form="userpreferences" pattern="[0-9]{2}" 
                                min="10" max="99"  placeholder="nn" title="from 10 to 99 pixels"> pixels
                        </div>
                    </div>
                    <!--<div class="table-row">
                        <div class="table-cell">Plot tracks:<br>
                            <p class="lorem">Should tracks be displayed for trackers and other mobile APRS stations (tracks are 
                                always plotted for flights).</p>
                        </div>
                        <div class="table-cell">
                            <input type="checkbox" name="plottracks" id="plottracks" checked form="userpreferences">
                        </div>
                    </div> -->
                    <div class="table-row">
                        <div class="table-cell">Use Temperature and Pressure from KC0D Payloads:<br>
                            <p class="lorem">The KC0D payloads have the ability to measure temperature and pressure.  Enabling this option allows the landing prediction 
                                routines to use these values to help improve landing predictions for the KC0D payloads.
                            </p>
                        </div>
                        <div class="table-cell">
                            <input type="checkbox" name="airdensity" id="airdensity" checked form="userpreferences">
                        </div>
                    </div>
                </div>
                <div class="div-table">
                    <input type="submit" class="buttonstyle" value="Save Settings" form="userpreferences" onclick="setConfiguration(); return false;" 
                        style="font-size:  1.2em;"> 
                    &nbsp; 
                    <span id="systemsettings_error" style="background-color: yellow; color: black;"></span>
                </div>


                <div class="div-table" style="margin-top: 30px;">
                    <p class="section-header">System Version: <?php if (isset($version)) printf ("%s", $version); ?></p>
                    <p class="lorem">The EOSS Tracker application is licensed under version 3 of the GNU General Public License 
                        (see <a target="_blank" href="https://www.gnu.org/licenses/">https://www.gnu.org/licenses/</a>).
                    </p>
                    <p class="lorem">Copyright (C) 2019, Jeff Deaton (N6BA), Jeff Shykula (N2XGL)</p>
                </div>

            </div> <!-- end of settings sidebar pane -->

     
    <!-- sidebar panes for each active flight -->
<?php

 if ($numflights > 0) {
    foreach ($flightlist as $row) {
        printf ("<div class=\"sidebar-pane\" id=\"%s\">", $row['flightid'] . "_sidebar");
        printf ("<h1 class=\"sidebar-header\">Flight %s<span class=\"sidebar-close\"><img src=\"/images/graphics/leftcaret.png\" width=\"30\" height=\"30\"></span></h1>", $row['flightid']);

        // Instrument panel
        printf ("<p class=\"section-header\"><a href=\"#instruments\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">-</span>) Instrument Panel</a>:</p>", $row['flightid'] . "_instrumentpanellink", $row['flightid'] . "_instrumentpanelsign");
        printf ("<div id=\"%s\">", $row['flightid'] . "_instrumentpanel");
        printf ("<div class=\"div-table\">");
        printf ("   <div class=\"table-row\">");
        printf ("       <div class=\"panel-cell toprow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div class=\"instrumenttitle\">Altitude</div>");
        printf ("               <div><span id=\"%s\"></span> ft</div>", $row['flightid'] . "_altitudevalue");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_altimeter");
        printf ("           </div>");
        printf ("       </div>");
        printf ("       <div class=\"panel-cell toprow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div class=\"instrumenttitle\">V. Rate</div>");
        printf ("               <div><span id=\"%s\"></span> ft/min</div>", $row['flightid'] . "_verticalratevalue");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_variometer");
        printf ("           </div>");
        printf ("       </div>");
        printf ("   </div>");
        printf ("   <div class=\"table-row\">");
        printf ("       <div class=\"panel-cell bottomrow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_heading");
        printf ("               <div class=\"instrumenttitle bottomrow\">Heading</div>");
        printf ("               <div><span id=\"%s\">--</span>&#176;</div>", $row['flightid'] . "_headingvalue");
        printf ("           </div>");
        printf ("       </div>");
        printf ("       <div class=\"panel-cell bottomrow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_airspeed");
        printf ("               <div class=\"instrumenttitle bottomrow\">Speed</div>");
        printf ("               <div><span id=\"%s\"></span> mph</div>", $row['flightid'] . "_speedvalue");
        printf ("           </div>");
        printf ("       </div>");
        printf ("   </div>");
        printf ("</div>");
        printf ("<div class=\"div-table\">");
        printf ("   <div class=\"table-row\">");
        printf ("       <div class=\"panel-cell\">");
        printf ("           <div style=\"margin: 5px;\">Time to live: &nbsp; <span id=\"%s\">n/a</span></div>", $row['flightid'] . "_ttl");
        printf ("       </div>");
        printf ("   </div>");
        printf ("</div>");
        printf ("</div>");

        // Relative position section
        printf ("<p class=\"section-header\"><a href=\"#relative\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Relative Position</a>: </p>", $row['flightid'] . "_relativepositionlink", $row['flightid'] . "_relativepositionsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_relativeposition");
        printf ("<div class=\"div-table\">");
        printf ("   <div class=\"table-row\">");
        printf ("       <div class=\"panel-cell toprow bottomrow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div>&nbsp;</div>");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_relativeelevationangle");
        printf ("               <div class=\"instrumenttitle\">Elev Angle</div>");
        printf ("               <div>Angle: <span id=\"%s\">--</span>&#176;</div>", $row['flightid'] . "_relativeelevationanglevalue");
        printf ("           </div>");
        printf ("       </div>");
        printf ("       <div class=\"panel-cell toprow bottomrow\">");
        printf ("           <div style=\"margin: 5px;\">");
        printf ("               <div class=\"instrumenttitle\">My Hdng</div>");
        printf ("               <div>My Hdng: <span id=\"%s\">--</span>&#176;</div>", $row['flightid'] . "_myheadingvalue");
        printf ("               <div id=\"%s\"></div>", $row['flightid'] . "_relativebearing");
        printf ("               <div class=\"instrumenttitle bottomrow\">R. Brng</div>");
        printf ("               <div>R. Brng: <span id=\"%s\">--</span>&#176;</div>", $row['flightid'] . "_relativebearingvalue");
        printf ("           </div>");
        printf ("       </div>");
        printf ("   </div>");
        printf ("</div>");
        printf ("    <div class=\"div-table\">");
        printf ("        <div class=\"table-row\">");
        printf ("            <div class=\"table-cell header toprow\">Distance To Balloon</div>");
        printf ("            <div class=\"table-cell header toprow\">Balloon Coords</div>");
        printf ("        </div>");
        printf ("        <div class=\"table-row\">");
        printf ("            <div class=\"table-cell big\"><mark><span id=\"%s\"></span></mark></div>", $row['flightid'] . "_relativepositiondistance");
        printf ("            <div class=\"table-cell big\"><mark><span id=\"%s\"></span></mark></div>", $row['flightid'] . "_relativeballooncoords");
        printf ("        </div>");
        printf ("    </div>");
        printf ("</div>");

        // Lastest position packets section
        printf ("<p class=\"section-header\"><a href=\"#positions\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Most Recent Position Packets</a>:</p>", $row['flightid'] . "_positionpacketlistlink", $row['flightid'] . "_positionpacketlistsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_positionpacketlist");
        printf ("    <div class=\"div-table\">");
        printf ("        <div class=\"table-row\">");
        printf ("            <div class=\"table-cell header toprow\">Time</div>");
        printf ("            <div class=\"table-cell header toprow\">Callsign</div>");
        printf ("            <div class=\"table-cell header toprow\">Speed</div>");
        printf ("            <div class=\"table-cell header toprow\">V. Rate</div>");
        printf ("            <div class=\"table-cell header toprow\">Altitude</div>");
        printf ("        </div>");
        for ($i = 0; $i < 5; $i++) {
            printf ("        <div class=\"table-row\">");
            printf ("            <div class=\"table-cell\"><span id=\"%s_lasttime_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\"><span id=\"%s_lastcallsign_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\"><span id=\"%s_lastspeed_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\"><span id=\"%s_lastvertrate_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\"><span id=\"%s_lastaltitude_%d\"></span></div>", $row['flightid'], $i);
            printf ("        </div>");
        }
        printf ("    </div>");
        printf ("</div>");

        // Lastest status packets section
        printf ("<p class=\"section-header\"><a href=\"#status\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Most Recent Status Packets</a>:</p>", $row['flightid'] . "_statuspacketlistlink", $row['flightid'] . "_statuspacketlistsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_statuspacketlist");
        printf ("    <div class=\"div-table\">");
        printf ("        <div class=\"table-row\">");
        printf ("            <div class=\"table-cell header toprow\">Time</div>");
        printf ("            <div class=\"table-cell header toprow\">Callsign</div>");
        printf ("            <div class=\"table-cell header toprow\" style=\"text-align: center;\">Packet</div>");
        printf ("        </div>");
        for ($i = 0; $i < 5; $i++) {
            printf ("        <div class=\"table-row\">");
            printf ("            <div class=\"table-cell\"><span id=\"%s_statustime_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\"><span id=\"%s_statuscallsign_%d\"></span></div>", $row['flightid'], $i);
            printf ("            <div class=\"table-cell\" style=\"word-break: break-all;\"><span id=\"%s_statuspacket_%d\"></span></div>", $row['flightid'], $i);
            printf ("        </div>");
        }
        printf ("    </div>");
        printf ("</div>");

        // Lastest packet path section
        printf ("<p class=\"section-header\"><a href=\"#lastpacketpath\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Latest Packet Receive Path</a>:</p>", $row['flightid'] . "_lastpacketpathlink", $row['flightid'] . "_lastpacketpathsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_lastpacketpath");
        printf ("<div id=\"%s\">", $row['flightid'] . "_lastpacketpathdata");
?>
        <div class="div-table">
            <div class="table-row">
                <div class="table-cell header toprow">Callsign</div>
                <div class="table-cell header toprow">Receive Time</div>
                <div class="table-cell header toprow">Last 10 Packets</div>
            </div>
            <div class="table-row">
                <div class="table-cell">n/a</div>
               <div class="table-cell"></div>
               <div class="table-cell"></div>
            </div>
        </div>
    </div>
    <div>
        <p>
        <strong>Legend:</strong> &nbsp; newest-----&gt;oldest<br> 
            <span style="font-family: monospace; font-size: 1.4em;"><mark style="background-color: lightgreen;">R</mark></span>
              - packet received over RF<br>
            <span style="font-family: monospace; font-size: 1.4em;"><mark style="background-color: yellow;">I</mark></span>
             - packet received over the Internet
         </p>
         <p>Note: receive path is for position packets only.</p>
    </div>


<?php
        printf ("</div>"); // end of packet path section

        // Altitude Chart
        printf ("<p class=\"section-header\"><a href=\"#altitude\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Altitude Chart</a>:</p>", $row['flightid'] . "_altitudechartlink", $row['flightid'] . "_altitudechartsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_altitudechart");
        printf ("</div>");

        // Vertical Rate Chart
        printf ("<p class=\"section-header\"><a href=\"#vertical\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Vertical Rate Chart</a>:</p>", $row['flightid'] . "_verticalchartlink", $row['flightid'] . "_verticalchartsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_verticalchart");
        printf ("</div>");

        // the error DIV
        printf ("<div style=\"float: left;\" id=\"error-%s\"></div>", $row['flightid']);
        printf ("</div>");
    }
 }
?>
        </div> <!-- end of sidebar content -->

    </div> <!-- end of sidebar -->

    <div class="map" id="map"></div>
<?php
    //include $documentroot . '/common/footer.php';
    sql_close($link);
?>
</body>
</html>
