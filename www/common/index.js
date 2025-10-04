/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, Jeff Deaton (N0JD)
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

// process state globals
let processInTransition = 0;
let interval;
let isRunning = false;
let waitingOnStatus = false;

// SSE event handler
let eventsource;

// the nodeid of this system
let nodeid;


/***********
* escapeHtml
*
* This function will escape HTML special chars
***********/
function escapeHtml(s) {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };

   return s.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/***********
* getDefinitions
*
* This will fetch the flight and tracker definitions fromt the backend.
***********/
async function getDefinitions() {

    // get the list of flights
    let response = await fetch("getdefinitions2.php");
    let js;
    let num = 0;

    // Parse the returned json
    try {
        js = await response.json();
    } catch(e) {
        console.log("getDefinitions json parsing error: ", e, ", json: ", js);
    }

    // process tracker definitions
    if (js && js.trackers)
        num += processTrackers(js.trackers.data);

    // process flight definitions
    if (js && js.flights)
        num += processFlights(js.flights.data);

    return num;
}


/***********
* processConfiguration
*
* process incoming JSON that represents configuration data
***********/
/*
function processConfiguration(json) {
    if (!json)
        return;

    try {
        let callsign = (typeof(json.station.callsign) == "undefined" ? "" : json.station.callsign);
        let timezone = (typeof(json.station.timezone) == "undefined" ? "" : json.station.timezone);
        let audiodev = (typeof(json.direwolf.audiodev) == "undefined" ? "" : json.direwolf.audiodev);
        let igating = (typeof(json.aprsis.igating) == "undefined" ? "false" : json.aprsis.igating);
        let i = (igating == "true" ? "yes" : "no");
        let i2 = (i == "yes" ? "<mark class=\"marginal\">" + i + "</mark>" : i);
        let beaconing = (typeof(json.direwolf.beaconing) == "undefined" ? "false" : json.direwolf.beaconing);
        let eoss = (typeof(json.direwolf.eoss_string) == "undefined" ? "" : (typeof(json.direwolf.includeeoss) == "undefined" ? "" : (json.direwolf.includeeoss == "true" ? json.direwolf.eoss_string : "")));
        let b = (beaconing == "true" || beaconing == true ? "yes" : "no");
        let b2 = (b == "yes" ? "<mark class=\"marginal\">" + b + (eoss != "" ? "</mark><br>Path String: <mark class=\"marginal\">" + eoss + " " : "") + "</mark>" : b);

        // update status elements
        document.getElementById("callsign").innerHTML = (callsign == "" ? "n/a" : callsign);
        document.getElementById("timezone").innerHTML = timezone;
        document.getElementById("igating").innerHTML = i2;
        document.getElementById("beaconing").innerHTML = b2;
    }
    catch (e) {
        alert("processConfiguration error: " + e);
    }
}

/*

/***********
* processConfiguration
*
* process incoming configuration information and update the page with a table representing that info.
***********/
function processConfiguration(json) {

    // sanity check
    if (!json)
        return;

    // the tablediv that we'll add rows too
    let element = document.getElementById("configtable");
    element.innerHTML = "";

    // create a new div table
    let div = document.createElement("div");
    div.setAttribute("class", "div-table");
    div.setAttribute("style", "float: left;");

    let p = document.createElement("p");
    p.setAttribute("class", "normal-italic");
    p.setAttribute("style", "margin: 0; padding: 0;");
    let ts = new Date(Date.now());
    p.innerHTML = ts.toLocaleString();
    div.appendChild(p);

    // create the table that will contain the configuration elements
    let table = document.createElement("table");
    table.setAttribute("class", "trackerlist");
    table.setAttribute("style", "width: auto");
    div.appendChild(table);

    //The header columns
    let columns = ["Configuration", "Setting"];

    //Add the header row
    let headerrow = table.insertRow(-1);
    for (c in columns) {
        let headercell = headerrow.insertCell(-1);
        headercell.setAttribute("class", "trackerlistheader");
        headercell.innerHTML = columns[c];
    }


    // create an array of configuration items from the incoming JSON
    let config = [];

    if (json.station && json.direwolf && json.aprsis) {

        // this system's name 
        config.push({
            "name": "Hostname",
            "value": location.hostname
        });

        // this system's nodeid (if it exists)
        config.push({
            "name": "Node ID",
            "value": (nodeid ? nodeid : "n/a")
        });

        // the callsign
        config.push({
            "name": "Callsign",
            "value": (typeof(json.station.callsign) == "undefined" ? "n/a" : json.station.callsign)
        });

        // the timezone
        config.push({
            "name": "Timezone",
            "value": (typeof(json.station.timezone) == "undefined" ? "n/a" : json.station.timezone)
        });

        // direwolf's audio device?
        //let audiodev = (typeof(json.direwolf.audiodev) == "undefined" ? "" : json.direwolf.audiodev);

        // igating?
        config.push({
            "name": "Igating",
            "value": (toBoolean(json.aprsis.igating) ? "<mark class=\"marginal\">yes</mark>" : "no")
        });

        // RF beaconing enabled?
        let beaconing = toBoolean(json.direwolf.beaconing);
        let useEossString = toBoolean(json.direwolf.includeeoss);

        // is there an eoss string defined?
        let eoss = (typeof(json.direwolf.eoss_string) == "undefined" ? "" : (useEossString ? json.direwolf.eoss_string : ""));

        // RF Beaconing setup
        config.push({
            "name": "RF Beaconing",
            "value": (beaconing ? "<mark class=\"marginal\">yes" + (eoss != "" ? "</mark><br>Path String: <mark class=\"marginal\">" + eoss + " " : "") + "</mark>" : "no")
        });
    }


    // loop counter
    let i = 0;


    // now loop through each configuration item, adding it to a table
    for (item in config) {

        // start by creating a new table row
        let tablerow = table.insertRow(-1);

        // the name of the configuration item
        let name = tablerow.insertCell(-1);
        name.setAttribute("class", "trackerlist");
        name.innerHTML = config[item].name;

        // the value of the configuration item
        let value = tablerow.insertCell(-1);
        value.setAttribute("class", "trackerlist");
        value.setAttribute("style", "text-align: right; font-family:  'Lucida Console', Monaco, monospace;");
        value.innerHTML = config[item].value;

        // adjust the background color if this is an odd row
        if (i % 2) {
            name.setAttribute("style", "background-color: #737373;"); 
            value.setAttribute("style", "background-color: #737373; text-align: right; font-family:  'Lucida Console', Monaco, monospace;");
        }

        i++;
    }

    // finally add to the element
    element.appendChild(div);

}

