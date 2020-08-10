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
$pagetitle="APRS:  Data";
if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
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

<!-- Download data section -->
<p class="header">
    <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
    Data Downloads
</p>
<p>
    Download a variety of data sets for a selected date and time range.
</p>
<p><span id="data_download_error"></span></p>
<form name="data_download_form" id="data_download_form">
    <div class="div-table">
        <div class="table-row">
            <div class="table-cell header toprow">Action</div>
            <div class="table-cell header toprow">Data Selection</div>
            <div class="table-cell header toprow">Beginning Date/Time</div>
            <div class="table-cell header toprow">Ending Date/Time</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="padding: 5px;">
                <input type="submit" class="submitbutton" form="data_download_form" onclick="return downloadData();" value="Download">
            </div>
            <div class="table-cell" style="padding: 5px;"><select form="data_download_form" id="data_type_selection"></select></div>
            <div class="table-cell" style="padding: 5px;">
                <input type="text"  form="data_download_form" name="data_beginning" id="data_beginning" placeholder="mm/dd/yyyy HH:MM:SS" 
                    autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                    pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" 
                    title="enter date/time value using, mm/dd/yyyy HH:MM:SS">
            </div>
            <div class="table-cell" style="padding: 5px;">
                <input type="text"  form="data_download_form" name="data_ending" id="data_ending" placeholder="mm/dd/yyyy HH:MM:SS" 
                    autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                    pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" 
                    title="enter date/time value using, mm/dd/yyyy HH:MM:SS">
            </div>
        </div>
    </div>
</form>

<!-- Charts and graphs section -->
<p class="header" style="clear:  none;">
    <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
    Charts and Graphs
<?php 
    # Display the lookback period (which is set on the map page, btw).
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", 
        $config["lookbackperiod"] / 60, 
        (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60); 
?>
</p>

<!-- Packet count charts -->
<p class="subheader"><a href="#c1" class="subheader" id="c1-link">(<span style="color: red;" id="c1-sign">+</span>) Packet Counts</a></p>
<div id="c1-elem" style="display: none; margin: 5px; margin-bottom: 15px;">
    <p class="normal-italic">
       <strong> APRS-IS Packet Source: </strong>
       These packet counts show from what source a given packet was discovered (Internet vs. RF).  For example, 
       the RF packet count shows the number of packets that were heard over RF that were <strong>not</strong> already known 
       through an APRS-IS connection - it's a subtle distinction not to be confused with absolute packet counts 
       <strong>heard</strong> over an RF channel.
    </p>
    <br>
    <p class="normal-italic">
       <strong>RF Packet Counts: </strong>
       This chart shows total RF packet count (every packet decoded by Dire Wolf) for each frequency being listened too.
    </p>
</div>
<div class="inverted" id="chart1" style="float: left;"></div>
<div class="inverted" id="chart3" style="margin-bottom: 15px; float: left;"></div>

<!-- KC0D Payload Environmentals Data -->
<p class="subheader"><a href="#c2" class="subheader" id="c2-link">(<span style="color: red;" id="c2-sign">+</span>) KC0D Payload Environmentals</a></p>
<div id="c2-elem" style="display: none; margin: 5px;">
    <p class="normal-italic">
       These charts show the air density (kg/m<sup>3</sup>), temperature (F), and pressure (atm) as measured by KC0D payloads on the flight string.
    </p>
</div>
<!-- KC0D Payload air density Chart -->
<div class="inverted" style="float:left;">
    <div class="inverted" style="float:left;" id="chart2"></div>
    <div class="inverted" style="text-align: center;" id="chart2-buttons">
        <p class="subheader" style="text-align: center; margin: 0px; margin-top: 5px; color: #f8f8f8;">
        <input type="checkbox" id="chart2-ascent" checked onchange='chart2.toggle(getSeries(chart2, "Ascent" ), {withLegend: true});'> Ascent
        &nbsp;
        <input type="checkbox" id="chart2-descent" checked onchange='chart2.toggle(getSeries(chart2, "Descent"), {withLegend: true});'> Descent
        </p>
    </div>
</div>

<!-- KC0D Payload Temp & Pressure Chart -->
<div class="inverted" style="float:left;">
    <div class="inverted" style="text-align: center;" id="chart4"></div>
    <div class="inverted" style="text-align: center;" id="chart4-buttons">
        <p class="subheader" style="text-align: center; margin: 0px; margin-top: 5px; color: #f8f8f8;">
        <input type="checkbox" id="chart4-ascent" checked onchange='chart4.toggle(getSeries(chart4, "Ascent" ), {withLegend: true});'> Ascent
        &nbsp;
        <input type="checkbox" id="chart4-descent" checked onchange='chart4.toggle(getSeries(chart4, "Descent"), {withLegend: true});'> Descent
        </p>
    </div>
</div>


<div style="margin-top: 20px; margin-bottom: 20px; float; none; clear: both;"> &nbsp; 
    <div><p id="chart4-output"></p></div>

</div>


<!-- Live packets section -->
<p class="header">
    <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
    Live APRS Packets
</p>


<!-- The flight selection table -->
<div class="div-table">
    <div class="table-row">
        <div class="table-cell header toprow">Select Flight:</div>
    </div>
    <div class="table-row">
        <div class="table-cell" style="font-size: 1em;"><span id="flights"></span></div>
    </div>
    <div class="table-row">
        <div class="table-cell header">Search Criteria:</div>
    </div>
    <div class="table-row">
        <div class="table-cell" style="padding: 5px;">
           <div style="float: left; margin-left: 5px;">
               <input type="text" size="20" maxlength="128" name="searchfield" id="searchfield" 
                   autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
           </div>
           <div style="float: left; margin-left: 5px;">
               <select id="operation">
                   <option value="and" selected="selected">And</option>
                   <option value="or">Or</option>
                   <option value="not">Not</option>
               </select>
               <input type="text" size="20" maxlength="128" name="searchfield2" id="searchfield2" 
                   autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
           </div>
           <div style="float: left; margin-left: 5px;">
               <button class="graybutton" type="button" value="Clear" onclick="return clearfields();">Clear</button>
           </div>
        </div>
    </div>
</div>

<!-- Packet display section -->
<p class="packetdata-header">
    Number of Packets: 
    <mark><span id="packetcount"></span></mark>
</p>
<div class="packetdata"><pre class="packetdata"><span id="packetdata"></span></pre></div>

<?php
    include $documentroot . '/common/footer.php';
?>

</body>
</html>
