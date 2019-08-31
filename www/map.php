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
    $pagetitle="APRS:  Map";
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
    if (isset($_GET["showallstations"]))
        $get_showallstations = 1;
    else
        $get_showallstations = 0;
    
    // Sanitize the latitude HTML GET variable
    $get_latitude = "";
    if (isset($_GET["latitude"])) 
        if (check_number($_GET["latitude"], -90, 90))
            $get_latitude = floatval($_GET["latitude"]);

    // Sanitize the longitude HTML GET variable
    $get_longitude = "";
    if (isset($_GET["longitude"]))
        if (check_number($_GET["longitude"], -180, 180))
            $get_longitude = floatval($_GET["longitude"]);


    // Sanitize the zoom HTML GET variable
    $get_zoom = "";
    if (isset($_GET["zoom"]))
        if (check_number($_GET["zoom"], 1, 20))
            $get_zoom = intval($_GET["zoom"]);


    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $query = 'select f.flightid from flights f where f.active = true order by f.flightid desc;';
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
    var showallstations = "<?php echo $get_showallstations; ?>";
    var latitude = "<?php echo $get_latitude; ?>";
    var longitude = "<?php echo $get_longitude; ?>";
    var zoom = "<?php echo $get_zoom; ?>";
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
                <li><a href="#home" role="tab"><img src="/images/graphics/home.png" width="30" height="30"></a></li>
                <li><a href="#profile" role="tab"><img src="/images/graphics/profile.png" width="30" height="30"></a></li>
                <li><a href="#messages" role="tab"><img src="/images/graphics/messages.png" width="30" height="30"></a></li>
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
                <li><a href="#settings" role="tab"><img src="/images/graphics/gear.png" width="30" height="30"></a></li>
            </ul>
        </div>

        <!-- Tab panes -->
        <div class="sidebar-content">
            <div class="sidebar-pane" id="home">
                <h1 class="sidebar-header">Home<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span> </h1>
                <p class="logo" style="margin-top:  30px; margin-bottom: 0px;"><?php if (isset($logo)) printf("%s", $logo); else printf("No Logo"); ?><br>
                </p>
                <p style="margin-top: 0px; font-size: 1.1em; color:  #0052cc; font-style:  italic; text-shadow: 5px 5px 10px gray; margin-bottom:  30px;">Tracking High Altitude Balloons</p>
                <p class="lorem">Welcome to the map utilty for the EOSS Tracker application.  From these screens one can monitor positions of APRS objects and their repsective paths.</p>
                <p class="section-header">System: &nbsp;  <?php echo $_SERVER["HTTP_HOST"]; ?>
                    <br>System Status: <span id="systemstatus"></span></p>
                <table class="packetlist">
                    <tr><td class="packetlistheader">Process</td><td class="packetlistheader">Status</td></tr>
                    <tr><td class="packetlist">direwolf</td><td class="packetlist"><span id="direwolf-status"></span></td></tr>
                    <tr><td class="packetlist">aprsc</td><td class="packetlist"><span id="aprsc-status"></span></td></tr>
                    <tr><td class="packetlist">gpsd</td><td class="packetlist"><span id="gpsd-status"></span></td></tr>
                    <tr><td class="packetlist">backend daemon</td><td class="packetlist"><span id="habtracker-d-status"></span></td></tr>
                </table>
                <div><span id="myerror"></span></div>
            </div>

            <div class="sidebar-pane" id="profile">
                <h1 class="sidebar-header">Trackers<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span></h1>
                <p class="lorem">This tab shows the list of active trackers for the current mission.</p>
                <p class="section-header">Tracker List</p>

                <div id="trackers">
                </div>
                <div id="newtrackererror"></div>

            </div>
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
            </div>

            <div class="sidebar-pane" id="settings">
                <h1 class="sidebar-header">Settings<span class="sidebar-close"><img src="/images/graphics/leftcaret.png" width="30" height="30"></span></h1>
                <p class="section-header">Global Map Preferences:</p>
                <p class="lorem">Changes to these settings affect all users and viewers of the map.</p>
                <form id="userpreferences" action="preferences.php" name="userpreferences">
                <table cellpadding=5 cellspacing=0 border=0 class="preferencestable">
		    <tr><td style="vertical-align:  top;">Lookback Period:<br><p class="lorem">How far back in time the map will look, when plotting APRS objects and paths.</p></td><td style="vertical-align:  top; white-space: nowrap;"><input type="text" name="lookbackperiod" id="lookbackperiod" size="4" pattern="[0-9]{1,3}" placeholder="nnn"  form="userpreferences" title="from 1 to 999 minutes"> minutes</td></tr>
                    <tr><td style="vertical-align:  top;">Icon Size:<br><p class="lorem">Changes how large the icons are for APRS objects on the map.</p></td><td style="vertical-align:  top; white-space: nowrap;"><input type="text" name="iconsize" id="iconsize" size="3" maxlength="2" form="userpreferences" pattern="[0-9]{2}" min="10" max="99"  placeholder="nn" title="from 10 to 99 pixels"> pixels</td></tr>
                    <tr><td style="vertical-align:  top;">Plot tracks:<br><p class="lorem">Should tracks be displayed for trackers and other mobile APRS stations (tracks are always plotted for flights).</p></td><td style="vertical-align:  top;"><input type="checkbox" name="plottracks" id="plottracks" checked form="userpreferences"></td></tr>
                    <tr><td colspan=2><input type="submit" class="buttonstyle" value="Save Settings" form="userpreferences" onclick="setConfiguration(); return false;" style="font-size:  1.2em;"> &nbsp; <span id="systemsettings_error" style="background-color: yellow; color: black;"></span></td></tr>
                </table>
                </p>
                <div style="position: absolute; bottom: 10px; width: 360px;">
                    <p class="section-header">System Version: <?php if (isset($version)) printf ("%s", $version); ?></p>
                    <p class="lorem">The EOSS Tracker application is licensed under version 3 of the GNU General Public License (see <a target="_blank" href="https://www.gnu.org/licenses/">https://www.gnu.org/licenses/</a>).
     </p>
                    <p class="lorem">Copyright (C) 2019, Jeff Deaton (N6BA), Jeff Shykula (N2XGL)</p>
                </div>
            </div>

<?php

 if ($numflights > 0) {
    foreach ($flightlist as $row) {
        printf ("<div class=\"sidebar-pane\" id=\"%s\">", $row['flightid'] . "_sidebar");
        printf ("<h1 class=\"sidebar-header\">Flight %s<span class=\"sidebar-close\"><img src=\"/images/graphics/leftcaret.png\" width=\"30\" height=\"30\"></span></h1>", $row['flightid']);

        // Instrument panel
        printf ("<p class=\"section-header\"><a href=\"#instruments\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">-</span>) Instrument Panel</a>:</p>", $row['flightid'] . "_instrumentpanellink", $row['flightid'] . "_instrumentpanelsign");
        printf ("<div id=\"%s\">", $row['flightid'] . "_instrumentpanel");
        printf ("<div class=\"instrumentpanel\">");
        printf ("   <div class=\"column\">");
        printf ("       <div class=\"rowtop\">");
        printf ("           <center><div class=\"readouttop\"><p class=\"instrumentvalue\"><span id=\"%s\"></span> ft</p></div></center>", $row['flightid'] . "_altitudevalue");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_altimeter");
        printf ("       </div>");
        printf ("       <div class=\"rowbottom\">");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_heading");
        printf ("           <center><div class=\"readoutbottom\"><p class=\"instrumentvalue\"><span id=\"%s\">--</span>&#176;</p></div></center>", $row['flightid'] . "_headingvalue");
        printf ("       </div>");
        printf ("   </div>");
        printf ("   <div class=\"column\">");
        printf ("       <div class=\"rowtop\">");
        printf ("           <center><div class=\"readouttop\"><p class=\"instrumentvalue\"><span id=\"%s\"></span> ft/min</p></div></center>", $row['flightid'] . "_verticalratevalue");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_variometer");
        printf ("       </div>");
        printf ("       <div class=\"rowbottom\">");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_airspeed");
        printf ("           <center><div class=\"readoutbottom\"><p class=\"instrumentvalue\"><span id=\"%s\"></span> mph</p></div></center>", $row['flightid'] . "_speedvalue");
        printf ("       </div>");
        printf ("   </div>");
        printf ("</div>");
        printf ("   <div class=\"ttlcontainer\"><div class=\"ttl\">Time to live: &nbsp; <span class=\"ttlvalue\" id=\"%s\">n/a mins</span></div></div>", $row['flightid'] . "_ttl");
        printf ("</div>");

        // Relative position section
        printf ("<p class=\"section-header\"><a href=\"#relative\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Relative Position</a>: </p>", $row['flightid'] . "_relativepositionlink", $row['flightid'] . "_relativepositionsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_relativeposition");
        printf ("<div class=\"lowerinstrumentpanel\">");
        printf ("   <div class=\"column\" style=\"height: 235px;\">");
        printf ("       <div class=\"rowtop\" style=\"padding-top: 3px;\">");
        printf ("           <center><div class=\"readouttop\"><p class=\"instrumentvalue\">&nbsp;</p></div></center>");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_relativeelevationangle");
        printf ("           <center><div class=\"readoutbottom\"><p class=\"instrumentvalue\">Angle: <span id=\"%s\">--</span>&#176;</p></div></center>", $row['flightid'] . "_relativeelevationanglevalue");
        printf ("       </div>");
        printf ("   </div>");
        printf ("   <div class=\"column\" style=\"height: 235px;\">");
        printf ("       <div class=\"rowtop\" style=\"padding-top:  3px;\">");
        printf ("           <center><div class=\"readouttop\"><p class=\"instrumentvalue\">Hdng: <span id=\"%s\">--</span>&#176;</p></div></center>", $row['flightid'] . "_myheadingvalue");
        printf ("           <center><span id=\"%s\"></span></center>", $row['flightid'] . "_relativebearing");
        printf ("           <center><div class=\"readoutbottom\"><p class=\"instrumentvalue\">Brng: <span id=\"%s\">--</span>&#176;</p></div></center>", $row['flightid'] . "_relativebearingvalue");
        printf ("       </div>");
        printf ("   </div>");
//        printf ("   <center><div class=\"readoutbottom\" style=\"width: 360px;\"><p class=\"instrumentvalue\" style=\"width:  360px;\">Distance: <span id=\"%s\"></span> &nbsp; B. Coords: <span id=\"%s\"</span></p></div></center>", $row['flightid'] . "_relativepositiondistance", $row['flightid'] . "_relativeballooncoords");
        printf ("</div>");
        printf ("    <table class=\"packetlistpanel\" style=\"width:  360px;\">");
        printf ("        <tr><td class=\"packetlistheaderpanel\">Distance To Balloon</td>");
        printf ("            <td class=\"packetlistheaderpanel\">Balloon Coords</td>");
        printf ("        <tr><td class=\"packetlistpanel\"><mark><span id=\"%s\"</span></mark></td>", $row['flightid'] . "_relativepositiondistance");
        printf ("            <td class=\"packetlistpanel\"><mark><span id=\"%s\"</span></mark></td>", $row['flightid'] . "_relativeballooncoords");
        printf ("        </tr>");
        printf ("    </table>");
        printf ("</div>");

        // Lastest position packets section
        printf ("<p class=\"section-header\"><a href=\"#positions\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Most Recent Position Packets</a>:</p>", $row['flightid'] . "_positionpacketlistlink", $row['flightid'] . "_positionpacketlistsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_positionpacketlist");
        printf ("    <table class=\"packetlist\">");
        printf ("        <tr><td class=\"packetlistheader\">Time</td>");
        printf ("            <td class=\"packetlistheader\">Callsign</td>");
        printf ("            <td class=\"packetlistheader\">Speed</td>");
        printf ("            <td class=\"packetlistheaderright\">V. Rate</td>");
        printf ("            <td class=\"packetlistheaderright\">Altitude</td></tr>");
        for ($i = 0; $i < 5; $i++) {
            printf ("        <tr><td class=\"packetlist\"><span id=\"%s_lasttime_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlist\"><span id=\"%s_lastcallsign_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlist\"><span id=\"%s_lastspeed_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlistright\"><span id=\"%s_lastvertrate_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlistright\"><span id=\"%s_lastaltitude_%d\"</span></td>", $row['flightid'], $i);
            printf ("        </tr>");
        }
        printf ("    </table>");
        printf ("</div>");

        // Lastest status packets section
        printf ("<p class=\"section-header\"><a href=\"#status\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Most Recent Status Packets</a>:</p>", $row['flightid'] . "_statuspacketlistlink", $row['flightid'] . "_statuspacketlistsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_statuspacketlist");
        printf ("    <table class=\"packetlist\" style=\"width: 100%%; table-layout: auto;\">");
        printf ("        <tr><td class=\"packetlistheader\" style=\"width: 1%%;\">Time</td>");
        printf ("            <td class=\"packetlistheader\" style=\"width: 1%%;\">Callsign</td>");
        printf ("            <td class=\"packetlistheader\" style=\"width: 1%%;\">Packet</td>");
        for ($i = 0; $i < 5; $i++) {
            printf ("        <tr><td class=\"packetlist\" style=\"width: 1%%;\"><span id=\"%s_statustime_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlist\" style=\"width: 1%%;\"><span id=\"%s_statuscallsign_%d\"</span></td>", $row['flightid'], $i);
            printf ("            <td class=\"packetlist\" style=\"width: 100%%; white-space: normal;\"><span id=\"%s_statuspacket_%d\"</span></td>", $row['flightid'], $i);
            printf ("        </tr>");
        }
        printf ("    </table>");
        printf ("</div>");

        // Lastest packet path section
        printf ("<p class=\"section-header\"><a href=\"#lastpacketpath\" class=\"section-link\" id=\"%s\">(<span style=\"color: red;\" id=\"%s\">+</span>) Latest Packet Receive Path</a>:</p>", $row['flightid'] . "_lastpacketpathlink", $row['flightid'] . "_lastpacketpathsign");
        printf ("<div id=\"%s\" style=\"display: none;\">", $row['flightid'] . "_lastpacketpath");
?>
    <table class="packetlist" style="width: auto;">
    <tr><td class="packetlistheader" style="white-space: nowrap;">Callsign</td>
        <td class="packetlistheader" style="white-space: nowrap;">Receive Time</td>
        <td class="packetlistheader" style="white-space: nowrap;">Last 10 Packets</td>
    </tr>
    <tr><td class="packetlist">n/a</td>
        <td class="packetlist"></td>
        <td class="packetlist"></td>
    </tr>
    <tr><td class="packetlist" colspan="3">
        <strong>Legend:</strong> &nbsp; newest-----&gt;oldest<br> 
            <span style="font-family: monospace; font-size: 1.4em;"><mark style="background-color: lightgreen;">R</mark></span>
              - packet received over RF<br>
            <span style="font-family: monospace; font-size: 1.4em;"><mark style="background-color: yellow;">I</mark></span>
             - packet received over the Internet
         </td>
    </tr>
    </table>


<?php
        printf ("</div>");

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
        </div>
    </div>
    <div class="map" id="map"></div>
<?php
    //include $documentroot . '/common/footer.php';
    sql_close($link);
?>
</body>
</html>
