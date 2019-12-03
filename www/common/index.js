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
        var i2 = (i == "yes" ? "<mark class=\"marginal\">" + i + "</mark>" : i);
        var beaconing = (typeof(jsonData.beaconing) == "undefined" ? "false" : jsonData.beaconing);
        var eoss = (typeof(jsonData.eoss_string) == "undefined" ? "" : (typeof(jsonData.includeeoss) == "undefined" ? "" : (jsonData.includeeoss == "true" ? jsonData.eoss_string : "")));
        var b = (beaconing == "true" ? "yes" : "no");
        var b2 = (b == "yes" ? "<mark class=\"marginal\">" + b + (eoss != "" ? "</mark><br>Path String: <mark class=\"marginal\">" + eoss + " " : "") + "</mark>" : b);
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
        var startinghtml = "<p><mark class=\"marginal\">Starting...</mark></p>";
        $("#antenna-data").html(startinghtml);
        $.get("startup.php", function(data) { 
            getrecentdata(); 
        });
    }

    return false;
}


/***********
* shutDownProcesses
*
* This function will submit a request to the backend web system to kill/stop the various daemons for the system.
***********/
function shutDownProcesses() {
    if (processInTransition == 0 && numProcessesRunning > 1) {
        processInTransition = 2;
        var stoppinghtml = "<p><mark class=\"marginal\">Shutting down...</mark></p>";
        $("#antenna-data").html(stoppinghtml);
        $.get("shutdown.php", function(data) {
            getrecentdata();
        });
    }

    return false;
}


/***********
* getrecentdata
*
* This function will fetch current status of processes, system status, SDR info, logs, etc. and populate the web page as needed.
***********/
function getrecentdata() {
  $.get("getstatus.php", function(data) { 
      var statusJson = JSON.parse(data);
      var keys = Object.keys(statusJson.processes);
      var antennas = statusJson.antennas
      var i = 0;
      var procs = 0;

   /* Loop through the processes and update their status */
  for (i = 0; i < keys.length; i++) {
      document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
          (statusJson.processes[i].status > 0 ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
          procs += statusJson.processes[i].status; 
      }

      numProcessesRunning = procs;

      // find out what state we're in...
      var donehtml = "<p><mark class=\"marginal\">Not running...</mark></p>";
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
              donehtml = "<p><mark class=\"okay\">Running.</mark></p>";
          if (statusJson.rf_mode == 0 && procs >= keys.length-1)   // We're running in online mode...i.e. SDRs are not attached to the system
              donehtml = "<p><mark class=\"okay\">Running in online mode - no SDRs found.</mark></p>";
      }
      $("#antenna-data").html(donehtml);
     

    //var antenna_html = "<table class=\"presentation-area\" cellpadding=0 cellspacing=0 border=0><tr>";
    var antenna_html = "<div class=\"div-table\" style=\"float: left;\">";
    if (!statusJson.antennas) {
        $("#antenna-data").html("<p><mark class=\"marginal\">Not running...</mark></p>");
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
        antenna_html = antenna_html + "<div style=\"float: left\"><div class=\"antenna\" style=\"float: left;\"><img src=\"/images/graphics/antenna.png\" style=\"height: 150px;\"></div>"
            + "<div class=\"antenna-table\">"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell header toprow\" style=\"font-size: 1.4em; white-space: nowrap;\">Antenna #" + rtl_id + "</div>"
            + "    <div class=\"table-cell header toprow\" style=\"text-align: center;\">Details</div>"
            + "</div>"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell\">Frequencies</div>"
            + "    <div class=\"table-cell\" style=\"text-align: right;\">" + freqhtml + "</div>"
            + "</div>"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell\">GnuRadio Status</div>"
            + "    <div class=\"table-cell\" style=\"text-align: right;\"><mark class=\"okay\">[Okay]</mark></div>"
            + "</div>"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell\">SDR Information</div>"
            + "    <div class=\"table-cell\" style=\"text-align: right;\">RTL-SDR #: " + rtl_id + "<br>Product: " + antennas[i].rtl_product + "<br>Manufacturer: " + antennas[i].rtl_manufacturer  + "<br>Serial No: " + antennas[i].rtl_serialnumber + "</div>"
            + "</div>"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell\">Igating Status</div>"
            + "    <div class=\"table-cell\" style=\"text-align: right;\">" + (statusJson.igating == "true" ? "<mark class=\"okay\">[igating]</mark>" : "<span style=\"font-variant: small-caps;\">[NO]</span>") + "</div>"
            + "</div>"
            + "<div class=\"table-row\">"
            + "    <div class=\"table-cell\">Beaconing Status</div>"
            + "    <div class=\"table-cell\" style=\"text-align: right;\">" + (statusJson.beaconing == "true" ? "<mark class=\"okay\">[beaconing]</mark>" : "<span style=\"font-variant: small-caps;\">[NO]</span>") + "</div>"
            + "</div>"
            + "</div>"
            + "</div>";
    }

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
          $("#direwolferror").html(" &nbsp; <mark class=\"notokay\">[ audio error ]</mark>");
  else
          $("#direwolferror").html("");

  });
}


/***********
* getgps
*
* This function will get the current status of the GPS that's connected to the system and populate the web page with its status/state
***********/
function getgps() {
    $.get("getgps.php", function(data) {
        var jsonData = JSON.parse(data);
        var gpsfix;

        gpsMode = jsonData.mode * 10 / 10;
        if (gpsMode == 0)
            gpsfix = "<mark class=\"notokay\" style=\"font-size: .9em;\">[ no data ]</mark>";
        else if (gpsMode == 1)
            gpsfix = "<mark class=\"notokay\" style=\"font-size: .9em;\">[ NO FIX ]</mark>";
        else if (gpsMode == 2)
            gpsfix = "<mark class=\"marginal\" style=\"font-size: .9em;\">[ 2D FIX ]</mark>";
        else if (gpsMode == 3) 
            gpsfix = "<mark class=\"okay\" style=\"font-size: .9em;\">[ 3D FIX ]</mark>";
        else
            gpsfix = "n/a";

        var theDate = jsonData.utc_time;
        theDate = theDate.replace(/T/g, " "); 
        theDate = theDate.replace(/.[0-9]*Z$/g, ""); 
        var gpshtml = "<table cellpadding=0 cellspacing=0 border=0>" 
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">UTC Time:</td><td>" + theDate + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Latitude:</td><td>" + jsonData.lat + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Longitude:</td><td>" + jsonData.lon + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Speed MPH:</td><td>" + jsonData.speed_mph + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Altitude (ft):</td><td>" + jsonData.altitude + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">GPS Fix:</td><td>" + gpsfix + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Device Status:</td><td>" 
            + (jsonData.status == "normal" ? jsonData.status : "<mark class=\"marginal\">" + jsonData.status + "</mark>")
            + "</td></tr>"
            + "<tr><td style=\"text-align: left; padding-right: 10px;\">Device Path:</td><td>" + jsonData.devicepath + "</td></tr></table>";
 
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


/***********
* ready
*
* This function is only called once the web page is fully loaded.
***********/
$(document).ready(function () {

    updateMapLink();
    getrecentdata();
    getConfiguration();
    getgps();
    setInterval(function() {
        updateMapLink();
        getrecentdata();
        getgps();
        getConfiguration();
    }, 5000);
});