/*******
 * toBoolean
 *
 * Handle incoming JSON values that could be strings or booleans
 *******/
function toBoolean(value) {

    // sanity check 
    if (!value)
        return false;

    // is it string?
    if (typeof value === "string") {
        return value.toLowerCase() === "true";
    }

    // was it already a boolean?
    if (typeof value === "boolean") {
        return value;
    }

    return false;
}


/***********
* processTrackers
*
* process incoming tracker json
***********/
function processTrackers(json) {
    if (!json)
        return;

    // reduce the incoming JSON to make a nicer list
    const trackers = json.reduce((acc, curr) => {
        const tactical = curr.tactical;

        if (!acc[tactical]) {
            acc[tactical] = {
                "tactical": tactical,
                "trackers": []
            };
        }
        acc[tactical].trackers.push({ "callsign": curr.callsign, "notes": curr.notes});

        return acc;

    }, {});


    // the tablediv that we'll add rows too
    let element = document.getElementById("trackertable");
    element.innerHTML = "";

    // create a new div to contain everything.
    let div= document.createElement("div");
    div.setAttribute("class", "div-table");
    div.setAttribute("style", "float: left;");

    let p = document.createElement("p");
    p.setAttribute("class", "normal-italic");
    p.setAttribute("style", "margin: 0; padding: 0;");
    let ts = new Date(Date.now());
    p.innerHTML = ts.toLocaleString();
    div.appendChild(p);

    // create the table that will contain the trackers 
    let table = document.createElement("table");
    table.setAttribute("class", "trackerlist");
    table.setAttribute("style", "width: auto");
    div.appendChild(table);

    //The header columns
    let columns = ["Active Trackers", "Callsign", "Notes"];

    //Add the header row
    let headerrow = table.insertRow(-1);
    for (c in columns) {
        let headercell = headerrow.insertCell(-1);
        headercell.setAttribute("class", "trackerlistheader");
        headercell.innerHTML = columns[c];
    }

    // loop counter
    let i = 0;

    //---- all the individual table rows --- 
    for (team in trackers) {

        // only want to add active trackers
        if (trackers[team].tactical != "ZZ-Not Active") {

            // the list of trackers associated with this tactical call
            let trackerlist = trackers[team].trackers;

            // the number of trackers
            let num_trackers = trackers[team].trackers.length;

            // start by creating a new table row
            let tablerow = table.insertRow(-1);

            // the tactical
            let teamcell = tablerow.insertCell(0);
            teamcell.setAttribute("class", "trackerlist");
            teamcell.innerHTML = trackers[team].tactical;

            if (num_trackers > 1) 
                teamcell.setAttribute("rowspan", num_trackers+1);

            // the background coloring for every other row
            if (i % 2) 
                teamcell.setAttribute("style", "background-color: #737373;"); 

            // now loop through the list of trackers
            for (t in trackerlist) {

                // if the number of trackers is > 1, then we create a new row 
                if (num_trackers > 1) 
                    row = table.insertRow(-1);
                else 
                    row = tablerow;

                let callsign = trackerlist[t].callsign;
                let notes = trackerlist[t].notes;

                // the callsign cell
                let callcell = row.insertCell(-1);
                callcell.setAttribute("class", "trackerlist");
                callcell.innerHTML = callsign;

                // the notes cell
                let notescell = row.insertCell(-1);
                notescell.setAttribute("class", "trackerlist");
                notescell.innerHTML = notes;

                // adjust the background color if this is an odd row
                if (i % 2) {
                    callcell.setAttribute("style", "background-color: #737373;"); 
                    notescell.setAttribute("style", "background-color: #737373;"); 
                }
            }

            // increment the row counter
            i++;
        }
    }


    // finally add to the element
    element.appendChild(div);
}


