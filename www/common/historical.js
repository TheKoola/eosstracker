/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2025 Jeff Deaton (N6BA)
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


// globals
let UNITS = "imperial";
let FLIGHT_JSON = null;


/***********
* isApple
*
* Grab the user agent string from the user's browser in attempt to determine if this is an Apple product or not.
* ...this is primaryily used to craft the map URLs when a user clicks on a set of coordinates.  So we can send them
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


/***********
* getDefinitions
*
* This will fetch the flight and tracker definitions fromt the backend.
***********/
async function getDefinitions(url) {

    // get the list of flights
    let response = await fetch(url);
    let js;
    let num = 0;

    // Parse the returned json
    js = await response.json();

    return js;
}


/***********
* processFlights
*
* This function will process the flight definitions from the backend, populating the 'flightlist' global and create map layers for each active flight.
***********/
function processFlights(json) {

    if (!json)
        return;

    // are we using imperial units or metric
    const imperial = (UNITS == "imperial" ? true : false);

    // get the browser's user agent string and determine is this is an apple devices or not
    let isApple = function() {
        let ua = navigator.userAgent; 
        let isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        let isIpad = /iPad/i.test(ua);
        let isMacintosh = /Macintosh/i.test(ua);
        let isTouchDevice = "ontouchend" in document;
                    
        return isSafari || isIpad || isMacintosh;
    };

    // is this an apple platform?  So we know to send user's to Google Maps or Apple Maps when clicking coordinate links.
    const isApplePlatform = isApple();

    // function to form up the URL that will take the user to their specific map platform for directions to these coordinates
    let mapurl = function(flightname, lat, lon, alt) {
        let URL = "";
        if (isApplePlatform)
            URL = "https://maps.apple.com/?q=" + flightname + "&ll=" + lat + "%2C" + lon;
        else
            URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon;

        return "<a href=\"" + URL + "\" target=\"_blank\">" + lat.toFixed(8) + ", " + lon.toFixed(8) + "</a> @ " + alt.toLocaleString() + (imperial ? "ft" : "m");
    };

    // indices 
    let key, i;

    // sort the incoming json based on newest flight first
    json.sort((a, b) => a.flight.localeCompare(b.flight)).reverse();

    // Create the table
    let table = document.createElement("Table");
    let flightlist = document.getElementById("flightlist");
    table.setAttribute("class", "flightlist");
    table.setAttribute("style", "width: auto");

    // the columns
    const columns = ["Flight", "Date", "Balloon Size", "Parachute", "Beacon Callsigns", "Max Altitude", "Launch Location", "Landing Location", "Distance Traveled", "Flight Duration", "Total Weight", "Lift Factor", "H<sub>2</sub> Fill", "Number of Data Points", "Telemetry", "Data"];

    // add the header row
    var row = table.insertRow(-1);
    for (i = 0; i < columns.length; i++) {
        let headerCell = document.createElement("th");
        headerCell.innerHTML = columns[i];
        headerCell.setAttribute("class", "flightlistheader");
        row.appendChild(headerCell);
    }

    // Loop through each flight creating the table of entries in the browser
    for (key in json) {
        //const metadata = getMetadata(json[key].flight);

        // the balloon size
        const balloonsize_metric = parseInt(json[key].balloonsize);
        const balloonsize_imperial = balloonsize_metric * 0.00220462;

        // the max altitude as determined by telemetry packets
        let burst_ft = json[key].maxaltitude_ft;
        let burst_m = json[key].maxaltitude_m;

        // determine if the accelerometer detected burst was successful or not
        const detected_burst = (json[key].detected_burst && json[key].detected_burst.detected);
        if (detected_burst) {
            let db = json[key].detected_burst;
            burst_ft = (db.burst_ft > burst_ft ? db.burst_ft : burst_ft);
            burst_m = (db.burst_m > burst_m ? db.burst_m : burst_m);
        }

        const cellvalues = [
            json[key].flight,
            json[key].day,
            (imperial ? balloonsize_imperial.toFixed(2) + "lbs" : balloonsize_metric.toFixed(0) + "gm"),
            (imperial ? (json[key].parachute.size_ft * 1.0).toFixed(0) + "ft" : (json[key].parachute.size_m * 1.0).toFixed(2) + "m") + " " +
            json[key].parachute.description,
            json[key].beacons.join(", "), 
            (imperial ? 
                (burst_ft >= 100000 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + burst_ft.toLocaleString() + "ft </mark>" : burst_ft.toLocaleString() + "ft") :
                (burst_m >= 30480 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + burst_m.toLocaleString() + "m </mark>" : burst_m.toLocaleString() + "m") 
            ) + 
            (detected_burst ? "<br><font style=\"font-size:.8em;color:#aaaaaa;\">Beacon Detected</font>" : "")
            ,
            mapurl(json[key].flight, json[key].launch_location.latitude, json[key].launch_location.longitude, Math.round(imperial ? json[key].launch_location.altitude_ft : json[key].launch_location.altitude_m)),
            mapurl(json[key].flight, json[key].landing_location.latitude, json[key].landing_location.longitude, Math.round(imperial ? json[key].landing_location.altitude_ft : json[key].landing_location.altitude_m)),
            (imperial ? json[key].range_distance_traveled_mi.toFixed(2) + "mi" : json[key].range_distance_traveled_km.toFixed(2) + "km"),
            json[key].flighttime,
            (imperial ? (json[key].weights.gross_lb * 1.0).toFixed(2) + "lb" : (json[key].weights.gross_kg * 1.0).toFixed(2) + "kgs"),
            json[key].liftfactor,
            json[key].h2fill + "scf",
            json[key].numpoints.toLocaleString()
        ];

        // create a new row for each flight and populate the cells
        row = table.insertRow(-1);
        row.setAttribute("class", "flightlist");
        for (i = 0; i < cellvalues.length; i++) {
            let cell = row.insertCell(-1);
            cell.innerHTML = cellvalues[i];
            cell.setAttribute("class", "flightlist");
            if (i > 0)
                cell.setAttribute("style", "text-align: center;");
        }

        // add the telemetry cell
        let telemetry = row.insertCell(-1);
        telemetry.setAttribute("class", "flightlist");
        let elem = document.createElement("a");
        //elem.setAttribute("target", "_blank");
        elem.setAttribute("href", "/telemetry.php?flightid=" + json[key].flight + (imperial ? "&units=imperial" : "&units=metric"));
        elem.setAttribute("style", "text-align: center;");
        elem.textContent = "Telemetry";
        telemetry.appendChild(elem);


        // now add the "downloads" cell for this flight (i.e. row)
        let downloads = row.insertCell(-1);
        downloads.setAttribute("class", "flightlist");
        downloads.setAttribute("style", "text-align: center;");
        
        // the list of data types available for download
        const filetypes = [
            {"type": "csv",    "ext": "csv" },
            {"type": "json",   "ext": "json" },
            {"type": "excel",  "ext": "xlsx" },
            //{"type": "pandas", "ext": "pkl" },
            {"type": "parquet","ext": "parquet" },
            {"type": "kml",    "ext": "kml" }
        ];

        // loop through the various file types, creating an array of links
        let links = [];
        const metadata_link = "<a target=\"_blank\" href=\"/flightdata/csv/" + json[key].flight.toLocaleLowerCase() + "_metadata.csv\">metadata</a>";
        links.push(metadata_link);
        for (i in filetypes) {
            const entry = filetypes[i].type;
            const ext = filetypes[i].ext;
            const a = "<a target=\"_blank\" href=\"/flightdata/" + ext + "/" + json[key].flight.toLocaleLowerCase() + "." + ext + "\">" + entry + "</a>";
            links.push(a);
        }

        // if links were created, then add those to the downloads cell
        if (links.length > 0)
            downloads.innerHTML = links.join(" &nbsp; ");
        else
            downloads.innerHTML = "n/a";
    }

    flightlist.innerHTML = "";
    flightlist.appendChild(table);
}

