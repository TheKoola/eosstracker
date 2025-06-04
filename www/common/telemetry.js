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

let map; 

/***********
* initialize_map function
*
* initialize the map and add it to the container specified
***********/
async function initialize_map(container) {

    // the container element
    let container_elem = document.getElementById(container);

    // if the container exists then add some styling to container 
    if (container_elem) 
        container_elem.setAttribute("style", "margin-left: 30px; width: 85%; height: 85%;");
    else
        return null;  // without a container, we can't add a map object to it.

    // the map title
    let container_title = document.getElementById(container + "-title");
    if (container_title) 
        container_title.innerHTML = "<p class=\"normal\" style=\"border: 0; text-align: left; font-size: 1.2em; font-variant: small-caps;\">Flight Path (NOT YET COMPLETE)</a>";

    // map style
    let basic = L.mapboxGL({
        style: '/tileserver/styles/klokantech-basic/style.json',
        attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
    });

    // Create a map object. 
    let m = new L.Map(container, {
        //renderer : canvasRenderer,
        preferCanvas:  true,
        zoomControl: false,
        layers : [ basic ],
        minZoom: 4,
        maxZoom: 20
    });

    // Default starting location for the map.  This is Denver, CO: 39.739, -104.985
    m.setView(new L.latLng(39.739, -104.985), 10);

    // zoom control
    let zoomcontrol = L.control.zoom({ position: 'topright' }).addTo(m);

    // add a scale widget in the lower right hand corner for miles / kilometers.
    let scale = L.control.scale({position: 'bottomright', maxWidth: 200}).addTo(m);

    return m;
}


/***********
 * addToMap
 *
 * This will process the provided JSON, constructing a geojson featurecollection, then add that to the map
 **********/
function addToMap(data) {

    // sanity check
    if (!data || !map)
        return;

}


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
* updateNextPrev
*
* Update the header text to add links for the prev and next flight
***********/
async function updateNextPrev(flightid) {

    // get the entire flightlist
    const url = "/flightdata/json/flights_metadata.json";

    // get the list of flights
    let response = await fetch(url);
    let js;
    let num = 0;

    // Parse the returned json
    js = await response.json();

    // process flight definitions and find out where within the flightlist this flightid sits.
    if (js) {

        // the index of where this flight is within the list of flights
        const idx = js.findIndex(f => f.flight == flightid);

        // prev and next
        const prev_idx = (idx+1 < js.length ? idx+1 : 0);
        const next_idx = (idx-1 >= 0 ? idx-1 : js.length-1);

        // prev and next links
        const prev_link = "<a class=\"next\" href=\"/telemetry.php?flightid=" + js[prev_idx].flight + "\">&laquo; previous: " + js[prev_idx].flight + "</a>";
        const next_link = "<a class=\"next\" href=\"/telemetry.php?flightid=" + js[next_idx].flight + "\">next: " + js[next_idx].flight + " &raquo;</a>";

        // now update the title label to include these links
        prev_elem = document.getElementById("prevflight");
        next_elem = document.getElementById("nextflight");
        next_elem.innerHTML = next_link;
        prev_elem.innerHTML = prev_link;

        // set the data attribute so the gonext and goprevious event handlers can determine the correct URL to follow
        next_elem.dataset.next = js[next_idx].flight;
        prev_elem.dataset.prev = js[prev_idx].flight;

        // add an event listener to catch the user hitting the left or right arrow keys
        window.addEventListener('keydown', (e) => {
            if (!e.repeat && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (e.key == "ArrowLeft")
                    goprevious();
                if (e.key == "ArrowRight")
                    gonext();
            }
        });
    }

    return num;
}


/***********
* goprevious
***********/
function goprevious() {
    let p = document.getElementById("prevflight");
    const url = "/telemetry.php?flightid=" + p.dataset.prev;

    window.location = url;
    return false;
}

