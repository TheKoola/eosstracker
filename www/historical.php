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
$pagetitle="EOSS Historical Flight Data";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include_once $documentroot . '/common/header-historical.php';

    // Check units selector
    $get_units = "";
    if (isset($_GET["units"])) 
        $get_units = strtolower(check_string($_GET["units"], 20));

    if ($get_units == "" || ($get_units != "metric" && $get_units != "imperial"))
        $get_units = "imperial";

?>
<script src="/common/historical.js"></script>
<div style="margin-bottom: 30px;">
<span id="units" data-units="<?php echo $get_units;?>" ></span>
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        Historical Flight Data
    </p>
    <p class="subheader">Overview</p>
    <p class="normal" style="border: 0;">
        The following is a list of all EOSS flight data from recent years.  Data is available in several formats:
        <ul style="margin-left: 30px;">
            <li class="normal" style="border: 0;">Comma separated values (*.csv)</li>
            <li class="normal" style="border: 0;">JavaScript Object Notation (*.json)</li>
            <li class="normal" style="border: 0;">Microsoft Excel (*.xlsx)</li>
            <li class="normal" style="border: 0;">Pandas - Python Pandas pickle format (*.pkl)</li>
        </ul>
    </p>
    <p class="subheader">Details</p>
    <p class="normal" style="border: 0;">
        Be sure to review the <a style="border: 0;" href="#schema">schema information</a> at the bottom of this page as there are a number of columns included beyond those integral to the Ham Radio, APRS packet specification.  
        In addition, make sure you're aware of how frequently telemetry data is collected, data quality issues, and similar topics by reviewing the <a style="border: 0;" href="#datanotes">data notes</a> section.
    </p>
    <p class="normal" style="border: 0;">
        The list of flights (similar to the list below) is also available in the following formats:
        <a target="_blank" href="/flightdata/csv/flights_metadata.csv">csv</a>,
        <a target="_blank" href="/flightdata/json/flights_metadata.json">json</a>, and 
        <a target="_blank" href="/flightdata/xlsx/flights_metadata.xlsx">excel</a>.
    </p>
    <p class="subheader">Units</p>
    <p class="normal" style="border: 0;">
        Current units are displayed in:
        <span id="unitslink"></span>
        <br><strong>NOTE:</strong>  Download files (ex. metadata, csv, json, excel, pandas) contain data in both Imperial and Metric units.  There's no need to download data twice (ex. once for Metric and again for Imperial).

    </p>
</div>
    <p class="subheader">Flight List</p>
