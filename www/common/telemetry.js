/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2025 Jeff Deaton (N0JD)
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
* getFlight
*
* This will fetch the flight and tracker definitions fromt the backend.
***********/
async function getFlight(url) {

    // get the list of flights
    let response = await fetch(url);
    let js;
    let num = 0;

    // Parse the returned json
    try {
        js = await response.json();
    } catch(e) {
        console.log("getFlight json parsing error: ", e, ", json: ", js);
    }


    // process flight definitions
    if (js) {
        const flightdata = processMetadata(js);
        createCharts(flightdata);
    }

    return num;
}

/***********
* createAltitudeChart
*
* Creates the altitude vs time chart for the flight
***********/
function createCharts(flightdata) {

    const data = flightdata.packets;


    if (!data)
        return;


    /***** Json for each packet should look similar to the following *******
        {
            "flightid": "EOSS-328",
            "callsign": "KC0D-15",
            "receivetime": 1659166756701,
            "packettime": 1659166755000,
            "altitude": 5830.0,
            "vert_rate_ftmin": 380.0,
            "elapsed_secs": 0.0,
            "flight_phase": "ascending",
            "info": "/133915h3916.73N/10329.72WO024/015/A=005830 EOSS BALLOON",
            "raw": "KC0D-15>APZEOS,EOSS,qAO,W9CN-9:/133915h3916.73N/10329.72WO024/015/A=005830 EOSS BALLOON",
            "bearing": 24.0,
            "speed_mph": 17.0,
            "latitude": 39.2788333333,
            "longitude": -103.4953333333,
            "temperature_k": null,
            "pressure_pa": null,
            "velocity_x": 5.56e-06,
            "velocity_y": 2.222e-05,
            "velocity_z": 6.33333333,
            "airflow": "high Re",
            "acceleration": null,
            "velocity_mean": 6.333333,
            "acceleration_mean": null,
            "velocity_std": null,
            "acceleration_std": null,
            "velocity_norm": null,
            "acceleration_norm": null,
            "velocity_curvefit": 9.865684
        } 
    */

    try {

        const max_idx = flightdata.max_idx;

        const plot = Plot.plot({
            grid: true,
            color: { legend: true },
            marginLeft: 50,
            marginBottom: 50,
            marginTop: 50,
            style: { overflow: "visible", fontSize: "13px" },
            width: 800,
            height: 600,
            x: { label: "Date/Time", type: "time" },
            y: { label: "Altitude (ft)", interval: 500 },
            marks: [

                // The primary data series
                Plot.dot(data, {x: "thetime", y: "altitude", stroke: "phase" }),

                // Add a value label for the max altitude
                Plot.text(data, Plot.select((I) => [I[max_idx]], {
                    x: "thetime",
                    y: "altitude",
                    text: (elem) => {return elem.altitude.toLocaleString() + "ft";}, 
                    textAnchor: "start",
                    dx: 20,
                    dy: 0
                }))
            ]
        });

        //alert("max:  " + JSON.stringify(max_packet));
        const div = document.getElementById("altitudeplot");
        div.innerHTML = "";
        div.append(plot);

    } catch(error) {
        alert("error: " + error.message);
    }
}


