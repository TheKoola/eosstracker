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

var processInTransition = 0;
var interval;
var isRunning = 0;

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
        var ssid = jsonData.ssid;
        var ka9q = (typeof(jsonData.ka9qradio) == "undefined" ? false : (jsonData.ka9qradio == "true" ? true : false));
        var ka9qhtml = (ka9q ? "<mark class=\"marginal\">yes</mark>" : "no");

        // check if we should even be using an ssid (i.e. we're not beaconing) or if it's '0' and we shouldn't be displaying it with a callsign
        if (typeof(jsonData.beaconing) == "undefined" || callsign == "" || ssid == "0" || ssid == 0)
            ssid = "";

        //var ssid = (typeof(jsonData.beaconing) == "undefined" ? "" : (callsign == "" ? "" : "-" + jsonData.ssid));

        document.getElementById("callsign").innerHTML = (callsign == "" ? "n/a" : callsign);
        document.getElementById("timezone").innerHTML = timezone;
        document.getElementById("igating").innerHTML = i2;
        document.getElementById("beaconing").innerHTML = b2;
        document.getElementById("ssid").innerHTML = (ssid != "" ? "-" + ssid : ""); 
        document.getElementById("ka9qradio").innerHTML = ka9qhtml;
    });
}


/***********
* startUpProcesses
*
* This function will submit a request to the backend web system to start the various daemons for the system.
***********/
function startUpProcesses() {
    if (processInTransition == 0 && isRunning == 0) {
        processInTransition = 1;
        var startinghtml = "<p><mark class=\"marginal\">Starting...</mark></p>";
        document.getElementById("antenna-data").innerHTML = startinghtml;
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
    var stoppinghtml = "<p><mark class=\"marginal\">Shutting down...</mark></p>";
    document.getElementById("antenna-data").innerHTML = stoppinghtml;
    $.get("shutdown.php", function(data) {
        processInTransition = 2;
        getrecentdata();
    });

    return false;
}


/***********
* getrecentdata
*
* This function will fetch current status of processes, system status, SDR info, logs, etc. and populate the web page as needed.
***********/
function getrecentdata() {
  $.get("getstatus.php", function(data) { 
      var statusJson = data;
      var keys = Object.keys(statusJson.processes);
      var antennas = statusJson.antennas
      var i = 0;
      var procs = 0;
      var procstatus = {
          "direwolf" : false,
          "gpsd" : false,
          "aprsc" : false,
          "backend" : false
      };

      // update the GPS status box
      if (typeof(statusJson.gps) != "undefined")
          setgps(statusJson.gps);

      // is the backend active?
      var isActive = (typeof(statusJson.active) != "undefined" ? (statusJson.active == 1 || statusJson.active == "true" || statusJson.active == true ? true : false) : false);

      // is the backend beaconing?
      var isBeaconing = (typeof(statusJson.beaconing) != "undefined" ? (statusJson.beaconing == 1 || statusJson.beaconing == "true" || statusJson.beaconing == true ? true : false) : false);

      // are we igating?
      var isIgating = (typeof(statusJson.igating) != "undefined" ? (statusJson.igating == 1 || statusJson.igating == "true" || statusJson.igating == true ? true : false) : false);

      // is the backend connected to an SDR dongle?
      var isRFMode = (typeof(statusJson.rf_mode) != "undefined" ? (statusJson.rf_mode == 1 || statusJson.rf_mode == "true" || statusJson.rf_mode == true ? true : false) : false);

      // are we listening for packets from an instance of KA9Q-Radio running on the local network?
      var isKa9qradio = (typeof(statusJson.ka9qradio) != "undefined" ? (statusJson.ka9qradio == 1 || statusJson.ka9qradio == "true" || statusJson.ka9qradio == true ? true : false) : false);

      // should we be expecting gpsd to be running?  Is the gpshost set to the local system?
      var gpsHost = (typeof(statusJson.gpshost) != "undefined" ? statusJson.gpshost.toLowerCase() : "");
      var expectGPSD = (gpsHost == "" || gpsHost == "local" || gpsHost == "localhost" || gpsHost == "127.0.0.1" || gpsHost == "127.0.1.1" ? true : false);


      // Loop through the processes and update their status 
      for (i = 0; i < keys.length; i++) {
          document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
              (statusJson.processes[i].status > 0 ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
          procs += statusJson.processes[i].status; 

          var procname = statusJson.processes[i].process.toLowerCase();
          var proc_status = statusJson.processes[i].status;

          if (procname.startsWith("direwolf")) {
              procstatus.direwolf = (proc_status == 1 || proc_status == 1 || proc_status == "true" || proc_status == true ? true : false);
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
                  (procstatus.direwolf ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
          }
          else if (procname.startsWith("aprs")) {
              procstatus.aprsc = (proc_status == 1 || proc_status == 1 || proc_status == "true" || proc_status == true ? true : false);
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
                  (procstatus.aprsc ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
          }
          else if (procname.startsWith("gpsd")) {
              procstatus.gpsd = (proc_status == 1 || proc_status == 1 || proc_status == "true" || proc_status == true ? true : false);
              if (expectGPSD) {
                  document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
                      (procstatus.gpsd ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
              }
              else {
                  // we are not expecting that GPSD is running on this system as we're using a non-local hostname for the gpshost.  So we just mark this status as "n/a".
                  document.getElementById(statusJson.processes[i].process + "-status").innerHTML = "n/a";
              }
          }
          else if (procname.startsWith("habtrack")) {
              procstatus.backend = (proc_status == 1 || proc_status == 1 || proc_status == "true" || proc_status == true ? true : false);
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = 
                  (procstatus.backend ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
          }
      }

      // determine if the backend is actually running.  
      // isRunning:
      // 0 - not running
      // 1 - running
      // -1 - transitioning or some odd state
      //
      // backend is "active", we've found an SDR dongle attached
      if (isActive && isRFMode) {

          // ...then we'd expect to find direwolf, aprsc, and the backend running
          if (procstatus.direwolf && procstatus.aprsc && procstatus.backend)
              isRunning = 1;
          else
              // huh...the backend says that we're "active" and in "rf_mode", but yet the [some of the] processes we were expecting aren't running?
              isRunning = -1;
      }
      // backend is "active", but there wasn't an SDR dongle attached...so we're presumably running in "online" mode
      else if (isActive && !isRFMode) {

          // ...then we'd expect to find just aprsc and the backend running.  Although direwolf might be running, but just for beaconing via an external radio.
          if (procstatus.aprsc && procstatus.backend)
              isRunning = 1;
          else
              isRunning = -1;
      }
      // the backend is not active as it doesn't think it's running.
      else if (!isActive) {

          //...then we'd expect that no processes are running, except maybe GPSD
          if (!procstatus.direwolf && !procstatus.aprsc && !procstatus.backend)
              isRunning = 0;
          else
              isRunning = -1;
      }
      // Shouldn't get here, but just in case
      else
          isRunning = 0;


      // debugging
      //document.getElementById("error").innerHTML = "<pre>isRunning: " + isRunning + "\nprocstatus: " + JSON.stringify(procstatus) + "\nstatusJson: " + JSON.stringify(statusJson)
      //    + "\nexpectGPSD: " + expectGPSD
      //    + "</pre>";

      // find out what state we're in... and update the onscreen status
      //

      if (processInTransition == 1) {    // we're starting up...

          if (isRunning == 1)
              processInTransition = 0;

          else if (isRunning == 0)
              // we must have tried to start, but hit a failure and now nothing is running.
              processInTransition = 0;

          // blank the direwolf error section since we're in transition.  This is updated further below
          $("#direwolferror").html("");

      }
      else if (processInTransition == 2) {     // we're shutting down...
          if (isRunning == 0)
              processInTransition = 0; 

          // blank the direwolf error section since we're in transition.  This is updated further below
          $("#direwolferror").html("");

      }


      // we're either up or shutdown, but we're NOT in transition
      // if we're no longer in transition, update the status screens 
      //
      // We only want to update the status screen if we're NOT in transition
      if (processInTransition == 0) {   

          // if we're running and connected to an SDR, then udpate the status area with the antenna/SDR details
          if (isRunning && isRFMode) { 

              // if there are antennas/SDR detailed being reported then we display that
              if (antennas.length > 0) {
                  var antenna_html = "<div class=\"div-table\" style=\"float: left;\">";

                  for (i = 0; i < antennas.length; i++) {
                      var frequencies = antennas[i].frequencies;  
                      var rtl_id = antennas[i].rtl_id;
                      var k = 0;
                      var freqhtml = "";
                      var callsign_html = "";
                      //document.getElementById("debug").innerHTML = JSON.stringify(frequencies);
                      //

                      var product_name_lower = antennas[i].rtl_product.toLowerCase();
                      var instancename = (product_name_lower.includes("rtl") ? "rtl" : (product_name_lower.includes("airspy") ? "airspy" : "rtl"))

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
                          + "    <div class=\"table-cell\" style=\"text-align: right;\">" + instancename + " = " + rtl_id + "<br>Product: " + antennas[i].rtl_product + "<br>Manufacturer: " + antennas[i].rtl_manufacturer  + "<br>Serial No: " + antennas[i].rtl_serialnumber + "</div>"
                          + "</div>"
                          + "<div class=\"table-row\">"
                          + "    <div class=\"table-cell\">Igating Status</div>"
                          + "    <div class=\"table-cell\" style=\"text-align: right;\">" + (isIgating ? "<mark class=\"okay\">[igating]</mark>" : "<span style=\"font-variant: small-caps;\">[NO]</span>") + "</div>"
                          + "</div>"
                          + "<div class=\"table-row\">"
                          + "    <div class=\"table-cell\">Beaconing Status</div>"
                          + "    <div class=\"table-cell\" style=\"text-align: right;\">" + (isBeaconing ? "<mark class=\"okay\">[beaconing]</mark>" : "<span style=\"font-variant: small-caps;\">[NO]</span>") + "</div>"
                          + "</div>"
                          + "</div>"
                          + "</div>";
                  }

                  // update the status screen area
                  $("#antenna-data").html(antenna_html);
              }
              else {  // no antenna info...which is odd, since we're supposed to be in RF mode...but...
                  var donehtml = "<p><mark class=\"okay\">Running.</mark></p>";

                  // Update the onscreen status
                  $("#antenna-data").html(donehtml);
              }
          }
          else if (isRunning && !isRFMode) {  // We're running in online mode...i.e. SDRs are not attached to the system
              if (isKa9qradio) 
                  donehtml = "<p><mark class=\"okay\">Listening for packets from KA9Q-Radio</mark></p>";
              else
                  donehtml = "<p><mark class=\"okay\">Running in online mode - no SDRs found.</mark></p>";

              // Update the onscreen status
              $("#antenna-data").html(donehtml);
          }
          else {  // we're not running
              var donehtml = "<p><mark class=\"marginal\">Not running.</mark></p>";

              // Update the onscreen status
              $("#antenna-data").html(donehtml);
          }
      }
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
* setgps
*
* This function will populate the web page with the GPS status/state in the 'jsonData' argument
***********/
function setgps(jsonData) {
    var gpsfix;

    // if the backend processes are NOT running, then we need to "blank" out the GPS status section.  We do that by setting the jsonData variable to 
    // the default set.  We do this because if the backend crashed or the system rebooted, etc., then the gpsstatus.json file is likely stale and does
    // not reflect reality.
    /*
    if (!isRunning) {
        jsonData = {
            "utc_time": "n/a",
            "mode": 0,
            "host": jsonData.host,
            "status": "n/a",
            "devicepath": "n/a",
            "lat": 0.0,
            "lon": 0.0,
            "satellites": [],
            "bearing": 0.0,
            "speed_mph": 0.0,
            "altitude": 0.0,
            "error": "n/a" 
        };
    }
    */

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

    // if there is an error string included (usually from a GPSD connection fault), then format that and save the HTML string into 'errorstring'
    var errorstring = "";
    if (jsonData.error && jsonData.error != "n/a") {
        errorstring = "<tr><td style=\"text-align: left; padding-right: 10px;\">Error:</td><td>"
        + "<mark class=\"marginal\">" + jsonData.error + "</mark></td></tr>";
    }

    var theDate = jsonData.utc_time;
    theDate = theDate.replace(/T/g, " "); 
    theDate = theDate.replace(/Z$/g, ""); 
    var gpshtml = "<table cellpadding=0 cellspacing=0 border=0>" 
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Host:</td><td><strong>" + jsonData.host + "</strong></td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">UTC Time:</td><td>" + theDate + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Latitude:</td><td>" + jsonData.lat + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Longitude:</td><td>" + jsonData.lon + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Speed MPH:</td><td>" + jsonData.speed_mph + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Altitude (ft):</td><td>" + jsonData.altitude + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">GPS Fix:</td><td>" + gpsfix + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Device Status:</td><td>" 
        + (jsonData.status == "normal" ? jsonData.status : "<mark class=\"marginal\">" + jsonData.status + "</mark>")
        + "</td></tr>"
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Device Path:</td><td>" + jsonData.devicepath + "</td></tr>"
        + errorstring
        + "</table>";

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
* lostFocus
*
* This function is called when the browser tab loses focus
***********/
function lostFocus() {
    var isiPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) || navigator.platform === 'iPad';
    var isMobile = 'ontouchstart' in document.documentElement ||  navigator.maxTouchPoints > 1;

    // If this is a mobile device then stop periodic updates...at least until the browser tab is in focus again.
    if ((isiPad || isMobile) && interval) {
        clearInterval(interval);
    }

    return 0;
}


/***********
* gainFocus
*
* This function is called when the browser tab regains focus
***********/
function gainFocus() {
    // if we're regaining focus, then restart periodic page updates.
    if (interval) {
        clearInterval(interval);
        interval = setInterval(function() {
            updateMapLink();
            getrecentdata();
            getConfiguration();
        }, 5000);
    }
    return 0;
}


/***********
* ready
*
* This function is only called once the web page is fully loaded.
***********/
$(document).ready(function () {

    window.onfocus = gainFocus;
    window.onblur = lostFocus;

    updateMapLink();
    getrecentdata();
    getConfiguration();
    interval = setInterval(function() {
        updateMapLink();
        getrecentdata();
        getConfiguration();
    }, 5000);
});
