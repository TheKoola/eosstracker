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
            <div class="table-header-cell">Action</div>
            <div class="table-header-cell" style="border-left: none;">Data Selection</div>
            <div class="table-header-cell" style="border-left: none;">Beginning Date/Time</div>
            <div class="table-header-cell" style="border-left: none;">Ending Date/Time</div>
        </div>
        <div class="table-row">
            <div class="table-cell" style="border-top: none;">
                <input type="submit" class="submitbutton" form="data_download_form" onclick="return downloadData();" value="Download">
            </div>
            <div class="table-cell" style="border-top: none; border-left: none;"><select form="data_download_form" id="data_type_selection"></select></div>
            <div class="table-cell" style="border-top: none; border-left: none;">
                <input type="text"  form="data_download_form" name="data_beginning" id="data_beginning" placeholder="mm/dd/yyyy HH:MM:SS" 
                    autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                    pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" 
                    title="enter date/time value using, mm/dd/yyyy HH:MM:SS">
            </div>
            <div class="table-cell" style="border-top: none; border-left: none;">
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

<!-- Packet counts table for active beacons -->
<p class="subheader"><a href="#t1" class="subheader" id="t1-link">(<span style="color: red;" id="t1-sign">+</span>) Beacon Packet Counts</a></p>
<div id="t1-elem" style="display: none; margin: 5px;">
    <p class="normal-italic">
       This chart shows total digipeated packet counts for each beacon on an active flight.
       These statistics are only available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
    </p>
</div>
<div id="digitable"></div>

<!-- APRS-IS Packet Source chart -->
<p class="subheader"><a href="#c1" class="subheader" id="c1-link">(<span style="color: red;" id="c1-sign">+</span>) APRS-IS Packet Source</a></p>
<div id="c1-elem" style="display: none; margin: 5px;">
    <p class="normal-italic">
       These packet counts show from what source a given packet was discovered (Internet vs. RF).  For example, 
       the RF packet count shows the number of packets that were heard over RF that were <strong>not</strong> already known 
       through an APRS-IS connection - it's a subtle distinction not to be confused with absolute packet counts 
       <strong>heard</strong> over an RF channel.
    </p>
</div>
<div class="inverted" id="chart1"></div>

<!-- RF Packet Counts chart -->
<p class="subheader"><a href="#c3" class="subheader" id="c3-link">(<span style="color: red;" id="c3-sign">+</span>) RF Packet Counts</a></p>
<div id="c3-elem" style="display: none; margin: 5px;">
    <p class="normal-italic">
       This chart shows total RF packet count (every packet decoded by Dire Wolf) for each SDR/Frequency combination currently running.  
       These statistics are only available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
    </p>
</div>
<div class="inverted" id="chart3"></div>



<!-- Live packets section -->
<p class="header">
    <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
    Live APRS Packets
</p>

<!-- The flight selection table -->
<div class="div-table">
    <div class="table-row">
        <div class="table-header-cell">Select Flight:</div>
    </div>
    <div class="table-row">
        <div class="table-cell" style="font-size: 1em; border-top: none;"><span id="flights"></span></div>
    </div>
    <div class="table-row">
        <div class="table-header-cell" style="border-top: none;">Search Criteria:</div>
    </div>
    <div class="table-row">
        <div class="table-cell" style="padding: 5px; border-top: none;">
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
