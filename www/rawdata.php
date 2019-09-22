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
$pagetitle="APRS:  Data";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';
$config = readconfiguration();
?>
<script src="/common/rawdata.js"></script>
<script>
    // startup the page...
    $(document).ready(rawdata_startup);
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Data Downloads
            </p>
            <p class="normal-black">
                Download a variety of data sets for a selected date and time range.
            </p>
            <p class="normal-black"><span id="data_download_error"></span></p>
            <p class="normal-black">
                <form name="data_download_form" id="data_download_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Data Selection</th><th class="packetlistheader">Beginning Date/Time</th><th class="packetlistheader">Ending Date/Time</th></tr>
		<tr><td class="packetlist">
                    <input type="submit" form="data_download_form" onclick="downloadData(); return false;" value="Download">
                    </td> 
                    <td class="packetlist">
                        <select form="data_download_form" id="data_type_selection">
                        </select>
                    </td>
            <td class="packetlist"><input type="text"  form="data_download_form" name="data_beginning" id="data_beginning" placeholder="mm/dd/yyyy HH:MM:SS" 
                autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" title="enter date/time value using, mm/dd/yyyy HH:MM:SS"></td>
            <td class="packetlist"><input type="text"  form="data_download_form" name="data_ending" id="data_ending" placeholder="mm/dd/yyyy HH:MM:SS" 
                autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" title="enter date/time value using, mm/dd/yyyy HH:MM:SS"></td>
                </tr>
                </table>
                </form>
            </p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Charts and Graphs
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
            <!-- APRS-IS Packet Source chart -->
            <p class="normal-black" style="margin: 5px; margin-top: 15px; text-align: center; font-size: 1.1em;"><a href="#c1" class="normal-link-black" id="c1-link">(<span style="color: red;" id="c1-sign">+</span>) APRS-IS Packet Source</a></p>
            <div id="c1-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                These packet counts show from what source a given packet was discovered (Internet vs. RF).  For example, 
                the RF packet count shows the number of packets that were heard over RF that were <strong>not</strong> already known 
                through an APRS-IS connection - it's a subtle distinction not to be confused with absolute packet counts <strong>heard</strong> over an RF channel.
            </p></div>
            <div id="chart1"></div>

            <!-- RF Packet Counts chart -->
            <p class="normal-black" style="margin: 5px;  margin-top: 15px;text-align: center; font-size: 1.1em;"><a href="#c3" class="normal-link-black" id="c3-link">(<span style="color: red;" id="c3-sign">+</span>) RF Packet Counts</a></p>
            <div id="c3-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                This chart shows total RF packet count (every packet decoded by Dire Wolf) for each SDR/Frequency combination currently running.  
                These statistics are only available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
            </p></div>
            <div id="chart3"></div>

            <!-- Digipeated Packet Counts chart -->
            <p class="normal-black" style="margin: 5px;  margin-top: 15px;text-align: center; font-size: 1.1em;"><a href="#c6" class="normal-link-black" id="c6-link">(<span style="color: red;" id="c6-sign">+</span>) Digipeated Packet Counts</a></p>
            <div id="c6-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                This chart shows total number of APRS packets that have been digipeated by each active flight beacon.  These statistics are only 
                available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
            </p></div>
            <div id="chart6"></div>


            <!-- Heading vs. Altitude chart -->
            <p class="normal-black" style="margin: 5px;  margin-top: 15px;text-align: center; font-size: 1.1em;"><a href="#c4" class="normal-link-black" id="c4-link">(<span style="color: red;" id="c4-sign">+</span>) Heading Variability vs. Altitude</a></p>
            <div id="c4-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                This chart shows the varibility in beacon heading vs. altitude.  The idea is that a wide distribution of values indictes a large amount of "wobble" from 
                a beacon's perspective being on the flight string.  Only packets from beacons on active flights are displayed.
            </p></div>
            <div id="chart4"></div>

            <!-- Vertical Rate vs. altitude chart -->
            <p class="normal-black" style="margin: 5px; margin-top: 15px; text-align: center; font-size: 1.1em;"><a href="#c5" class="normal-link-black" id="c5-link">(<span style="color: red;" id="c5-sign">+</span>) Vertical Rate vs. Altitude</a></p>
            <div id="c5-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                This chart shows the vertical rate (ft/min) compared to the altitude for each beacon from each active flight.  
            </p></div>
            <div id="chart5"></div>


            <!-- Flight speed vs. altitude chart -->
            <p class="normal-black" style="margin: 5px; margin-top: 15px; text-align: center; font-size: 1.1em;"><a href="#c2" class="normal-link-black" id="c2-link">(<span style="color: red;" id="c2-sign">+</span>) Flight Speed vs. Altitude</a></p>
            <div id="c2-elem" style="display: none; margin: 5px;"><p class="normal-italic" style="margin: 0; margin-right: 80px; margin-left: 80px; text-align: center;">
                This chart displays the average speed of a flight, as reported through APRS packets, for each 5000ft altitude strata.  
                Although not perfectly correlated (flight speed vs. wind speed), it can provide a general indicator as to wind strength at higher altitude levels.  
                Altitude values for a flight are rounded to the nearest 5000ft.  For example, a speed value at an altitude of 33,000ft would be counted with the 35,000ft point.
            </p></div>
            <div id="chart2"></div>


            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Live APRS Packets
            </p>
            <p class="normal-black">
                <span id="flights"></span>
            </p>
            <p class="normal-black">
               Search:  
               <input type="text" size="20" maxlength="128" name="searchfield" id="searchfield" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <select id="operation">
                   <option value="and" selected="selected">And</option>
                   <option value="or">Or</option>
                   <option value="not">Not</option>
               </select>
               <input type="text" size="20" maxlength="128" name="searchfield2" id="searchfield2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <button onclick="clearfields();">Clear</button>
            </p>
            <p class="normal-black">
                Number of Packets: 
                <mark><span id="packetcount"></span></mark>
            </p>
            <div class="packetdata"><pre class="packetdata"><span id="packetdata"></span></pre></div>
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