<div id="flightlist" style="margin-left: 30px;"></div>
<div id="schema" style="margin-bottom: 30px;">
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        Schema Information 
    </p>
    <p class="normal" style="border: 0;">
        <table class="flightlist" style="margin-left: 30px;">
        <tr class="flightlist"><th class="flightlistheader">Column</th><th class="flightlistheader">Units</th><th class="flightlistheader">Notes</th></tr>
        <tr class="flightlist"><td class="flightlist">flightid</td><td class="flightlist">--</td><td class="flightlist">Flight ID (ex. EOSS-123)</td></tr>
        <tr class="flightlist"><td class="flightlist">callsign</td><td class="flightlist">--</td><td class="flightlist">Callsign of the beacon transmitting this packet</td></tr>
        <tr class="flightlist"><td class="flightlist">receivetime</td><td class="flightlist">timestamp</td><td class="flightlist">The timestamp the packet was added to the database on track.eoss.org</td></tr>
        <tr class="flightlist"><td class="flightlist">packettime</td><td class="flightlist">timestamp</td><td class="flightlist">The timestamp within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">altitude_ft</td><td class="flightlist">feet</td><td class="flightlist">Altitude in feet</td></tr>
        <tr class="flightlist"><td class="flightlist">altitude_m</td><td class="flightlist">meters</td><td class="flightlist">Altitude in meters</td></tr>
        <tr class="flightlist"><td class="flightlist">vert_rate_ftmin</td><td class="flightlist">feet/min</td><td class="flightlist">Vertical rate in ft/min</td></tr>
        <tr class="flightlist"><td class="flightlist">elapsed_secs</td><td class="flightlist">seconds</td><td class="flightlist">Total elapsed seconds for this phase of the flight (i.e. ascent, descent)</td></tr>
        <tr class="flightlist"><td class="flightlist">flight_phase</td><td class="flightlist">--</td><td class="flightlist">Ascending, descending</td></tr>
        <tr class="flightlist"><td class="flightlist">info</td><td class="flightlist">--</td><td class="flightlist">The information field of the APRS packet</td></tr>
        <tr class="flightlist"><td class="flightlist">raw</td><td class="flightlist">--</td><td class="flightlist">The raw APRS packet as ingested from APRS-IS</td></tr>
        <tr class="flightlist"><td class="flightlist">bearing</td><td class="flightlist">degrees</td><td class="flightlist">Bearing as reported degrees from North within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">speed_mph</td><td class="flightlist">miles/hour</td><td class="flightlist">The speed in MPH as reported within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">speed_kph</td><td class="flightlist">kilometers/hour</td><td class="flightlist">The speed in KPH as reported within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">latitude</td><td class="flightlist">decimal degrees</td><td class="flightlist">The latitude in decimal degrees as reported within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">longitude	</td><td class="flightlist">decimal degrees</td><td class="flightlist">The longitude  in decimal degreesas reported within the APRS position packet</td></tr>
        <tr class="flightlist"><td class="flightlist">distance_from_launch_mi</td><td class="flightlist">miles</td><td class="flightlist">The distance in miles from the launch location (i.e. usually from the first APRS packet heard for the flight) to the landing location (i.e. usually the last APRS packet heard from the flight)</td></tr>
        <tr class="flightlist"><td class="flightlist">distance_from_launch_km</td><td class="flightlist">kilometers</td><td class="flightlist">The distance in kilometers from the launch location (i.e. usually from the first APRS packet heard for the flight) to the landing location (i.e. usually the last APRS packet heard from the flight)</td></tr>
        <tr class="flightlist"><td class="flightlist">temperature_c</td><td class="flightlist">celsius degrees</td><td class="flightlist">The temperature in Celsius as reported from the beacon’s thermocouple sensor (if available)</td></tr>
        <tr class="flightlist"><td class="flightlist">temperature_f</td><td class="flightlist">fahrenheit degrees</td><td class="flightlist">The temperature in Fahrenheit as reported from the beacon’s thermocouple sensor (if available)</td></tr>
        <tr class="flightlist"><td class="flightlist">temperature_k</td><td class="flightlist">kelvins</td><td class="flightlist">The temperature in Kelvin as reported from the beacon’s thermocouple sensor (if available)</td></tr>
        <tr class="flightlist"><td class="flightlist">pressure_pa</td><td class="flightlist">pascals</td><td class="flightlist">The pressure in Pascals as reported from the beacon’s pressure sensor (if available)</td></tr>
        <tr class="flightlist"><td class="flightlist">pressure_atm</td><td class="flightlist">atmospheres</td><td class="flightlist">The pressure in Atmospheres as reported from the beacon’s pressure sensor (if available)</td></tr>
        <tr class="flightlist"><td class="flightlist">airdensity_slugs</td><td class="flightlist">slugs (lbf &middot; s<sup>2</sup>/ft)</td><td class="flightlist">The air density (computed from the pressure and temperature values and assumes 1% relative humidity) in “slugs”.</td></tr>
        <tr class="flightlist"><td class="flightlist">airdensity_kgm3</td><td class="flightlist">kilograms/meter<sup>3</sup></td><td class="flightlist">The air density (computed from the pressure and temperature values and assumes 1% relative humidity) in “kg/m<sup>3</sup>”.</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_x_degs</td><td class="flightlist">degrees/second</td><td class="flightlist">The horizontal, x-axis, velocity in longitude degrees per second.</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_y_degs</td><td class="flightlist">degrees/second</td><td class="flightlist">The horizontal, y-axis, velocity in latitude degrees per second.</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_z_fts</td><td class="flightlist">feet/second</td><td class="flightlist">The vertical, z-axis, velocity in feet per second.</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_z_ms</td><td class="flightlist">meters/second</td><td class="flightlist">The vertical, z-axis, velocity in meters per second.</td></tr>
        <tr class="flightlist"><td class="flightlist">airflow</td><td class="flightlist">--</td><td class="flightlist">The estimated airflow conditions.  “high Re” = high Reynolds number environment (ex. Turbulent, lower drag).  “low Re” = low Reynolds number environment (ex. Laminar, higher drag)</td></tr>

        <tr class="flightlist"><td class="flightlist">acceleration_fts2</td><td class="flightlist">feet/second<sup>2</sup></td><td class="flightlist">The vertical, z-axis, acceleration (ft/s<sup>2</sup>)</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_mean_fts</td><td class="flightlist">feet/second</td><td class="flightlist">The running mean of the z-axis velocity (ft/s).  (I.e. vertical rate)</td></tr>
        <tr class="flightlist"><td class="flightlist">acceleration_mean_fts2</td><td class="flightlist">feet/second<sup>2</sup></td><td class="flightlist">The running mean of the z-axis acceleration (ft/s<sup>2</sup>) (i.e. vertical acceleration) </td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_std_fts</td><td class="flightlist">feet/second</td><td class="flightlist">The running standard deviation of the z-axis velocity </td></tr>
        <tr class="flightlist"><td class="flightlist">acceleration_std_fts2</td><td class="flightlist">feet/second<sup>2</sup></td><td class="flightlist">The running standard deviation of the z-axis acceleration (ft/s<sup>2</sup>)</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_norm_fts</td><td class="flightlist">standard deviations</td><td class="flightlist">The normalized z-axis velocity in standard deviations (of imperial velocity values).
        <tr class="flightlist"><td class="flightlist">acceleration_norm_fts2</td><td class="flightlist">standard deviations</td><td class="flightlist">The normalized z-axis acceleration in standard deviations (of imperial acceleration values).</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_curvefit_fts</td><td class="flightlist">feet/second</td><td class="flightlist">The curve-fitted, smoothed, z-axis velocity value (ft/s)</td></tr>

        <tr class="flightlist"><td class="flightlist">acceleration_ms2</td><td class="flightlist">meters/second<sup>2</sup></td><td class="flightlist">The vertical, z-axis, acceleration (m/s<sup>2</sup>)</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_mean_ms</td><td class="flightlist">meters/second</td><td class="flightlist">The running mean of the z-axis velocity (m/s).  (I.e. vertical rate)</td></tr>
        <tr class="flightlist"><td class="flightlist">acceleration_mean_ms2</td><td class="flightlist">meters/second<sup>2</sup></td><td class="flightlist">The running mean of the z-axis acceleration (m/s<sup>2</sup>) (i.e. vertical acceleration) </td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_std_ms</td><td class="flightlist">meters/second</td><td class="flightlist">The running standard deviation of the z-axis velocity (m/s) </td></tr>
        <tr class="flightlist"><td class="flightlist">acceleration_std_ms2</td><td class="flightlist">meters/second<sup>2</sup></td><td class="flightlist">The running standard deviation of the z-axis acceleration (m/s<sup>2</sup>)</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_norm_ms</td><td class="flightlist">standard deviations</td><td class="flightlist">The normalized z-axis velocity in standard deviations (of metric velocity values).
        <tr class="flightlist"><td class="flightlist">acceleration_norm_ms2</td><td class="flightlist">standard deviations</td><td class="flightlist">The normalized z-axis acceleration in standard deviations (of metric acceleration values).</td></tr>
        <tr class="flightlist"><td class="flightlist">velocity_curvefit_ms</td><td class="flightlist">meters/second</td><td class="flightlist">The curve-fitted, smoothed, z-axis velocity value (m/s)</td></tr>

        <tr class="flightlist"><td class="flightlist">reynolds_transition</td><td class="flightlist">--</td><td class="flightlist">Denotes if a data point has been marked as the average point where airflow around the flight (i.e. the balloon, etc.) is transitioning (ex. Reynolds numbers for the airflow are transitioning from high_to_low or low_to_high).  A lack of data (i.e. null, etc.) in this field indicates no transition has been detected for this data point.</td></tr>
        </table>
    </p>