/***********
* processFlights
*
* process incoming json for the list of active flights, their beacons, and the launchsite data
***********/
function processFlights(json) {

    if (!json)
        return;

    // reduce the incoming JSON
    const pivot = json.reduce((acc, curr) => {
        const fid = curr.flightid;

        if (!acc[fid]) {
            acc[fid] = {
                "beacons": curr.callsign + " (" + curr.frequency + "MHz)",
                "lat": curr.launch_latitude,
                "lon": curr.launch_longitude,
                "elevation": curr.launch_altitude,
                "launchsite": curr.launchsite,
                "description": curr.description,
                "flightid": fid
            };
        }
        else {
            acc[fid].beacons += ", " + curr.callsign + " (" + curr.frequency + "MHz)";
        }

        return acc;
    }, {});

    // the tablediv that we'll add rows too
    let element = document.getElementById("flighttable");
    element.innerHTML = "";

    // create a new div table
    let div = document.createElement("div");
    div.setAttribute("class", "div-table");
    div.setAttribute("style", "float: left;");

    let p = document.createElement("p");
    p.setAttribute("class", "normal-italic");
    p.setAttribute("style", "margin: 0; padding: 0;");
    let ts = new Date(Date.now());
    p.innerHTML = ts.toLocaleString();
    div.appendChild(p);

    // create the table that will contain the trackers 
    let table = document.createElement("table");
    table.setAttribute("class", "trackerlist");
    table.setAttribute("style", "width: auto");
    div.appendChild(table);

    let columns = ["Active Flights", "Beacons", "Description", "Location"];

    //Add the header row
    let headerrow = table.insertRow(-1);
    for (c in columns) {
        let headercell = headerrow.insertCell(-1);
        headercell.setAttribute("class", "trackerlistheader");
        headercell.innerHTML = columns[c];
    }

    // is this an apple platform?
    let isapple = isApple();

    // loop counter
    let i = 0;

    // loop through each flight
    for (f in pivot) {
        let flightid = pivot[f].flightid;
        let beacons = pivot[f].beacons;
        let description = pivot[f].description;

        // start by creating a new table row
        let tablerow = table.insertRow(-1);

        // the flight
        let flightcell = tablerow.insertCell(0);
        flightcell.setAttribute("class", "trackerlist");
        flightcell.innerHTML = flightid;

        // the beacons
        let beaconcell = tablerow.insertCell(-1);
        beaconcell.setAttribute("class", "trackerlist");
        beaconcell.innerHTML = beacons;

        // the description
        let desccell = tablerow.insertCell(-1);
        desccell.setAttribute("class", "trackerlist");
        desccell.innerHTML = description;

        // the location
        let loccell = tablerow.insertCell(-1);
        loccell.setAttribute("class", "trackerlist");

        // construct a random ID the copyToClipboard function can use to identify the coords string.
        let id = (Math.random() + 1).toString(36).split(".")[1].toUpperCase();

        let lat = (pivot[f].lat * 1.0).toFixed(4);
        let lon = (pivot[f].lon * 1.0).toFixed(4);

        // form up the URL that will take the user to their specific map platform for directions to these coordinates
        let URL;
        if (isapple)
            URL = "https://maps.apple.com/?q=" + pivot[f].launchsite.replace(/ /g, "%20") + "&ll=" + lat + "%2C" + lon;
        else
            URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon;

        loccell.innerHTML = pivot[f].launchsite + " &nbsp; " + (URL ? "<a target=\"_blank\" href=\"" + URL + "\">" : "") + "<span id=\"" + id + "-coords\">" + lat + ", " + lon + "</span>" + (URL ? "</a>" : "")
            + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: middle; height: 1em; width: 1em;\" onclick=\"copyToClipboard('" + id + "-coords')\">";

        if (i % 2) {
            flightcell.setAttribute("style", "background-color: #737373;"); 
            beaconcell.setAttribute("style", "background-color: #737373;");
            desccell.setAttribute("style", "background-color: #737373;");
            loccell.setAttribute("style", "background-color: #737373;");
        }

        // increment the row counter
        i++;
    }

    // finally add this table to the element
    element.appendChild(div);
}


