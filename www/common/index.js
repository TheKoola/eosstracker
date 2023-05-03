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

var backendRunning = 0;
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

        var timezone = (typeof(jsonData.timezone) == "undefined" ? "" : jsonData.timezone);
        document.getElementById("timezone").innerHTML = timezone;
    });
}


/***********
* startUpProcesses
*
* This function will submit a request to the backend web system to start the various daemons for the system.
***********/
function startUpProcesses() {
    if (processInTransition == 0 && !backendRunning) {
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
    if (processInTransition == 0 && backendRunning) {
        processInTransition = 2;
        var stoppinghtml = "<p><mark class=\"marginal\">Shutting down...</mark></p>";
        document.getElementById("antenna-data").innerHTML = stoppinghtml;
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

    // Get the status of the backend processes
    $.get("getstatus.php", function(data) { 
        var statusJson = data;
        var keys = Object.keys(statusJson.processes);

        /* Loop through the processes looking for the habtracker-d process */
        for (i = 0; i < keys.length; i++) {
            if (statusJson.processes[i].process.startsWith("habtracker")) {
                var habtracker_process = statusJson.processes[i];

                // update global status
                backendRunning = habtracker_process.status;

                // Update our "in transition" status
                switch(processInTransition) {
                    case 1: // we're starting up...

                        // If the backend daemon is running, then we're no longer in transition
                        if (backendRunning > 0)
                            processInTransition = 0;
                        break;

                    case 2:  // we're shutting down...

                        // If the backend daemon is no longer running, then we're no longer in transition
                        if (backendRunning == 0)
                            processInTransition = 0;
                        break;

                    default: // we're not in transition...

                        // Update the overall system status section
                        document.getElementById("antenna-data").innerHTML = (backendRunning > 0 ? 
                            "<p><mark class=\"okay\">Running in online mode</mark></p>" :
                            "<p><mark class=\"marginal\">Not running...</mark></p>");

                        // Update the process status indicator
                        document.getElementById("habtracker-d-status").innerHTML = (backendRunning > 0 ? 
                            "<mark class=\"okay\">[Okay]</mark>" :
                            "<mark class=\"notokay\">[Not okay]</mark>");

                        break;
                }

                // break out of this for loop as we've found the habtracker daemon entry we were looking for.
                break;
            }
        }
    });

    // Get logs from the running system
    $.get("getlogs.php", function(data) {
        var logsJson = JSON.parse(data);
      
        // Blank the stdout log area
        $("#logfile").html("");
        
        // Loop through each line of the log file escaping any special characters and appending it to the display area
        for (a in logsJson.log) 
            $("#logfile").append(escapeHtml(logsJson.log[a]));

        // Blank the stderr log area
        $("#errfile").html("");

        // Loop through each line of the log file escaping any special characters and appending it to the display area
        for (a in logsJson.err) 
            $("#errfile").append(escapeHtml(logsJson.err[a]));
    });
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
