/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2023 Jeff Deaton (N6BA)
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

var checkcount = 0;
var processInTransition = 0;
var interval;

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
* getrecentdata
*
* This function will fetch current status of processes, system status, SDR info, logs, etc. and populate the web page as needed.
***********/
function getrecentdata() {

    $.get("getstatus.php", function(data) { 
        var statusJson = data;
        var keys = Object.keys(statusJson.processes);

        var processtable = document.getElementById("processtable");
        for (proc in statusJson.processes) {

            var theproc = statusJson.processes[proc].process;
            var thestatus = statusJson.processes[proc].status;
            var procElement = document.getElementById(theproc);

            // If the element exists, then udpate the process status
            if (procElement) {
                procElement.setAttribute("class", (thestatus > 0 ? "okay" : "notokay"));
                procElement.innerHTML = (thestatus > 0 ? "[okay]" : "[not okay]");
                procElement.dataset.lastupdate = Math.floor(Date.now() / 1000.0);
                procElement.dataset.status = thestatus;
            }

            // if the element doesn't exist, then we need to add a row the process table.
            else {

                // Create the div row
                var row = document.createElement("DIV");
                row.setAttribute("class", "table-row");
                row.setAttribute("id", theproc + "-row");

                // Create the left-hand cell
                var left = document.createElement("DIV");
                left.setAttribute("class", "table-cell");
                left.setAttribute("style", "border-top: none;");
                left.innerHTML = theproc;
                row.appendChild(left);

                // Create the right-hand cell
                var right = document.createElement("DIV");
                right.setAttribute("class", "table-cell");
                right.setAttribute("style", "text-align: right;");
                row.appendChild(right);

                // Create the marker element
                var marker = document.createElement("MARK");
                marker.setAttribute("id", theproc);
                marker.setAttribute("class", (thestatus > 0 ? "okay" : "notokay"));
                marker.innerHTML = (thestatus > 0 ? "[okay]" : "[not okay]");
                marker.dataset.process = "true";
                marker.dataset.status = thestatus;
                marker.dataset.lastupdate = Math.floor(Date.now() / 1000.0);
                marker.dataset.row = row;
                right.appendChild(marker);

                // Add the row to the div table
                processtable.appendChild(row);
            }
        }

        // Now loop through all process elements removing those that haven't seen an update in > 5mins
        var procs = document.querySelectorAll('[data-process="true"]');
        procs.forEach(function checkproc(elem) {
            var lastupdate = elem.dataset.lastupdate;
            var now = Math.floor(Date.now() / 1000.0);

            if (lastupdate && now - lastupdate > 300) {
                var tbl = document.getElementById("processtable");
                var rowelem = elem.dataset.row;

                if (tbl && rowelem)
                    tbl.removeChild(rowelem);
            }
        });

        // get the state of the habtracker daemon
        var state = isRunning();

        // check the state of what we're doing (i.e. starting, stopping, started, stopped, etc.)
        switch (processInTransition) {

            // We're either stopped or started, but not in transition
            case 0:
                checkcount = 0;
                setStatus((state ? "Running" : "Not running"), state);
                break;

            case 1: // we're starting up...
            case 2: // we're shutting down...

                if ((state && processInTransition == 1) || (!state && processInTransition == 2)) {
                    processInTransition = 0;
                    checkcount = 0;
                    setStatus((state ? "Running" : "Not running"), state);
                }
                else {
                    checkcount += 1;

                    if (checkcount > 5) {
                        processInTransition = 0;
                        checkcount = 0;
                    }
                }

                break;

            // shouldn't get here
            default:
                break;
        }

    });

    $.get("getlogs.php", function(data) {
        var logsJson = data;
        var logfile = document.getElementById("logfile");
        var errfile = document.getElementById("errfile");
        var beacons = document.getElementById("beacons");
        var direwolf = document.getElementById("direwolflog");
        
        logfile.innerHTML = "";
        for (a in logsJson.log) 
            //logfile.append(escapeHtml(logsJson.log[a]));
            logfile.append(logsJson.log[a]);

        errfile.innerHTML = "";
        for (a in logsJson.err) 
            errfile.append(escapeHtml(logsJson.err[a]));

        beacons.innerHTML = "";
        for (a in logsJson.beacons) 
            beacons.append(escapeHtml(logsJson.beacons[a]));

        direwolf.innerHTML = "";
        if (typeof(logsJson.direwolf) == "string") {
            direwolf.innerHTML = logsJson.direwolf;
        }
        else if (Array.isArray(logsJson.direwolf)) {
            if (logsJson.direwolf.indexOf("Could not open audio device") >= 0)
                direwolf.innerHTML = " &nbsp; <mark class=\"notokay\">[ audio error ]</mark>";
            else {
                for (a in logsJson.direwolf) 
                    direwolf.append(escapeHtml(logsJson.direwolf[a]));
            }
        }
        else 
            direwolf.innerHTML = logsJson.direwolf;
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
            getgps();
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
    getgps();
    interval = setInterval(function() {
        updateMapLink();
        getrecentdata();
        getgps();
        getConfiguration();
    }, 5000);
});



/***********
* isrunning
*
* This function will get the running data element of the HTML element that represents the habtracker daemon backend process
***********/
function isRunning() {
    var habtracker = document.getElementById("habtracker-d");
    return (habtracker && habtracker.dataset.status ? habtracker.dataset.status * 1 : 0);
}

/***********
* setStatus
*
* This function post the status message, with the particular severity (1 - okay (green), 0 - not okay (yellow))
***********/
function setStatus(text, severity) {
    var elem = document.getElementById("antenna-data");
    var marker = elem.querySelector("MARK");

    if (elem) {
        if (marker) {
            marker.setAttribute("class", (severity ? "okay" : "marginal"));
            marker.innerHTML = text;
        }
        else {
            // create a paragraph element
            var p = document.createElement("P");
            p.setAttribute("class", "normal-noborders");
            elem.appendChild(p);

            // Create the marker element
            var m = document.createElement("MARK");
            m.setAttribute("class", (severity ? "okay" : "marginal"));
            m.innerHTML = text;
            p.appendChild(m);
        }
    }
}


/***********
* startUpProcesses
*
* This function will submit a request to the backend web system to start the various daemons for the system.
***********/
function startUpProcesses() {
    if (processInTransition == 0 && !isRunning()) {
        processInTransition = 1;
        setStatus("Starting...", false);
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
    if (processInTransition == 0 && isRunning()) {
        processInTransition = 2;
        var stoppinghtml = "<p><mark class=\"marginal\">Shutting down...</mark></p>";
        setStatus("Shutting down...", false);
        document.getElementById("antenna-data").innerHTML = stoppinghtml;
        $.get("shutdown.php", function(data) {
            getrecentdata();
        });
    }

    return false;
}


/***********
* ready
*
* This function is only called once the web page is fully loaded.
***********/
$(document).ready(function () {

    getrecentdata();
    getConfiguration();
    setInterval(function() {
        getrecentdata();
        getConfiguration();
    }, 5000);
});