/***********
* startUpProcesses
*
* This function will submit a request to the backend web system to start the various daemons for the system.
***********/
async function startUpProcesses() {

    if (processInTransition == 0 && !isRunning) {
        let startinghtml = "<p><mark class=\"marginal\">Starting...</mark></p>";
        document.getElementById("antenna-data").innerHTML = startinghtml;

        try {

            // blank the main log area
            let mainlog = document.getElementById("mainlog");
            if (mainlog)
                mainlog.innerHTML = "";

            // blank the stderr log area
            let stderr = document.getElementById("stderr");
            if (stderr)
                stderr.innerHTML = "";

            // signal to the backend that it's time to startup 
            const response = await fetch("startup.php");
            const data = await response.json();

            // set the process transition flag
            processInTransition = 1;

        } catch (error) {
            console.log({"function": "startUpProcesses", "error": error});
        }
    }

    return false;
}


/***********
* shutDownProcesses
*
* This function will submit a request to the backend web system to kill/stop the various daemons for the system.
***********/
async function shutDownProcesses() {

    let stoppinghtml = "<p><mark class=\"marginal\">Shutting down...</mark></p>";
    document.getElementById("antenna-data").innerHTML = stoppinghtml;

    try {

        // signal to the backend that it should shutdown
        const response = await fetch("shutdown.php");
        const data = await response.json();

        // set the process transition flag
        processInTransition = 2;

    } catch (error) {
        console.log({"function": "shutDownProcesses", "error": error});
    }

    return false;
}


