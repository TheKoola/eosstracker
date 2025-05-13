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
    const columns = ["Flight", "Date", "Balloon Size", "Beacon Callsigns", "Max Altitude", "Flight Duration", "Total Weight", "Lift Factor", "H<sub>2</sub> Fill", "Number of Data Points", "Data"];

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

        const cellvalues = [
            json[key].flight,
            json[key].day,
            json[key].balloonsize,
            json[key].beacons.join(", "), 
            (json[key].maxaltitude >= 100000 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + json[key].maxaltitude.toLocaleString() + "ft </mark>" : json[key].maxaltitude.toLocaleString() + "ft"),
            json[key].flighttime,
            (json[key].weights.gross * 1.0).toFixed(2) + "lbs &nbsp; (" + (json[key].weights.gross * 0.4535924).toFixed(2) + "kg)",
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
        /*let telemetry = row.insertCell(-1);
        telemetry.setAttribute("class", "flightlist");
        let elem = document.createElement("a");
        elem.setAttribute("target", "_blank");
        elem.setAttribute("href", "/telemetry.php?flightid=" + json[key].flight);
        elem.setAttribute("style", "text-align: center;");
        elem.textContent = "Telemetry";
        telemetry.appendChild(elem);
        */


        // now add the "downloads" cell for this flight (i.e. row)
        let downloads = row.insertCell(-1);
        downloads.setAttribute("class", "flightlist");
        downloads.setAttribute("style", "text-align: center;");
        
        // the list of data types available for download
        const filetypes = [
            {"type": "csv",    "ext": "csv" },
            {"type": "json",   "ext": "json" },
            {"type": "excel",  "ext": "xlsx" },
            {"type": "pandas", "ext": "pkl" }
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
* main
*
* application starting point
***********/
async function main() {

    // determine if this is an apple device or android or something else.
    isApplePlatform = isApple();

    // fetch flight definitions and process
    getDefinitions("/flightdata/json/flights_metadata.json").then((json) => {
        processFlights(json);
    });


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
