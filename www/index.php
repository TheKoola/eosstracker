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
$pagetitle="APRS:  Home";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<script>
   
    var numProcessesRunning = 0;
    var processInTransition = 0;

    /***********
    * escapeHtml
    *
    * This function will escape HTML special chars
    ***********/
    function escapeHtml(s) {
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          };

       return s.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    /***********
    * getConfiguration
    *
    * This function will read the current configuration
    ***********/
    function getConfiguration() {
	    $.get("readconfiguration.php", function(data) {
		    var jsonData = JSON.parse(data);

		    var callsign = (typeof(jsonData.callsign) == "undefined" ? "" : jsonData.callsign);
		    var timezone = (typeof(jsonData.timezone) == "undefined" ? "" : jsonData.timezone);
		    var audiodev = (typeof(jsonData.audiodev) == "undefined" ? "" : jsonData.audiodev);
		    var igating = (typeof(jsonData.igating) == "undefined" ? "false" : jsonData.igating);
		    var i = (igating == "true" ? "yes" : "no");
		    var i2 = (i == "yes" ? "<mark>" + i + "</mark>" : i);
		    var beaconing = (typeof(jsonData.beaconing) == "undefined" ? "false" : jsonData.beaconing);
		    var b = (beaconing == "true" ? "yes" : "no");
		    var b2 = (b == "yes" ? "<mark>" + b + "</mark>" : b);
		    var ssid = (typeof(jsonData.beaconing) == "undefined" ? "" : (callsign == "" ? "" : "-" + jsonData.ssid));

		    document.getElementById("callsign").innerHTML = (callsign == "" ? "n/a" : callsign);
		    document.getElementById("timezone").innerHTML = timezone;
		    document.getElementById("igating").innerHTML = i2;
		    document.getElementById("beaconing").innerHTML = b2;
		    document.getElementById("ssid").innerHTML = ssid; 
	    });
    }


    /***********
    * startUpProcesses
    *
    * This function will submit a request to the backend web system to start the various daemons for the system.
    ***********/
    function startUpProcesses() {
        if (processInTransition == 0 && numProcessesRunning < 2) {
            processInTransition = 1;
            var startinghtml = "<p class=\"normal-black\"><mark>Starting...</mark></p>";
            $("#antenna-data").html(startinghtml);
            $.get("startup.php", function(data) { 
                getrecentdata(); 
            });
        }
    }


    /***********
    * shutDownProcesses
    *
    * This function will submit a request to the backend web system to kill/stop the various daemons for the system.
    ***********/
    function shutDownProcesses() {
        if (processInTransition == 0 && numProcessesRunning > 1) {
            processInTransition = 2;
            var stoppinghtml = "<p class=\"normal-black\"><mark>Shutting down...</mark></p>";
            $("#antenna-data").html(stoppinghtml);
            $.get("shutdown.php", function(data) {
                getrecentdata();
            });
        }
    }


    function getrecentdata() {
      $.get("getstatus.php", function(data) { 
          var statusJson = JSON.parse(data);
          var keys = Object.keys(statusJson.processes);
          var antennas = statusJson.antennas
          var i = 0;
          var procs = 0;
  
       /* Loop through the processes and update their status */
	  for (i = 0; i < keys.length; i++) {
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = "<font style=\"font-variant: small-caps;\"><mark style=\"background-color:  " + (statusJson.processes[i].status > 0 ? "lightgreen;\">[Okay]" : "red;\">[Not okay]") + "</font></mark>"; 
              procs += statusJson.processes[i].status; 
          }

          numProcessesRunning = procs;

          // find out what state we're in...
          var donehtml = "<p class=\"normal-black\" style=\"margin-left: 50px;\"><mark>Not running...</mark></p>";
          if (processInTransition == 1) {    // we're starting up...
              //document.getElementById("debug").innerHTML = "starting up still...processInTransition: " + processInTransition;
              if (procs >= keys.length - 1)
                  processInTransition = 0;
              $("#direwolferror").html("");
              return;
          }
          else if (processInTransition == 2) {     // we're shutting down...
              //document.getElementById("debug").innerHTML = "shutting down still...processInTransition: " + processInTransition;
              if (procs <= 1)
                  processInTransition = 0; 
              $("#direwolferror").html("");
              return;
          }
          else {   // we're either up or shutdown, but we're NOT in transition
              //document.getElementById("debug").innerHTML = "not in transistion....processInTransition: " + processInTransition;
              if (statusJson.rf_mode == 1 && procs >= keys.length)   // We're running in RF mode...i.e. SDRs are attached to the system
                  donehtml = "<p class=\"normal-black\" style=\"margin-left: 50px;\"><mark style=\"background-color: lightgreen;\">Running.</mark></p>";
              if (statusJson.rf_mode == 0 && procs >= keys.length-1)   // We're running in online mode...i.e. SDRs are not attached to the system
                  donehtml = "<p class=\"normal-black\" style=\"margin-left: 50px;\"><mark style=\"background-color: lightgreen;\">Running in online mode - no SDRs found.</mark></p>";
          }
          $("#antenna-data").html(donehtml);
         

        var antenna_html = "<table class=\"inner-presentation-area\" cellpadding=0 cellspacing=0 border=0><tr>";
        if (!statusJson.antennas) {
            //document.getElementById("debug").innerHTML = JSON.stringify(statusJson) + "<br><br>jeff was here";
            $("#antenna-data").html("<p class=\"normal-black\" style=\"margin-left: 50px;\"><mark>Not running...</mark></p>");
            $("#direwolferror").html("");
            return;
        }
        for (i = 0; i < antennas.length; i++) {
            var frequencies = antennas[i].frequencies;  
            var rtl_id = antennas[i].rtl_id;
            var k = 0;
            var freqhtml = "";
            var callsign_html = "";
            //document.getElementById("debug").innerHTML = JSON.stringify(frequencies);

            for (k = 0; k < frequencies.length; k++) 
                freqhtml = freqhtml + frequencies[k].frequency.toFixed(3) + "MHz &nbsp; (" + frequencies[k].udp_port + ")<br>"; 
                           
            antenna_html = antenna_html + "<td valign=\"top\" style=\"padding-left: 5px; padding-right: 5px;\"><table class=\"inner-presentation-area\"  style=\"width: 300px;\" align=\"left\"  cellpadding=0 cellspacing=0 border=0>" 
                + "<tr><td><p style=\"font-size: 1.4em;\">Antenna #" + rtl_id + "</p><hr></td></tr>" 
                + "<tr><td valign=\"top\">"
                + "<p><img src=\"/images/graphics/antenna.png\" height=\"150\" style=\"float: right;\" ></p>"
                + "<p class=\"normal-black\" style=\"white-space: nowrap; margin-right: 0px; font-size: .9em;\"><strong>Frequency &nbsp; (udp port):</strong><br>" + freqhtml 
                + "<br><br><strong>GnuRadio:</strong><br>RTL-SDR #: " + rtl_id + "<br>Product: " + antennas[i].rtl_product + "<br>Manufacturer: " + antennas[i].rtl_manufacturer 
                + "<br>Serial No: " + antennas[i].rtl_serialnumber 
                + "<br><font style=\"font-variant: small-caps;\"><mark style=\"background-color:  lightgreen;\">[Okay]</mark></font></p></td></tr>";
	    antenna_html = antenna_html + "<tr><td><p class=\"normal-black\" style=\"white-space: nowrap; margin-right: 0px;  margin-top: 0px; margin-bottom: 0px;font-size: .9em;\">Igating status: <font style=\"font-variant: small-caps;\">" + (statusJson.igating == "true" ? "<mark style=\"background-color: lightgreen;\">[igating]</mark>" : "[no]") + "</font></p></td></tr>";
	    antenna_html = antenna_html + "<tr><td><p class=\"normal-black\" style=\"white-space: nowrap; margin-right: 0px; margin-top: 0px; margin-bottom: 0px; font-size: .9em;\">Beaconing status: <font style=\"font-variant: small-caps;\">" + (statusJson.beaconing == "true" ? "<mark style=\"background-color: lightgreen;\">[beaconing]</mark>" : "[no]") + "</font></p></td></tr>";
            antenna_html = antenna_html + "</table></td>";
        }
        antenna_html = antenna_html + "</tr></table>";
        //document.getElementById("debug").innerHTML = "procs: " + procs + ",  keys: " + keys.length + ",  antennas:  " + antennas.length;;
        if (antennas.length == 0 || (antennas.length > 0 && procs < keys.length-1)) 
              antenna_html = donehtml;
        $("#antenna-data").html(antenna_html);
      
      });

      $.get("getlogs.php", function(data) {
          var logsJson = JSON.parse(data);
          
          $("#logfile").html("");
	  for (a in logsJson.log) 
              $("#logfile").append(escapeHtml(logsJson.log[a]));

          $("#errfile").html("");
	  for (a in logsJson.err) 
              $("#errfile").append(escapeHtml(logsJson.err[a]));

	  $("#beacons").html("");
	  for (a in logsJson.beacons) 
              $("#beacons").append(escapeHtml(logsJson.beacons[a]));

          $("#direwolf").html("");
	  for (a in logsJson.direwolf) 
              $("#direwolf").append(escapeHtml(logsJson.direwolf[a]));

	  if ((logsJson.direwolf + " ").indexOf("Could not open audio device") >= 0)
              $("#direwolferror").html(" &nbsp; <mark style=\"background-color: red;\">[ audio error ]</mark>");
	  else
              $("#direwolferror").html("");

      });
    }
 
    function getgps() {
        $.get("getgps.php", function(data) {
            var jsonData = JSON.parse(data);
            var gpsfix;

            if (jsonData.mode == 0)
                gpsfix = "<mark style=\"background-color: red; font-variant: small-caps; font-size: .9em;\">[ NO FIX ]</mark>";
            else if (jsonData.mode == 1)
                gpsfix = "<mark style=\"background-color: yellow; font-variant: small-caps; font-size: .9em;\">[ 2D FIX ]</mark>";
            else if (jsonData.mode == 3)
                gpsfix = "<mark style=\"background-color: lightgreen; font-variant: small-caps; font-size: .9em;\">[ 3D FIX ]</mark>";
            else
                gpsfix = "n/a";

            var theDate = jsonData.utc_time;
            theDate = theDate.replace(/T/g, " "); 
            theDate = theDate.replace(/.[0]*Z$/g, ""); 
            var gpshtml = "<table cellpadding=0 cellspacing=0 border=0>" 
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">UTC Time:</td><td>" + theDate + "</td></tr>"
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">Latitude:</td><td>" + jsonData.lat + "</td></tr>"
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">Longitude:</td><td>" + jsonData.lon + "</td></tr>"
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">Speed MPH:</td><td>" + jsonData.speed_mph + "</td></tr>"
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">Altitude (ft):</td><td>" + jsonData.altitude + "</td></tr>"
                + "<tr><td style=\"text-align: left; padding-right: 10px;\">GPS Fix:</td><td>" + gpsfix + "</td></tr></table>";
     
            var i = 0;
            var satellites = jsonData.satellites;
            var satellite_html = "<table cellpadding=0 cellspacing=0 border=0><tr><th style=\"font-weight: normal; padding: 5px; text-align: center;\">PRN:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\" >Elev:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\" >Azim:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\">SNR:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\">Used:</th></tr>"; 
            for (i = 0; i < satellites.length; i++) {
                    satellite_html = satellite_html + "<tr><td style=\"text-align: center;\">" + satellites[i].prn + "</td><td style=\"text-align: center;\">" + satellites[i].elevation + "</td><td style=\"text-align: center;\">" + satellites[i].azimuth + "</td><td style=\"text-align: center;\">" + satellites[i].snr + "</td><td style=\"text-align: center;\">" + (satellites[i].used == "True" ? "Y" : "N") + "</td></tr>";
            }
            
            satellite_html = satellite_html + "</table>";

            if (satellites.length > 0)
            gpshtml = gpshtml + satellite_html;
            $("#gpsdata").html(gpshtml);
   	    });
    }


    $(document).ready(function () {
        getrecentdata();
	getConfiguration();
	getgps();
        //setInterval(getrecentdata, 5000);
	setInterval(function() {
		getrecentdata();
		getgps();
		getConfiguration();
	}, 5000);
    });
    
    
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                System Status
            </p>
            <p class="normal-black">
            <table class="presentation-area" cellpadding=0 cellspacing=0 border=0 style="margin-left: auto; margin-right: auto;">
                <tr><td>
                    <span id="antenna-data"></span>
		</td><td style="vertical-align: bottom; text-align: left;">
                    <table class="packetlist" cellpadding=0 cellspacing=0 border=0 style="margin-left: auto; margin-right: auto;">
		    <tr><th class="packetlistheader" >GPS State</th>
                    </tr>
                    <tr><td class="packetlist"><span id="gpsdata" >n/a</span></td>    
                    </tr>
                    <tr><td class="packetlist">
                    <p class="normal-italic" style="text-align: left; margin: 0px; white-space: normal;"><strong>Note:</strong> GPS state is only updated while<br>system processes are running</p>
                    </td>
                    </tr>
                    </table> 
                </td>
                </tr>
                <tr><td colspan="2"><hr width="90%"><hr width="90%"></td></tr>
            </table>
            </p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                System Processes
            </p>
            <table class="presentation-area" cellpadding=0 cellspacing=0 border=0 style="margin-left: 50px; margin-right: auto;">
                <tr><td valign="top">
                    <table class="packetlist" style="margin-left: 30px;" cellpadding=0 cellspacing=0 border=0>
                    <tr><td class="packetlistheader" >Process</td><td class="packetlistheader" >Status</td></tr>
                    <tr><td class="packetlist" >direwolf</td><td class="packetlistright" ><span id="direwolf-status"><mark style="background-color:  red;">Not okay</mark></span><span id="direwolferror"></span></td></tr>
		    <tr><td class="packetlist" >aprsc</td><td class="packetlistright" ><span id="aprsc-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
	  	    <tr><td class="packetlist" >gpsd</td><td class="packetlistright" ><span id="gpsd-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
		    <tr><td class="packetlist" >backend daemon</td><td class="packetlistright" ><span id="habtracker-d-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
                    </table>
                 </td>
                 <td valign="top">
                    <table class="packetlist" cellpadding=0 cellspacing=0 border=0>
                    <tr><th class="packetlistheader" colspan=2>Configuration Settings</th></tr>
                    <tr><td class="packetlist">Callsign and SSID: </td><td class="packetlist" style="text-align: center; font-family:  'Lucida Console', Monaco, monospace;"><span id="callsign"></span><span id="ssid"></span></td<></tr>
                    <tr><td class="packetlist">Timezone: </td><td class="packetlist" style="text-align: center;"><span id="timezone"></span></td></tr>
                    <tr><td class="packetlist">Igating: </td><td class="packetlist" style="text-align: center;"><span id="igating"></span></td></tr>
                    <tr><td class="packetlist">Beaconing: </td><td class="packetlist" style="text-align: center;"><span id="beaconing"></span></td></tr>
                    </table>
                 </td>
                 </tr>
                 <tr>
                 <td colspan=2 valign="top">
                    <p class="normal-black" style="font-weight: bold; margin-top:  20px;">Start and Stop Processes:</p>
                    <p class="normal-italic">Use these controls to start or stop the system daemons.</p>
                    <p class="normal-black"><button name="Start" id="startbutton" style="font-size: 1.1em;" onclick="startUpProcesses();">Start</button> &nbsp; <button name="Shutdown" id="stopbutton" style="font-size: 1.1em;" onclick="shutDownProcesses();">Stop</button></p>
                 </td></tr>
            </table> 
            <p class="normal-italic" style="margin-left: 50px;"><strong>Note:</strong> Process status is updated automatically every 5secs.</p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                System Logs
            </p>
            <p class="normal-black" style="font-weight: bold;">Stdout</p>
            <pre class="packetdata"><span id="logfile"></span></pre>
            <p class="normal-black" style="font-weight: bold;">Stderr</p>
            <pre class="packetdata" ><span id="errfile"></span></pre>
            <p class="normal-black" style="font-weight: bold;">Transmitted Beacons (last 10 transmissions)</p>
            <pre class="packetdata" ><span id="beacons"></span></pre>
            <p class="normal-black" style="font-weight: bold;">Direwolf output (limited to the first 100 lines)</p>
            <pre class="packetdata" ><span id="direwolf"></span></pre>
            <p class="normal-black"><span id="debug"></span></p>
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