/***********
* process logs 
***********/
function processLogs(logsJson) {

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
      document.getElementById("direwolf-error").innerHTML = " &nbsp; <mark class=\"notokay\">[ audio error ]</mark>";
  else
          document.getElementById("direwolf-error").innerHTML = "";
}


/***********
* Return the date/time object as an ISO formated string (YYYY-MM-DD HH:MM:SS)
***********/
function getISODateTimeString(thedate) {
    let ts;

    if (thedate)
        ts = thedate;
    else
        ts = new Date(Date.now());

    let str =
        ts.getFullYear() +
        "-" + padNumber(ts.getMonth()+1) +
        "-" + padNumber(ts.getDate()) +
        " " + padNumber(ts.getHours()) +
        ":" + padNumber(ts.getMinutes()) +
        ":" + padNumber(ts.getSeconds());
    return str;
}

/***********
* return a string represenation of a number, but padded with a leading zero.  Primarily used with times/dates.
***********/
function padNumber(n) {
    n = Math.floor(Math.abs(n));
    return n.toString().padStart(2, '0');
}


/***********
* nthChar
*
* find location the nth occurance of a character in a string
***********/
function nthChar(str, ch, nth=1, pos=0) {
    --pos;
    while ((nth-- > 0) && ((pos=str.indexOf(ch, pos+1)) >= pos));
    return (nth > 0)? -1 : pos;
}

/***********
* setupSSE function
*
* This function will setup an SSE connection to the backend packet source (backendurl)
***********/
function setupSSE(backendurl) {

    if(typeof(EventSource) !== "undefined") {

        try {

            // Create new SSE source
            eventsource = new EventSource(backendurl);

            // listen for new gps position alerts
            eventsource.addEventListener("gpsstatus", function(event) {

                let json;
                
                // Parse the incoming json
                try { json = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "GPS JSON parse error", "event": event, "error": e.message, "gpsjson": json});
                }

                // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
                if (json && json.features && json.features[0].properties && json.features[0].geometry) {

                    let ts = new Date(json.features[0].properties.time);
                    let tmstring = getISODateTimeString(ts);
                    
                    // update the time value to be a nicer string.
                    json.features[0].properties.time = tmstring;

                    // update the GPS status box
                    updateGPSDisplay(json);

                    // update the "Map" link with our latest location.  So when the user clicks on the "Map" link, 
                    // the map will open, centered on our last location.   
                    updateMapLink(json);

                }
            });

            eventsource.addEventListener("configuration", function(event) {

                let json;
                
                // Parse the incoming json
                try { json = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "configuration JSON parse error", "event": event, "error": e.message, "gpsjson": json});
                }
                
                if (json && json.type) {
                    if (json.type == "config") 
                        processConfiguration(json.data);
                    else if (json.type == "trackers")
                        processTrackers(json.trackers);
                    else if (json.type == "flights")
                        processFlights(json.flights);
                }

            });

            // listen for log file updates
            eventsource.addEventListener("mainlog", handleLogEvent);
            eventsource.addEventListener("stderr", handleLogEvent);
            eventsource.addEventListener("direwolflog", handleLogEvent);
            eventsource.addEventListener("direwolf", handleLogEvent);

            // listen for any errors, try and restart the connection if there were any
            eventsource.addEventListener("error", function(event) {

                // update the status section with connection status
                let data = document.getElementById("backendconnection");
                data.innerHTML = "<mark class=\"notokay\" style=\"font-size: 1em;\">[ not connected ]</mark>";

                // update the gps section with connection status
                let gpsdata = document.getElementById("gpsdata");
                gpsdata.innerHTML = "n/a";

                // close the event source
                eventsource.close();

                // wait for one second then restart SSE 
                setTimeout(initializeSSE, 1000);
            });

            // listen for a connection to the backend
            eventsource.addEventListener("open", function(event) {

                // update the screen with connection status
                let data = document.getElementById("backendconnection");
                data.innerHTML = "<mark class=\"okay\" style=\"font-size: 1em;\">[ connected ]</mark>";
            });



        } catch(error) {
            console.log({"function": "setupSSE", "error": error});
        }
    }
    else {

        // update the status section with connection status
        let data = document.getElementById("backendconnection");
        data.innerHTML = "<mark class=\"notokay\" style=\"font-size: 1em;\">[ unsupported browser: EventSource not available! ]</mark>";
    }
}