</div>
<div id="datanotes" style="margin-bottom: 30px;">
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        Data Notes
    </p>
    <p class="normal" style="border: 0;">
        <ol>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Data Point Frequency:</strong></font>
                All data points are roughly 30 seconds apart as that’s how frequently the redundant beacons on each flight transmit telemetry information.  
                However, all ascent packets for a given flight will have data from from all beacons on that flight included and sorted according to timestamp 
                so the packet list is nice and uniform.  The same applies to packets for the decent portion of each flight.
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Only Valid Positions:</strong></font>
                These datasets only include data points that originate from APRS position packets and then, only those that have valid latitude, longitude, and altitude values.  Any sort of malformed position 
                data that might have been transmitted by a flight beacon (i.e. perhaps because of a lack of GPS lock), have been excluded from the data sets.
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Additional Columns:</strong></font>
                There are a lot of columns added beyond just what was transmitted as part of the Ham Radio, APRS packet spec.  These are mostly computed values (ex. velocities and accelerations), 
                but also include decoded items like temperature and pressure that the flight beacons report through an EOSS specific format included within the comment section of individual APRS packets.
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Statistical Values:</strong></font>
                Statistical columns are added for motion values (ex. velocity, acceleration, etc) and include running means, standard deviations, and normalizations.  In this context, “running”
                means that for a specific packet, the mean, std, norm values are computed based on all packets heard up to that point.
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Units:</strong></font>
                Data files (ex. csv, excel, pandas, json) include fields with both imperial and metric units - it's the same data, but provided to save the end user time/trouble in converting from one to another.  
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Timestamps:</strong></font>
                Timestamps for the receivetime and packettime columns within JSON data files are in ISO8601 format:  YYYY-MM-DDTHH:MM:SS.SSS.
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Missing Data Points:</strong></font>
                Unfortunately there are a small number of flights that only have partial packet data available - if an APRS packet wasn't igated in the field then those data points
                obviously won't be included in the data sets.  
            </li>
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Airflow:</strong></font>
                Typically EOSS flights experience a higher velocity during the early stages of a flight then transition to a lower velocity about half-way through the ascent due to higher drag on the surface 
                of the balloon as it expands at higher altitudes.  These two conditions are noted within the "airflow" column as "high Re" and "low Re" respectively referring to lower and higher Reynolds numbers.
                Airflow that is more laminar results in higher surface drag and slows the ascent rate of the balloon and is characterized as having low Reynolds numbers.  Airflow that is more turbulent results in 
                lower surface drag and relatively higher balloon ascent velocities and is characterized as having higher Reynolds numbers.
                For the purposes of this data set, these conditions are estimated by determining how far above or below the average vertical ascent rate a given data point is.  For example, if a data point shows 
                higher z-axis velocity compared to the average for the entire ascent portion of the flight then it is assumed that the airflow around the balloon is causing less drag.  Conversely, for below average 
                z-axis velocities, it is then assumed that the balloon is experiencing more laminar airflow and thus higher drag.  
            </li>
            <li class="normal" style="border: 0;">
                <font style="font-variant: small-caps"><strong>Launch/Landing Locations:</strong></font>
                The launch and landing locations are determined by using the first and last APRS packets available respectively with the distances between the two computed in miles and kilometers.
                In some instances, however, an incomplete list of APRS packets for a flight was igated to APRS-IS, which unfortunately results in an inacurate representation for the launch and landing locations.  For example, 
                flight EOSS-343 shows a landing location and altitude of 14,000ft (4267m).  As exciting as that might sound, the flight didn't actually land on the summit of a Colorado 14er!  In the case of EOSS-343, 
                as the flight approached landing, packets transmitted by its beacons were never igated to APRS-IS and consequently are not available within the dataset on this site.
            </li>
        </ol>
    </p>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>
</body>
</html>