/***********
* createUnitsLink
*
* this will create the link (on the page) so the user can select between imperial or metric units
***********/
function createUnitsLink(u) {

    // find the DOM element we need to update
    let elem = document.getElementById("unitslink");

    if (!elem)
        return;

    // sanity check
    if (u != "imperial" && u != "metric")
        u = "imperial";

    elem.innerHTML = (u == "imperial" ? 
        "<mark class=\"okay\">[ Imperial ]</mark> &nbsp; Switch to: <font class=\"pseudolink\" onclick=\"switchtometric();\">Metric</font>" : 
        "<mark class=\"okay\">[ Metric ]</mark>   &nbsp; Switch to: <font class=\"pseudolink\" onclick=\"switchtoimperial();\">Imperial</font>");
}


/***********
* switchtoimperial
*
* change units being displayed to imperial
***********/
function switchtoimperial() {

    // are we already on imperial?
    if (UNITS == "imperial") 
        return;

    // set the global
    UNITS = "imperial";

    // reprocess the flightlist 
    processFlights(FLIGHT_JSON);

    // change the units display
    createUnitsLink(UNITS);
}


/***********
* switchtometric
*
* change units being displayed to metric
***********/
function switchtometric() {

    // are we already on imperial?
    if (UNITS == "metric") 
        return;

    // set the global
    UNITS = "metric";

    // reprocess the flightlist 
    processFlights(FLIGHT_JSON);

    // change the units display
    createUnitsLink(UNITS);
}


/***********
* main
*
* application starting point
***********/
async function main() {

    let default_value = "imperial";
    let u;

    // determine if this is an apple device or android or something else.
    isApplePlatform = isApple();

    // fetch flight definitions and process
    getDefinitions("/flightdata/json/flights_metadata.json").then((json) => {

        // set the global
        FLIGHT_JSON = json;

        // process it
        processFlights(json);
    });

    // get the units we're initially supposed to use, and create the link on the screen for selecting between imperial and metric
    UNITS = document.getElementById("units").getAttribute("data-units");

    // defaults
    if (!UNITS)
        UNITS = default_value;

    // defaults
    if (UNITS != "imperial" && UNITS != "metric")
        UNITS = default_value;

    // create the initial units link
    createUnitsLink(UNITS);
}


/***********
* startup
*
* Called when the browser loads the page and used to start our app
***********/
function startup() {

    // call main
    main().catch((e) => console.log(e));
}

// starting point for everything
document.addEventListener("DOMContentLoaded", startup);