/***********
* handleLogEvent
*
* handler function for SSE log events.  
***********/
function handleLogEvent(event) {

    let json;

    // Parse the incoming json
    try { json = JSON.parse(event.data);}
    catch (e) { 
        console.log({"what": event.type + " log JSON parse error", "event": event, "error": e.message, "json": json});
    }

    if (json) {
        //alert("new json: " + event.type + ", " + JSON.stringify(json.data));

        // get the current log content being displayed on the page
        let elem = document.getElementById(event.type);
        let log = elem.innerHTML;

        // append this incoming data to it
        log = log + (log.length > 0 ? "\r\n" : "") + escapeHtml(json.data);

        // trim to be <= 100 lines.  Just count the number of newlines in the output....not "perfect", but will be good 
        // enough to make sure we're not trying to track a jillion lines. ;)
        const matches = log.match(/\n/g);
        const n = (matches ? matches.length : 0);
        if (n > 100) {
            const loc = nthChar(log, "\n", n - 100);

            // now trim the string
            log = log.substring(loc+1);
        }

        // update the data on the page
        elem.innerHTML = log;

        // now scroll the element to the bottom (so new lines of text are visible)
        elem.scrollTop = elem.scrollHeight;
    }
}


/***********
* initializeSSE
*
* restart the SSE stream
***********/
function initializeSSE() {
    //setupSSE("ssestream.php?gpsstatus=true&configuration=true&backendstatus=true&mainlog=true&stderr=true&direwolflog=true");
    setupSSE("/sse");
}