/***********
* processMetadata
*
* Build the table of information about the flight's details.
***********/
function processMetadata(json) {

    console.log(json);

    // indices 
    let key, i;
    const packets = json.packets;
    const launchdate = json.day;

    // where we'll store data points
    let data = [];
    let max_altitude = 0;
    let max_idx = 0;

    if (packets && packets.length > 0) {

        // convert the time strings to actual date objects and sort by time
        data = packets.map((a) => {
            const thetime = new Date(a.packettime);
            return { thetime, "altitude": a.altitude, "temperature": a.temperature_k, "pressure": a.pressure_pa, "velocity_z": a.velocity_z };
        }).sort((a, b) => a.thetime > b.thetime);

        // find the data point with the max altitude.
        max_idx = data.reduce((maxIdx, obj, idx) => obj.altitude > data[maxIdx].altitude ? idx : maxIdx, 0);

        // construct a string for the max altitude
        max_altitude = data[max_idx].altitude;

        // add the flight phase (ascent or descent) to the data points
        data = data.map((a, i) => i <= max_idx ? {...a, "phase": "ascent"} : {...a, "phase": "descent"});
    }


    // Create the table
    let table = document.createElement("Table");
    let metadata = document.getElementById("metadata");
    table.setAttribute("class", "flightlist");
    table.setAttribute("style", "width: auto");

    // the columns
    const columns = ["Flight", "Date", "Balloon Size", "Max Altitude", "Weights", "Beacon Callsigns", "Lift Factor", "H<sub>2</sub> Fill", "Data Points", "Data"];

    // add the header row
    var row = table.insertRow(-1);
    for (i = 0; i < columns.length; i++) {
        let headerCell = document.createElement("th");
        headerCell.innerHTML = columns[i];
        headerCell.setAttribute("class", "flightlistheader");
        row.appendChild(headerCell);
    }

    // create a new row 
    row = table.insertRow(-1);
    row.setAttribute("class", "flightlist");

    // function to build a quick table for displaying the weight line items
    const weighttable = function(js) {
        let html = "";
        let rows = "";

        for (let [key, value] of  Object.entries(js)) {
            let thisrow = "<tr><td style=\"font-size: 1em; text-align: left;\">";
            thisrow += key;
            thisrow += "</td><td style=\"font-size: 1em; padding-left: 10px; text-align: right;\">";
            thisrow += value + "lbs";
            thisrow += "</td></tr>";

            rows += thisrow;
        }

        // if there was anything processed, then create the table html string
        if (rows) {
            html += "<table cellpadding=0 cellspacing=0 border=0>";
            html += rows;
            html += "</table>";
        }

        return html;
    };

    // the various entries for the cells.
    const cellvalues = [
        json.flight,
        json.day,
        json.balloonsize, 
        max_altitude.toLocaleString() + "ft", 
        json.weights.gross + "lbs (" + (json.weights.gross * 0.4535924).toFixed(2) + "kg)<hr>" + weighttable(json.weights),
        json.beacons.join(", "),
        json.liftfactor,
        json.h2fill + "scf",
        data.length
    ];

    // loop through the various attributes creating cells for each of them.
    for (i = 0; i < cellvalues.length; i++) {
        let cell = row.insertCell(-1);
        cell.innerHTML = cellvalues[i];
        cell.setAttribute("class", "flightlist");
        if (i > 0)
            cell.setAttribute("style", "text-align: center;");
    }

    // now add the "downloads" cell for this flight (i.e. row)
    let downloads = row.insertCell(-1);
    downloads.setAttribute("class", "flightlist");
    
    // the list of data types available for download
    const filetypes = [
        {"type": "csv",    "ext": "csv" },
        {"type": "json",   "ext": "json" },
        {"type": "excel",  "ext": "xlsx" },
        {"type": "pandas", "ext": "pkl" }
    ];

    // loop through the various file types, creating an array of links
    let links = [];
    const metadata_link = "<a target=\"_blank\" href=\"/flightdata/csv/" + json.flight.toLocaleLowerCase() + "_metadata.csv\">metadata</a>";
    links.push(metadata_link);
    for (i in filetypes) {
        const entry = filetypes[i].type;
        const ext = filetypes[i].ext;
        const a = "<a target=\"_blank\" href=\"/flightdata/" + ext + "/" + json.flight.toLocaleLowerCase() + "." + ext + "\">" + entry + "</a>";
        links.push(a);
    }

    // if links were created, then add those to the downloads cell
    if (links.length > 0)
        downloads.innerHTML = links.join(" &nbsp; ");
    else
        downloads.innerHTML = "n/a";


    // update the element with our data
    metadata.innerHTML = "";
    metadata.appendChild(table);

    return {
        "flight": json.flight, 
        "launchdate": json.day,
        "balloonsize": json.balloonsize, 
        "weights": json.weights, 
        "beacons": json.beacons, 
        "liftfactor": json.liftfactor, 
        "h2fill_scf": json.h2fill, 
        "max_altitude": max_altitude, 
        "max_idx": max_idx, 
        "packets": data
    };
}


/***********
* startup
*
* Called when the browser loads the page
***********/
function startup() {

    // determine if this is an apple device or android or something else.
    isApplePlatform = isApple();

    // get the flightid
    const flightid = document.getElementById("flightid").getAttribute("data-flightid");

    if (flightid) {
        // update the header label
        document.getElementById("headerlabel").innerHTML = "Telemetry for " + flightid;
        
        // fetch flight data and process...
        getFlight("/flightdata/json/" + flightid.toLocaleLowerCase() + ".json");

        // test the plot stuff
        //const plot = Plot.rectY({length: 10000}, Plot.binX({y: "count"}, {x: Math.random})).plot();
        //const div = document.getElementById("myplot");
        //div.append(plot);
    }
    else {
        // update the header label
        document.getElementById("headerlabel").innerHTML = "No flight ID specified.";
    }
}

// starting point for everything
document.addEventListener("DOMContentLoaded", startup);