/***********
* gonext
***********/
function gonext() {
    let n = document.getElementById("nextflight");
    const url = "/telemetry.php?flightid=" + n.dataset.next;

    window.location = url;
    return false;
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
    js = await response.json();

    // process flight json data
    if (js) {

        // build the data table at the top of the page
        buildTable(js);

        // convert the packettime epoch ms to a local date object
        let packetdata = js.packets.map((a) => {
            // convert UTC time to local time
            const utcdate = new Date(a.packettime);
            const localtime = new Date(utcdate.getTime() - utcdate.getTimezoneOffset()*60*1000)
            return {...a, localtime, "curve_fit": a.velocity_curvefit*60 };
        });

        // for those build out functions that need the packet data...
        createCharts(packetdata);
        updateMap(packetdata);
    }

    return num;
}

/***********
* createAltitudeChart
*
* Creates the altitude vs time chart for the flight
***********/
function createCharts(data) {

    // sanity check
    if (!data)
        return;

    try {

        // function to get the min and max vertical rates
        const getminmax = function(ray) {
            const min_vrate = ray.reduce((acc, obj) => (obj.vert_rate_ftmin < acc ? obj.vert_rate_ftmin : acc), Infinity);
            const max_vrate = ray.reduce((prev, current) => (prev.vert_rate_ftmin > current.vert_rate_ftmin ? prev : current)).vert_rate_ftmin;
            return [min_vrate, max_vrate];
        };

        // function to add a plot to the specified container id
        const setplot = function(titletext, plot, id) {
            let title_elem = document.getElementById(id + "-title");
            let plot_elem  = document.getElementById(id);
            const title = "<p class=\"normal\" style=\"border: 0; font-size: 1.2em; font-variant: small-caps; text-align: left;\">";

            if (title_elem) {
                title_elem.innerHTML = title + titletext + "</p>";
            }

            if (plot_elem) {
                plot_elem.innerHTML = "";

                if (plot)
                    plot_elem.append(plot);
                else {
                    let p = document.createElement("p");
                    p.setAttribute("class", "normal");
                    p.setAttribute("style", "text-align: center; font-size: 1.2em; border: 0; margin-top: 50px; margin-bottom: 50px;");
                    p.innerHTML = "<span style=\"color: #a8a8a8; background-color: #383838; padding: 4px 16px;\">No Data</span>";
                    plot_elem.append(p);
                }
            }
        };

        /*
        const ascent_data =  data.filter(item => item.flight_phase === "ascending");
        const descent_data = data.filter(item => item.flight_phase === "descending");
        const ascent_vrate_domain  = getminmax(ascent_data);
        const descent_vrate_domain = getminmax(descent_data);
        */
        

        /***********************/
        // the altitude chart
        /***********************/
        const createAltitudePlot = function (d) {
            return Plot.plot({
                color: { legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px" },
                width: 800,
                height: 500,
                x: { label: "Date/Time", type: "time" },
                y: { label: "Altitude (ft)", interval: 500 },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d, {x: "localtime", y: "altitude", stroke: "flight_phase" }),

                    // Add a value label for the max altitude
                    Plot.text(d, Plot.selectMaxY({
                        x: "localtime",
                        y: "altitude",
                        text: (elem) => {return elem.altitude.toLocaleString() + "ft";}, 
                        textAnchor: "start",
                        fill: "white",
                        dx: 0,
                        dy: -20 
                    })),
                    Plot.crosshair(d, {x: "localtime", y: "altitude", color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let altitudeplot = createAltitudePlot(data);
        setplot("Altitude vs. Time", altitudeplot, "altitudeplot");


        /***********************/
        // the velocity chart
        /***********************/
        const createVelocityPlot = function (d, c) {

            return Plot.plot({
                color: { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: 800,
                height: 500,
                x: { label: "Vertical Rate (ft/min)" },
                y: { label: "Altitude (ft)", interval: 500 },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d,  {x: "vert_rate_ftmin", y: "altitude", stroke: "flight_phase" }),
                    Plot.line(d, {x: "curve_fit", y: "altitude", stroke: "flight_phase", strokeOpacity: 1, strokeWidth: 2 }),
                    Plot.crosshair(d, {x: "vert_rate_ftmin", y: "altitude", color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let ascent_velocityplot = createVelocityPlot(data.filter(item => item.flight_phase == "ascending"), altitudeplot.scale("color"));
        setplot("Ascent Rate", ascent_velocityplot, "ascent_velocityplot");

        let descent_velocityplot = createVelocityPlot(data.filter(item => item.flight_phase == "descending"), altitudeplot.scale("color"));
        setplot("Descent Rate", descent_velocityplot, "descent_velocityplot");


        /***********************/
        // the temperature chart
        /***********************/
        const createTemperaturePlot = function (d, c) {

            return Plot.plot({
                color:  { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: 800,
                height: 500,
                x: { label: "Temperature (F)", transform: (a) => (a - 273.15) * 9/5 + 32 },
                y: { label: "Altitude (ft)", interval: 500 },
                facet: { label: "Beacon Callsign" },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d,  {x: "temperature_k", y: "altitude", stroke: "flight_phase", fx: "callsign" }),
                    Plot.crosshair(d, {x: "temperature_k", y: "altitude", color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let temps = data.filter(a => a.temperature_k != null);
        let temperatureplot = (temps && temps.length > 0 ? createTemperaturePlot(temps, altitudeplot.scale("color")) : null);
        setplot("Temperature", temperatureplot, "temperatureplot");


        /***********************/
        // the airdensity chart
        /***********************/
        const createAirdensityPlot = function (d, c) {

            return Plot.plot({
                color: { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: 800,
                height: 500,
                x: { label: "Airdensity (kg/m^3)" },
                y: { label: "Altitude (ft)", interval: 500 },
                facet: { label: "Beacon Callsign" },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d,  {x: "airdensity_kgm3", y: "altitude", stroke: "flight_phase", fx: "callsign" }),
                    Plot.crosshair(d, {x: "airdensity_kgm3", y: "altitude", color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let densities = data.filter(a => a.airdensity_kgm3 != null);
        let airdensityplot = (densities && densities.length > 0 ?  createAirdensityPlot(densities , altitudeplot.scale("color")) : null);
        setplot("Air Density", airdensityplot, "airdensityplot");

    } catch(error) {
        //alert("error: " + error.message);
        console.log(error);
    }
}


/***********
* processMetadata
*
* Build the table of information about the flight's details.
***********/
function buildTable(json) {

    // indices 
    let key, i;
    const packets = json.packets;
    const launchdate = json.day;
    const max_altitude = json.maxaltitude;
    const flightduration = json.flighttime;

    // is this an apple platform?  So we know to send user's to Google Maps or Apple Maps when clicking coordinate links.
    const isApplePlatform = isApple();

    // function to form up the URL that will take the user to their specific map platform for directions to these coordinates
    let mapurl = function(flightname, lat, lon, alt) {
        let URL = "";
        if (isApplePlatform)
            URL = "https://maps.apple.com/?q=" + flightname + "&ll=" + lat + "%2C" + lon;
        else
            URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon;

        return "<a href=\"" + URL + "\" target=\"_blank\">" + lat.toFixed(8) + ", " + lon.toFixed(8) + "</a> @ " + alt.toLocaleString() + "ft";
    };

    // wrapper div
    let div = document.createElement("div");
    div.setAttribute("style", "margin: 30px;");

    // title
    let p = document.createElement("p");
    p.setAttribute("class", "normal");
    p.setAttribute("style", "border: 0; font-size: 1.2em; margin-left: 0;");
    p.innerHTML = "Flight Data";
    div.appendChild(p);

    // Create the table
    let table = document.createElement("Table");
    let metadata = document.getElementById("metadata");
    table.setAttribute("class", "flightlist-plain");
    table.setAttribute("style", "width: auto;");

    // the columns
    const columns = ["Flight", "Date", "Balloon Size", "Beacon Callsigns", "Max Altitude", "Launch Location", "Landing Location", "Distance Traveled", "Flight Duration", "Ascent Airflow Transition Points", "Lift Factor", "H<sub>2</sub> Fill", "Number of Data Points", "Data"];

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

    // function to build a table for displaying the weight line items
    const weighttable = function(js) {

        // sanity check
        if (!js || js.length == 0)
            return null;

        // wrapper div
        let div = document.createElement("div");
        div.setAttribute("style", "margin-bottom: 30px; margin-left: 30px;");

        // title
        let p = document.createElement("p");
        p.setAttribute("class", "normal");
        p.setAttribute("style", "border: 0; font-size: 1.2em; margin-left: 0;");
        p.innerHTML = "Weights";
        div.appendChild(p);

        // the table
        let table = document.createElement("table");
        table.setAttribute("class", "flightlist-plain");
        table.setAttribute("style", "width: auto;");

        // header row
        let row = table.insertRow(-1);
        let keys = Object.keys(js);
        for (let key in keys) {
            let headerCell = document.createElement("th");
            headerCell.innerHTML = keys[key];
            headerCell.setAttribute("class", "flightlistheader");
            row.appendChild(headerCell);
        }

        // table rows
        let values = Object.values(js);
        let tablerow = table.insertRow(-1);
        for (let value in values) {
            let tablecell = document.createElement("td");
            tablecell.setAttribute("class", "flightlist");

            //tablecell.setAttribute("style", "font-size: 1em; padding-left: 10px; text-align: left;");
            tablecell.innerHTML = (values[value] * 1.0).toFixed(2) + "lbs &nbsp; (" + (values[value] * 0.4535924).toFixed(2) + "Kg)";
            tablerow.appendChild(tablecell);
        }

        div.appendChild(table);
        return div;
    };

    // function to build a quick table for displaying the Reynolds transition points
    const reynoldstable = function(data) {
        let html = "<table style=\"padding: 10px;\">";
        html += "<tr><th style=\"font-variant: small-caps; font-size: 1.1em; text-align: left; border-bottom: 1px solid darkgray;\">Reynolds Number</th><th style=\"font-variant: small-caps; font-size: 1.1em; text-align: right; padding-left: 20px; border-bottom: 1px solid darkgray;\">Altitude</td></tr>";
        html += json.reynolds_transitions.reduce(function(html, item) {
            html += "<tr><td style=\"font-size: 1em; text-align: left;\">";
            html += item.transition;
            html += "</td><td style=\"font-size: 1em; padding-left: 20px; text-align: right;\">";
            html += item.altitude.toLocaleString() + "ft";
            html += "</td></tr>";
            return html;
        }, '');
        html += "</table>";
        return html;
    };

    // the various entries for the cells.
    const cellvalues = [
        json.flight,
        json.day,
        json.balloonsize, 
        json.beacons.join(", "),
        (json.maxaltitude >= 100000 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + json.maxaltitude.toLocaleString() + "ft </mark>" : json.maxaltitude.toLocaleString() + "ft"),
        mapurl(json.flight, json.launch_location.latitude, json.launch_location.longitude, json.launch_location.altitude),
        mapurl(json.flight, json.landing_location.latitude, json.landing_location.longitude, json.landing_location.altitude),
        json.range_distance_traveled.toFixed(2) + "mi",
        json.flighttime,
        reynoldstable(json.reynolds_transitions), 
        //weighttable(json.weights),
        json.liftfactor,
        json.h2fill + "scf",
        json.numpoints.toLocaleString()
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


    // blank the page element (just in case);
    metadata.innerHTML = "";

    // add the flight data table to the div
    div.appendChild(table);

    // Add the div to the page element
    metadata.appendChild(div);

    // add the weights table to the page element
    metadata.appendChild(weighttable(json.weights));
}


/***********
* main
*
* application entry point
***********/
async function main() {

    // determine if this is an apple device or android or something else.
    //const isApplePlatform = isApple();

    // get the flightid
    const flightid = document.getElementById("flightid").getAttribute("data-flightid");

    // if we've been supplied with a flightid, then process
    if (flightid) {

        // update the header label
        document.getElementById("headerlabel").innerHTML = "Telemetry for " + flightid;

        // update the prev and next flights on the header label
        updateNextPrev(flightid);

        // create a map object
        map = initialize_map('map');
        
        // fetch flight data and process
        getFlight("/flightdata/json/" + flightid.toLocaleLowerCase() + ".json");

    }
    else {
        // update the header label
        document.getElementById("headerlabel").innerHTML = "No flight ID specified.";
    }
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