/***********
* updateGPSDisplay
*
* This function will populate the web page with the GPS status/state in the 'jsonData' argument
***********/
function updateGPSDisplay(geojson) {

    let feature = null;
    let featurecollection = null;

    // Determine the geojson feature from the provided arguments
    if (geojson && geojson.type) {
        if (geojson.type == "FeatureCollection") {
            featurecollection = geojson;
            if (geojson.features)
                feature = geojson.features[0];
        }
        else if (geojson.type == "Feature") {
            feature = geojson;
        }
    }

    // if there isn't any geojson to process then we return
    if (!feature || !featurecollection) {
        return;
    }

    // The GPS status information (fix mode, satellites, etc.)
    let jsonData = feature.properties.gps;
    let gpsfix;

    // make sure we were provided GPS status data before proceeding
    if (!jsonData)
        return;

    // Get the GPS fix status
    let gpsMode = jsonData.mode * 1;
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

    // location validity
    let locvalidity ="<mark class=\"notokay\" style=\"font-size: .9em;\">[ NO ]</mark>";
    if (gpsMode > 2) 
        locvalidity ="<mark class=\"okay\" style=\"font-size: .9em;\">[ YES ]</mark>";

    // if there is an error string included (usually from a GPSD connection fault), then format that and save the HTML string into 'errorstring'
    let errorstring = "";
    if (jsonData.error && jsonData.error != "n/a") {
        errorstring = "<tr><td style=\"text-align: left; padding-right: 10px;\">Error:</td><td>"
        + "<mark class=\"marginal\">" + jsonData.error + "</mark></td></tr>";
    }

    // Construct the GPS status info box
    let theDate = jsonData.utc_time;
    theDate = theDate.replace(/T/g, " "); 
    theDate = theDate.replace(/Z$/g, ""); 
    let gpshtml = "<table cellpadding=0 cellspacing=0 border=0>" 
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
        + "<tr><td style=\"text-align: left; padding-right: 10px;\">Location Valid:</td><td>" + locvalidity + "</td></tr>"
        + "</table>";


    // Compile the list of satellites
    //let satellites = jsonData.satellites.sort((a, b) => a.used < b.used);
    let satellites = jsonData.satellites;
    let satellite_html = "<table cellpadding=0 cellspacing=0 border=0><tr><th style=\"font-weight: normal; padding: 5px; text-align: center;\">PRN:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\" >Elev:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\" >Azim:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\">SNR:</th><th style=\"font-weight: normal; padding: 5px;text-align: center;\">Used:</th></tr>"; 

    let i = 0;
    for (i = 0; i < satellites.length; i++) {
            satellite_html = satellite_html + 
            "<tr><td style=\"text-align: center;\">" + satellites[i].PRN + 
            "</td><td style=\"text-align: center;\">" + satellites[i].el + 
            "</td><td style=\"text-align: center;\">" + satellites[i].az + 
            "</td><td style=\"text-align: center;\">" + satellites[i].ss + 
            "</td><td style=\"text-align: center;\">" + (satellites[i].used == "True" || satellites[i].used == true ? "Y" : "N") + 
            "</td></tr>";
    }
    
    satellite_html = satellite_html + "</table>";

    // only add the satellite HTML listing if there were satellites reported.
    if (satellites.length > 0)
        gpshtml = gpshtml + satellite_html;

    // update the GPS status box on the web page with everything we've compiled from the GPS JSON we receieved.
    let elem = document.getElementById("gpsdata");
    if (elem)
        elem.innerHTML = gpshtml;
}



/***********
* updateMapLink
*
* update the map link so that when a user clicks on "Map", the map will open, centered on this location.
***********/
function updateMapLink(geojson) {

    let feature = null;
    let featurecollection = null;

    // Determine the geojson feature from the provided arguments
    if (geojson && geojson.type) {
        if (geojson.type == "FeatureCollection") {
            featurecollection = geojson;
            if (geojson.features)
                feature = geojson.features[0];
        }
        else if (geojson.type == "Feature") {
            feature = geojson;
        }
    }

    // if there isn't any geojson to process then we return
    if (!feature || !featurecollection) {
        return;
    }

    // make sure this feature has coordinates for a Point geojson object.
    if (!feature.geometry || !feature.geometry.type == "Point" || !feature.geometry.coordinates)
        return;

    // Get the GPS fix status
    let gpsMode = 0;
    if (feature.properties && feature.properties.gps)
        gpsMode = feature.properties.gps.mode * 1.0;

    if (gpsMode > 2) {
        let lat = feature.geometry.coordinates[1];
        let lon = feature.geometry.coordinates[0];
        let zoom = 10;

        let maplink = document.getElementById("maplink");
        let url = "/map.php?latitude=" + lat + "&longitude=" + lon + "&zoom=" + zoom;
        maplink.setAttribute("href", url);
    }
}


/***********
* startup 
*
* main entry point
************/
function startup() {

    // get the nodeid of this system (if it exists)
    getNodeID("nodeid.txt").then(function(text) {
        nodeid = text;
    });

    // get current flight and tracker definitions
    getDefinitions();

    // and a restart'inator so that javascript will restart upon browser coming back into focus
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === 'visible') {

            // refetch the direwolf log file if present
            getDirewolfLog("/logs/direwolf.log");

            // startup SSE 
            initializeSSE();
        }
    });

    // get the current direwolf log file
    getDirewolfLog("/logs/direwolf.log").then(function(text) {

        // get the direwolf element
        let dw = document.getElementById("direwolf");

        // set the content
        dw.innerHTML = escapeHtml(text);

        // now scroll the element to the bottom (so new lines of text are visible)
        dw.scrollTop = dw.scrollHeight;

    });

    // get the configuration 
    getConfiguration("/configuration/config.txt").then(function(json) {
        if (json && json.data) 
            processConfiguration(json.data);
    });

    // startup SSE 
    initializeSSE();

}

