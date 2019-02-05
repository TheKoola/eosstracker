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
include $documentroot . '/common/sessionvariables.php';
include $documentroot . '/common/header.php';

?>
<script>
   
    var numProcessesRunning = 0;
    var processInTransition = 0;

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
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = "<mark style=\"background-color:  " + (statusJson.processes[i].status > 0 ? "lightgreen;\">[Okay]" : "red;\">[Not okay]") + "</mark>"; 
              procs += statusJson.processes[i].status; 
          }

          numProcessesRunning = procs;

          // find out what state we're in...
          var donehtml = "<p class=\"normal-black\" style=\"margin-left: 50px;\"><mark>Not running...</mark></p>";
          if (processInTransition == 1) {    // we're starting up...
              //document.getElementById("debug").innerHTML = "starting up still...processInTransition: " + processInTransition;
              if (procs >= keys.length - 1)
                  processInTransition = 0;
              return;
          }
          else if (processInTransition == 2) {     // we're shutting down...
              //document.getElementById("debug").innerHTML = "shutting down still...processInTransition: " + processInTransition;
              if (procs <= 1)
                  processInTransition = 0; 
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
                + "<br><mark style=\"background-color:  lightgreen;\">[Okay]</mark></p></td></tr>";
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
          
          $("#logfile").html(logsJson.log);
          $("#errfile").html(logsJson.err);
      });
    }
 

    $(document).ready(function () {
        getrecentdata();
        setInterval(getrecentdata, 5000);
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
                </td></tr>
                <tr><td>&nbsp;</td></tr>
                <tr><td><hr width="90%"><hr width="90%"></td></tr>
            </table>
            </p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                System Processes
            </p>
            <table class="presentation-area" cellpadding=0 cellspacing=0 border=0 style="margin-left: 50px; margin-right: auto;">
                <tr><td>
                    <table class="packetlist" style="margin-left: 30px;" cellpadding=0 cellspacing=0 border=0>
                    <tr><td class="packetlistheader" >Process</td><td class="packetlistheader" >Status</td></tr>
                    <tr><td class="packetlist" >direwolf</td><td class="packetlistright" ><span id="direwolf-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
		    <tr><td class="packetlist" >aprsc</td><td class="packetlistright" ><span id="aprsc-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
	  	    <tr><td class="packetlist" >gpsd</td><td class="packetlistright" ><span id="gpsd-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
		    <tr><td class="packetlist" >backend daemon</td><td class="packetlistright" ><span id="habtracker-d-status"><mark style="background-color:  red;">Not okay</mark></span></td></tr>
                    </table>
                 </td>
                 <td valign="top">
                    <p class="normal-black" style="font-weight: bold; margin-top:  0px;">Start and Stop Processes:</p>
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
            <p class="packetdata"><span id="logfile"></span></p>
            <p class="normal-black" style="font-weight: bold;">Stderr</p>
            <p class="packetdata"><span id="errfile"></span></p>
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