/***********
* isApple
*
* Grab the user agent string from the user's browser in attempt to determine if this is an Apple product or not.
* ...this is primaryily used to craft the map URLs when a user click on a set of coordinates.  So we can send them
* to Google Maps or to Apple Maps.
***********/
function isApple() {

    // get the browser's user agent string
    let ua = navigator.userAgent;
    let isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    let isIpad = /iPad/i.test(ua);
    let isMacintosh = /Macintosh/i.test(ua);
    let isTouchDevice = "ontouchend" in document;

    return isSafari || isIpad || isMacintosh;
}

/* Function to copy text from an element to the clipboard */
function copyToClipboard (elem) {
    var range = document.createRange();
    var e = document.getElementById(elem);
  
    range.selectNode(e);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("Copy");
    window.getSelection().removeAllRanges();
    e.classList.add("whiteToBackground");
    setTimeout(function() {
        let element = elem;
        document.getElementById(element).classList.remove("whiteToBackground");
    }, 600);
}

// get the direwolf log file if it exists
async function getDirewolfLog(url) {
    
    // get the direwolf.log file
    let response = await fetch(url);
    let log;

    if (!response.ok) {

        // update the data on the page
        return "Log file not found";
    }

    try{
        log = await response.text();
    } catch (e) {
        console.log("Error in fetching direwolf log file: ", e, ", file: ", url);
    }

    if (log) {

        // trim to be <= 100 lines.  Just count the number of newlines in the output....not "perfect", but will be good 
        // enough to make sure we're not trying to track a jillion lines. ;)
        const matches = log.match(/\n/g);
        const n = (matches ? matches.length : 0);
        if (n > 100) {
            const loc = nthChar(log, "\n", n - 100);

            // now trim the string
            log = log.substring(loc+1);
        }
    }

    return log;
}

// get the node ID of this system (if it exsists)
async function getNodeID(url) {

    // get the configuration
    let response = await fetch(url);
    let text;

    // nodeID file doesn't exist
    if (!response.ok) {
        return null;
    }

    // otherwise, try and read the response text
    try {
        text = await response.text();
    } 
    catch (e) {
        console.log("Error in fetching nodeID file: ", e, ", file: ", url);
    }

    return text;
}


// get the configuration
async function getConfiguration(url) {

    // get the configuration
    let response = await fetch(url);
    let config;

    try{
        config = await response.json();
    } catch (e) {
        console.log("Error in fetching config file: ", e, ", file: ", url);
    }

    let json;
    if (config) {
        try {
            // transform incoming JSON into the [more] standard form
            json = {
                "type": "config",
                "data": {
                    "aprsis": {
                        "beaconing": config.ibeacon,
                        "igating": config.igating,
                        "overlay": config.overlay,
                        "symbol": config.symbol
                    },
                    "direwolf": {
                        "audiodev": config.audiodev,
                        "beaconing": config.beaconing,
                        "beaconlimit": config.beaconlimit,
                        "eoss_string": config.eoss_string,
                        "includeeoss": config.includeeoss,
                        "serialport": config.serialport,
                        "serialproto": config.serialproto
                    },
                    "station": {
                        "callsign": (config.callsign ? (config.ssid ? config.callsign + "-" + config.ssid : config.callsign) : null),
                        "name": config.comment,
                        "timezone": config.timezone
                    }
                }
            };
        } catch (e) {
                alert("error with json: " + e);
        }
    }

    return json;
}

// starting point for everything 
document.addEventListener("DOMContentLoaded", startup);
