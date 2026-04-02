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

// globals
let map; 

// units
let UNITS;

// json data
let FLIGHT_JSON;
let FLIGHTLIST;

// the various map panes
let pathsPane;
let flightPane;
let landingPredictionPane;
let flightTooltipPane;
let otherTooltipPane;
let breadcrumbPane;
let otherStationsPane;

// height/width of the charts
const height = 500;
const width = 800;

// colors
const ascending_color  = "#4e79a7";
const descending_color = "#edc949";

// Function to copy text from an element to the clipboard 
function copyToClipboard (elem) {
    var range = document.createRange();
    var e = document.getElementById(elem);

    range.selectNode(e);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand("Copy");
    window.getSelection().removeAllRanges();
    e.setAttribute("class", "blueToWhite");
}


/***********
* initialize_map function
*
* initialize the map and add it to the container specified
***********/
function initialize_map(container) {

    // the container element
    let container_elem = document.getElementById(container);

    // if the container exists then add some styling to container 
    if (container_elem) 
        container_elem.setAttribute("style", "margin-top: 30px; margin-left: 30px; width: " + (width*.90) + "px; height: " + (height-40) + "px;");
    else
        return null;  // without a container, we can't add a map object to it.

    // the map title
    let container_title = document.getElementById(container + "-title");
    if (container_title) 
        container_title.innerHTML = "<p class=\"normal\" style=\"border: 0; text-align: left; font-size: 1.2em; font-variant: small-caps;\">Flight Path <font style=\"font-size: .6em;\">(Imperial units only...for now)</font></p>";

    // map style
    let basic = L.mapboxGL({
        //style: '/tileserver/styles/klokantech-basic/style.json',
        style: '/tileserver/styles/klokantech-basic/style.json',
        attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
    });

    // Create a map object. 
    let m = new L.Map(container, {
        //renderer : canvasRenderer,
        //preferCanvas:  true,
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
* initialize_panes 
*
* initialize the different z-order panes for placing objects on the map
***********/
function initialize_panes() {

    // Pane for all flight Tooltips
    flightTooltipPane = map.createPane("flightTooltipPane");

    // Pane for all non-flight tooltips, to put them underneath regular tooltips
    otherTooltipPane = map.createPane("otherTooltipPane");

    // Pane for all flights, to put them at the top of the z-order
    flightPane = map.createPane("flightPane");

    // Pane for all landing predictions
    landingPredictionPane = map.createPane("landingPredictionPane");

    // Pane for all other stations, to put them underneath regular markers/objects
    otherStationsPane = map.createPane("otherStationsPane");

    // Pane for all non-flight tooltips, to put them underneath regular tooltips.  All L.circleMarker's go here.
    breadcrumbPane = map.createPane("breadcrumbPane");

    // Pane for all tracks, to put them at the bottom of the z-order.  All paths, lines, polygons go here.
    pathsPane = map.createPane("pathsPane");

    // Tooltip z-order (default tooltips for leaflet are at 650)
    flightTooltipPane.style.zIndex = 690; 
    otherTooltipPane.style.zIndex = 650; 

    // Marker z-order (default markers for leaflet are at 600)
    flightPane.style.zIndex = 670; 
    landingPredictionPane.style.zIndex = 665; 
    otherStationsPane.style.zIndex = 660; 

    // placing breadcrumb layer below normal markers.  That's because we add all "circleMarkers" to this pane.  CircleMarkers are an SVG drawing and therefore
    // Leaflet creates a <canvas> DOM object for them on the map.  If this layer, then, is "in front of" other layers, it will block click events to those other objects.
    breadcrumbPane.style.zIndex = 590; 

    // Paths z-order (default paths for leaflet are at 400)
    // Paths, lines, polygons, etc. are SVG drawings and therefore Leaflet will create a <canvas> DOM object on them map for them.  Consequently, this layer needs to be at a
    // lower z-order.
    pathsPane.style.zIndex = 420; 

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
* getFlightList
*
* get the list of flights
***********/
async function getFlightList(url) {

    // get the list of flights
    let response = await fetch(url);

    // return the json
    return await response.json();
}


/***********
* updateNextPrev
*
* Update the header text to add links for the prev and next flight
***********/
function updateNextPrev(flightid) {

    // process flight definitions and find out where within the flightlist this flightid sits.
    if (FLIGHTLIST) {

        // the index of where this flight is within the list of flights
        const idx = FLIGHTLIST.findIndex(f => f.flight == flightid);

        // prev and next
        const prev_idx = (idx+1 < FLIGHTLIST.length ? idx+1 : 0);
        const next_idx = (idx-1 >= 0 ? idx-1 : FLIGHTLIST.length-1);

        // prev and next links
        const prev_link = "<a class=\"next\" href=\"/telemetry.php?flightid=" + FLIGHTLIST[prev_idx].flight + "&units=" + UNITS + "\">&laquo; previous: " + FLIGHTLIST[prev_idx].flight + "</a>";
        const next_link = "<a class=\"next\" href=\"/telemetry.php?flightid=" + FLIGHTLIST[next_idx].flight + "&units=" + UNITS + "\">next: " + FLIGHTLIST[next_idx].flight + " &raquo;</a>";

        // now update the title label to include these links
        prev_elem = document.getElementById("prevflight");
        next_elem = document.getElementById("nextflight");
        next_elem.innerHTML = next_link;
        prev_elem.innerHTML = prev_link;

        // set the data attribute so the gonext and goprevious event handlers can determine the correct URL to follow
        next_elem.dataset.next = FLIGHTLIST[next_idx].flight;
        prev_elem.dataset.prev = FLIGHTLIST[prev_idx].flight;

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
* This will fetch the flight and tracker definitions from the backend.
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
        
        // the max altitude as determined by telemetry packets
        let burst_ft = js.maxaltitude_ft;
        let burst_m = js.maxaltitude_m;

        // determine if the accelerometer detected burst was successful or not
        const detected_burst = (js.detected_burst && js.detected_burst.detected);
        if (detected_burst) {
            let db = js.detected_burst;
            burst_ft = (db.burst_ft > burst_ft ? db.burst_ft : burst_ft);

            // map currently can't switch between imperial and metric...
            //burst_m = (db.burst_m > burst_m ? db.burst_m : burst_m);
        }

        // only interested in those packets that contain a position
        const filtered = js.packets.filter(a => a.position_packet == true);

        // convert the packettime epoch ms to a local date object
        const packetdata = filtered.map((a) => {
            // convert UTC time to local time
            const utcdate = new Date(a.packettime);
            const localtime = new Date(utcdate.getTime() - utcdate.getTimezoneOffset()*60*1000)
            return {...a, "localtime": utcdate, "velocity_curvefit_ftmin": a.velocity_curvefit_fts*60 };
        });

       /* const metric = ["_m", "_ms", "_ms2", "_kph", "_kgm3", "_pa", "_c", "_k"];
        const imperial = ["_ft", "_fts", "_fts2", "_mph", "_slugs", "_atm", "_f" ];
        const isUnit = function (val, units) {
            return units.some(a => val.endsWith(a));
        };
        
        const imperial_packets = Object.fromEntries(
            Object.entries(packetdata).filter(
                ([key, val]) => !isUnit(key, metric))
        );
        */

        // update the packets key with this new data that includes the localtime
        js.packets = packetdata;

        // save the JSON to the global
        FLIGHT_JSON = js;

        // call downstream functions 
        updatePage(js);
        updateMap(js);
    }

    return num;
}

// wrapper function to update all data on the page
function updatePage(js) {
    if (!js)
        return;

    // update the "Historical Data" link
    let elem = document.getElementById("historicallink");
    if (elem) 
        elem.href = "/historical.php?units=" + UNITS;

    updateNextPrev(js.flight);
    buildTable(js);
    createCharts(js);
    regenMapLabels();
}


// style function.  Only applies to Path's like lines and polygons.
function geojsonstyle(geojson) {

    if (!geojson || !geojson.properties)
        return {};

    // function to create the style json
    const createstyle = function(color) {
        return {
            "color": color, 
            "weight": 3
        };
    };

    // is this feature ascending or descending?
    const ascending = geojson.properties.id.endsWith("ascent");
    const descending = geojson.properties.id.endsWith("descent");
    
    // return the correct style
    if (ascending) 
        return createstyle(ascending_color);
    else if (descending) 
        return createstyle(descending_color);
    else
        return {};
}


// Helper function to create the html for the popup content for an individual feature based on its geojson.properties.xxx values
function stationPopup(geojson) {

    if (!geojson || !geojson.properties)
        return false;

    // units (hard setting this for now)
    //const imperial = (UNITS == "imperial" ? true : false);
    const imperial = true;

    // the flight name of the existing feature
    let flight = (geojson.properties.flight ? geojson.properties.flight : (geojson.properties.flightid ? geojson.properties.flightid : "Not Available"));

    if (geojson.properties.id.endsWith("burst"))
        flight = flight + " Burst";
    if (geojson.properties.id.endsWith("launch"))
        flight = flight + " Launch";
    if (geojson.properties.id.endsWith("landing"))
        flight = flight + " Landing";

    let html = null;

    // we only want to update the popup and tooltip content for POINT objects.
    if (geojson.geometry.type && geojson.geometry.type == "Point") {

        // start of our HTML for this station's popup
        html = "<table style=\"margin:0; padding:0;\"><tr>";
        html += "<td style=\"padding:0; margin:0; white-space: nowrap; text-align: left;\"><strong>" + flight + "</strong></td>";

        //------------------ START: figure out what timestamp to use from the geojson packet -------------
        // time variables
        let timestring = "";

        try {
        // run through the list of possible sources for a date/time of this point
        if (geojson.properties.localtime) 
            timestring = geojson.properties.localtime.toLocaleString("en-us", {hour12: false});
        else if (geojson.properties.packettime) { 
            const utcdate = new Date(geojson.properties.packettime);
            timestring = (new Date(utcdate.getTime() - utcdate.getTimezoneOffset()*60*1000)).toLocaleString("en-us", {hour12: false});
        }
        else if (geojson.properties.receivetime) {
            const utcdate = new Date(geojson.properties.receivetime);
            timestring = (new Date(utcdate.getTime() - utcdate.getTimezoneOffset()*60*1000)).toLocaleString("en-us", {hour12: false});
        }
        else if (geojson.properties.day) 
            timestring = geojson.properties.day;
        //------------------ END: figure out what timestamp to use from the geojson packet -------------
        } catch (e) {
            console.log(e);
        }
        

        // build the rest of the HTML string
        html += (timestring ? "<td style=\"margin: 0; padding:0; text-align: right; white-space: nowrap;\">" + timestring + "</td>" : "<td>&nbsp;</td>");
        html += "</tr>";

        // Is this a Reynolds transition point?
        if (geojson.properties.reynolds_transition) {
            let msg = "airflow transitioning from turbulent to laminar flow";
            if (geojson.properties.reynolds_transition == "low_to_high")
                msg = "airflow transitioning from laminar to turbulent flow";

            html += "<tr><td colspan=2 style=\"margin: 0; padding:0; text-align: left;\">Reynolds transition point: " + msg + "</td></tr>";
        }

        // the altitude of burst or breadcrumb objects
        if (geojson.properties.id.endsWith("burst") || geojson.properties.id.endsWith("breadcrumb"))
            html += "<tr><td colspan=2 style=\"margin: 0; padding:0; text-align: left; white-space: nowrap;\">Altitude: <mark class=\"marginal\">" + 
                (imperial ? Math.round(geojson.properties.altitude_ft*1.0).toLocaleString() + "ft" : Math.round(geojson.properties.altitude_m*1.0).toLocaleString() + "m") + "</mark></td></tr>";

        // the lat/lon HTML string
        const coords = createCoordsHTML(geojson);
        html += coords;

        // closing div
        html += "</table>";
    }

    // return the html
    return html;

} 

// helper function to craft an HTML string with lat/lon coordinates with a "copy to clipboard" clickable icon 
function createCoordsHTML(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point")
        return "";

    // check coordinates
    if (!geojson.geometry.coordinates || geojson.geometry.coordinates[0] == 0 || geojson.geometry.coordinates[1] == 0)
        return "";

    // the flight name
    let flight = geojson.properties.flightid;

    // if this is the burst object, change the flight name to indicate that.
    if (geojson.properties.id.endsWith("burst"))
        flight = flight + " Burst ";

    // construct a random ID the copyToClipboard function can use to identify the coords string.
    let id = (Math.random() + 1).toString(36).split(".")[1].toUpperCase();

    // the lat,lon
    let lat = (geojson.geometry.coordinates[1] * 1.0).toFixed(8);
    let lon = (geojson.geometry.coordinates[0] * 1.0).toFixed(8);
    
    // form up the URL that will take the user to their specific map platform for directions to these coordinates
    let URL;

    // is this an apple platform?  So we know to send user's to Google Maps or Apple Maps when clicking coordinate links.
    const isApplePlatform = isApple();

    // Are we on an Apple device?
    if (isApplePlatform) 
        URL = "https://maps.apple.com/?q=" + flight + "&ll=" + lat + "%2C" + lon;
    else
        URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon + "&query_place_id=" + lat + "%2C" + lon;


    let html = "<tr><td colspan=2 style=\"margin:0; padding:0; text-align: left;\">";
    html += "Coords: " + (URL ? "<a class=\"inverse\" target=\"_blank\" href=\"" + URL + "\">" : "") + "<span id=\"" + id + "-coords\">" + lat + ", " + lon + "</span>" + (URL ? "</a>" : "");
    html += " &nbsp; <img class=\"copytoclipboard\" src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">";
    html += "</td></tr>";

    return html;
}

// This will create the tooltip (ex. label underneath the marker on the map) with the supplied geojson
function stationTooltip(geojson) {

    // sanity check...
    if (!geojson)
        return null;

    // units (hard setting this for now)
    //const imperial = (UNITS == "imperial" ? true : false);
    const imperial = true;

    let content = null;

    if (geojson.properties.id.endsWith("burst"))
        content = "Burst: " + (imperial ? Math.round(geojson.properties.altitude_ft * 1.0).toLocaleString() + "ft" : Math.round(geojson.properties.altitude_m * 1.0).toLocaleString() + "m");
    if (geojson.properties.id.endsWith("launch"))
        content = "Launch";
    if (geojson.properties.id.endsWith("landing"))
        content = "Landing";
    if (geojson.properties.id.endsWith("breadcrumb")) {
        if (geojson.properties.tooltiptext)
            content = geojson.properties.tooltiptext;
    }

    return content;
} 

/***********
* regenMapLabels
*
* loops through all layers on the map and updates tooltip and popup content
***********/
function regenMapLabels() {

}

/***********
* updateMap
*
* updates the map with a featurecollection for the provided flight data
***********/
function updateMap(data) {

    // create a geojson featurecollection for this flight
    const fc = createFeatureCollection(data);

    if (fc && map) {

        // create a new leafjetjs geojson object for each feature in the collection
        fc.features.forEach(f => {
            let geojson = L.geoJSON(f, {

                // styling for path features
                style: geojsonstyle,

                // This is called for each feature added 
                onEachFeature:  function (geojsonfeature, layer) {

                    const isBurst = geojsonfeature.properties.id.endsWith("burst");
                    const isLaunch = geojsonfeature.properties.id.endsWith("launch");
                    const isLanding = geojsonfeature.properties.id.endsWith("landing");
                    const isBreadcrumb = geojsonfeature.properties.id.endsWith("breadcrumb");

                    // create some short text to be used as a popup for this feature
                    const text = stationPopup(geojsonfeature);
                    if (text)
                        layer.bindPopup(text);

                    // create the label underneath the feature
                    const tooltip = stationTooltip(geojsonfeature);
                    if (tooltip) {

                        let pane;
                        let offset;
                        if (isBreadcrumb) {
                            pane = "otherTooltipPane";
                            offset = L.point([0, -12]);
                        }
                        else {
                            pane = "flightTooltipPane";
                            offset = L.point([0, 0]);
                        }

                        layer.bindTooltip(stationTooltip(geojsonfeature), { 
                            className: (isBreadcrumb ? "myTooltipLabelStyle" : (isBurst || isLanding || isLaunch ? "flightTooltipLabelStyle" : "myTooltipStyle")), 
                            permanent: true, 
                            direction: "center", 
                            opacity: .9,
                            pane: pane,
                            offset: offset
                        });
                    }
                },

                // for every point geometry added, this function is called.
                pointToLayer: function (feature, latlon) {
                    let marker;

                    const isBurst = feature.properties.id.endsWith("burst");
                    const isLaunch = feature.properties.id.endsWith("launch");
                    const isLanding = feature.properties.id.endsWith("landing");
                    const isBreadcrumb = feature.properties.id.endsWith("breadcrumb");

                    if (isBurst || isLaunch || isLanding) {
                            
                        // iconsize
                        let iconsize = 24;

                        // icon center
                        let iconsize_center = Math.trunc(iconsize/2);
                     
                        // move the tooltip anchor location down just a little
                        let tipanchor = iconsize_center + 10;

                        // the filename for the icon
                        let filename = "";
                        if (isLaunch)
                            filename = "/images/aprs/PO.png";
                        if (isBurst)
                            filename = "/images/aprs/LN.png";
                        if (isLanding)
                            filename = "/images/aprs/BO.png";

                        // new icon for this object
                        let myIcon = L.icon({
                            iconUrl: filename,
                            iconSize: [iconsize, iconsize],
                            iconAnchor: [iconsize_center, iconsize_center],
                            popupAnchor: [0, -iconsize_center],
                            tooltipAnchor: [0, tipanchor]
                        });

                        // return a new marker object with our custom icon and rotation
                        marker = L.marker(latlon, { icon: myIcon, riseOnHover: true, pane: "flightPane" });
                    }
                    else if (isBreadcrumb) {
                        let fillcolor = 'black';
                        let radius = 3;

                        // figure out what color the breadcrumb needs to be
                        if (feature.properties.flight_phase && feature.properties.flight_phase == "ascending")
                            fillcolor = ascending_color;
                        else if (feature.properties.flight_phase && feature.properties.flight_phase == "descending")
                            fillcolor = descending_color;

                        if (feature.properties.reynolds_transition == "high_to_low" || feature.properties.reynolds_transition == "low_to_high") 
                            fillcolor = 'red';
                        

                        marker = L.circleMarker(latlon, { radius: radius , riseOnHover: true, fillColor: fillcolor, fillOpacity: .9, stroke : false, fill: true, pane: "breadcrumbPane" });
                    }
                    else
                        marker = L.marker(latlon, { pane: "otherStationsPane" });

                    return marker;
                }

            });

            // Add this feature to the map
            geojson.addTo(map);
        });

        // find the launch feature and pan the map to that location.
        const burst = fc.features.find(f => f.properties.id.endsWith("_burst"));
        if (burst && burst.geometry && burst.geometry.coordinates)
            map.panTo(L.latLng(burst.geometry.coordinates[1], burst.geometry.coordinates[0]));
    }
}


/***********
* createFeatureCollection
*
* creates a geojson object from the supplied flight data.  Returns a FeatureCollection geojson object.
***********/
function createFeatureCollection(data, burst_altitude) {

    if (!data || !data.packets || data.packets.length == 0)
        return null;

    // units (hard setting this for now)
    //const imperial = (UNITS == "imperial" ? true : false);
    const imperial = true;

    // the packets
    const packets = data.packets;

    // function for building a feature
    const feature = function(id, properties, geometry) {
        return {
            "type": "Feature",
            "geometry": geometry,
            "properties": {...properties, id}
        };
    };

    // function for building a new feature collection
    const featurecollection = function(name, featurelist) {
        return {
            "type": "FeatureCollection",
            "properties": { "name": name },
            "features": featurelist
        };
    };

    // find the packet based on its altitude and return a geojson feature 
    const featureFromPacket = function(id, alt, packetlist) {
        const burst = packetlist.find(a => a.altitude_ft === alt);
        if (burst) {
            const point = {
                "type": "Point",
                "coordinates": [burst.longitude, burst.latitude]
            };
            return feature(id, burst, point); 
        }
        else
            return null;
    };


    // linestring geometry for the ascent from the packets lat,lon pairs
    const linestring_ascent = { 
        "type": "LineString",
        "coordinates": packets.filter(a => a.flight_phase == "ascending" && a.latitude != 0 && a.longitude != 0).map(elem => [elem.longitude, elem.latitude])
    };

    // linestring geometry for the descent from the packets lat,lon pairs
    const linestring_descent = { 
        "type": "LineString",
        "coordinates": packets.filter(a => a.flight_phase == "descending" && a.latitude!= 0 && a.longitude != 0).map(elem => [elem.longitude, elem.latitude])
    };

    // Need to add the last point during the ascent to the beginning of the descent linestring to prevent a 
    // gap between the end of the ascent and the start of the descent.
    if (linestring_ascent && linestring_ascent.coordinates && linestring_ascent.coordinates.length > 0)
        linestring_descent.coordinates.unshift(linestring_ascent.coordinates[linestring_ascent.coordinates.length-1]);

    // build the properties for this flight.  Don't need the packets...
    let properties = {...data};
    delete properties.packets;

    // add the ascent and descent paths to our geojson feature list
    let features = [
        feature(properties.flight + "_ascent", properties, linestring_ascent), 
        feature(properties.flight + "_descent", properties, linestring_descent),
    ];


    // search for and create the burst point geojson feature
    const burstfeature = featureFromPacket(properties.flight + "_burst", (imperial ? properties.maxaltitude_ft : properties.maxaltitude_m), packets);
    if (burstfeature)
        features.push(burstfeature);

    // add a geojson point feature for the launch location (i.e. the first packet in the packets list)
    const launchfeature = feature(properties.flight + "_launch", packets[0], { "type": "Point", "coordinates": [packets[0].longitude, packets[0].latitude]});
    if (launchfeature)
        features.push(launchfeature);

    // add a geojson point feature for the landing location (i.e. the last packet in the packets list)
    const landingfeature = feature(properties.flight + "_landing", packets[packets.length-1], { "type": "Point", "coordinates": [packets[packets.length-1].longitude, packets[packets.length-1].latitude]});
    if (landingfeature)
        features.push(landingfeature);
    
    // gather the data points that we'll use to create breadcrumbs from, but ignore the burst point, along with the first and last data points, and any reynolds transitions points.
    let breadcrumb_packets = packets.slice(1, -1).filter(a => a.altitude_ft != (imperial ? properties.maxaltitude_ft : properties.maxaltitude_m));

    // split that into ascent and descending set of packets
    let bc_packets_ascent = breadcrumb_packets.filter(a => a.flight_phase == "ascending")
    let bc_packets_descent = breadcrumb_packets.filter(a => a.flight_phase == "descending")

    // now loop through adding a key to each data point that indicates if we should display the altitude as a tooltip for the feature (ex. every 10k feet or similar)
    let i = 0;
    let mod = Math.round(bc_packets_ascent.length * .13);
    bc_packets_ascent = bc_packets_ascent.map(function(p) {
        p.tooltiptext = null;
        if (i % mod == 0) 
            p.tooltiptext = Math.round(p.altitude_ft / 1000) + (imperial ? "k" : "km");

        if (p.reynolds_transition == "high_to_low" || p.reynolds_transition == "low_to_high")
            p.tooltiptext = "Re Transition";

        i += 1;

        return p;
    });

    i = 0;
    mod = Math.round(bc_packets_descent.length * .13);
    bc_packets_descent = bc_packets_descent.map(function(p) {
        p.tooltiptext = null;
        if (i % mod == 0) 
            p.tooltiptext = Math.round(p.altitude_ft / 1000) + (imperial ? "k" : "km");
        
        if (p.reynolds_transition == "high_to_low" || p.reynolds_transition == "low_to_high")
            p.tooltiptext = "Re Transition";

        i += 1;

        return p;
    });


    // create a geojson feature for each breadcrumb and add it to our list of features
    bc_packets_ascent.forEach(function(p, i) {
        const bcfeature = feature(p.flightid + "_" + i + "_ascent_breadcrumb", p, { "type": "Point", "coordinates": [p.longitude, p.latitude]});
        if (bcfeature)
            features.push(bcfeature);
    });

    bc_packets_descent.forEach(function(p, i) {
        const bcfeature = feature(p.flightid + "_" + i + "_descent_breadcrumb", p, { "type": "Point", "coordinates": [p.longitude, p.latitude]});
        if (bcfeature)
            features.push(bcfeature);
    });

    // return a feature collection for all of the features for this flight
    return featurecollection(properties.flight, features);
}



/***********
* createCharts
*
* Creates the altitude vs time chart for the flight
***********/
function createCharts(js) {

    // sanity check
    if (!js || !js.packets || js.packets.length == 0)
        return;

    // units
    const isImperial = (UNITS == "imperial" ? true : false);

    // fields to use based on the unit selection
    const fields = {
        "isImperial": (UNITS == "imperial" ? true : false),
        "time": "localtime",
        "altitude": (isImperial ? "altitude_ft" : "altitude_m"),
        "curve_fit": (isImperial ? "velocity_curvefit_fts" : "velocity_curvefit_ms"),
        "vert_rate": (isImperial ? "velocity_z_fts"  : "velocity_z_ms"),
        "temperature": (isImperial ? "temperature_f" : "temperature_c"),
        "airdensity": (isImperial ? "airdensity_slugs" : "airdensity_kgm3")
    };

    // the packet data
    const data = js.packets;

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

        
        /***********************/
        // the altitude chart
        /***********************/
        const createAltitudePlot = function (d, fields) {
            return Plot.plot({
                color: { legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px" },
                width: width,
                height: height,
                x: { label: "Date/Time", type: "time" },
                y: (fields.isImperial ? { label: "Altitude (ft)", interval: 500 } : { label: "Altitude (m)", interval: 150 }),
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d.filter(a => !a.reynolds_transition), {x: fields.time, y: fields.altitude, stroke: "flight_phase" }),

                    // plot any reynolds transistions
                    Plot.dot(d.filter(a => a.reynolds_transition), {x: fields.time, y: fields.altitude, stroke: "red", fill: "red" }),

                    // add a text label for each reynolds transition
                    Plot.text(d.filter(a => a.reynolds_transition), {
                        x: fields.time,
                        y: fields.altitude, 
                        text: (elem) => { return Math.round(elem[fields.altitude] / (fields.isImperial ? 1000 : 1000)).toLocaleString() + (fields.isImperial ? "k, " : "km, ") + (elem.reynolds_transition == "high_to_low" ? "Turbulent-to-Laminar" : "Laminar-to-Turbulent");},
                        textAnchor: "start", 
                        fill: "white", 
                        dx: +20,
                        dy: 0
                    }),

                    // Add a value label for the max altitude
                    Plot.text(d, Plot.selectMaxY({
                        x: fields.time,
                        y: fields.altitude,
                        text: (elem) => {return elem[fields.altitude].toLocaleString() + (fields.isImperial ? "ft" : "m");}, 
                        textAnchor: "start",
                        fill: "white",
                        dx: 0,
                        dy: -20 
                    })),
                    Plot.crosshair(d, {x: fields.time, y: fields.altitude, color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let altitudeplot = createAltitudePlot(data, fields);
        setplot("Altitude vs. Time", altitudeplot, "altitudeplot");


        /***********************/
        // the velocity chart
        /***********************/
        const createVelocityPlot = function (d, c, fields) {

            return Plot.plot({
                color: { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: width,
                height: height,
                x: (fields.isImperial ? { label: "Vertical Rate (ft/min)", transform: (a) => a*60 } : { label: "Vertical Rate (m/s)" }),
                y: (fields.isImperial ? { label: "Altitude (ft)", interval: 500 } : { label: "Altitude (m)", interval: 150 }),
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d.filter(a => !a.reynolds_transition),  {x: fields.vert_rate, y: fields.altitude, stroke: "flight_phase" }),

                    // plot any reynolds transistions
                    Plot.dot(d.filter(a => a.reynolds_transition), {x: fields.vert_rate, y: fields.altitude, stroke: "red", fill: "red" }),
                    Plot.ruleY(d.filter(a => a.reynolds_transition), { y: fields.altitude, stroke: "red", fill: "red", strokeDasharray: [10,10] }),

                    // add a text label for each reynolds transition
                    Plot.text(d.filter(a => a.reynolds_transition), {
                        x: fields.vert_rate,
                        y: fields.altitude,
                        text: (elem) => { return Math.round(elem[fields.altitude] / (fields.isImperial ? 1000 : 1000)).toLocaleString() + (fields.isImperial ? "k, " : "km, ") + (elem.reynolds_transition == "high_to_low" ? "Turbulent-to-Laminar" : "Laminar-to-Turbulent");},
                        textAnchor: "start", 
                        fill: "white", 
                        dx: +20,
                        dy: -10 
                    }),

                    // fitted line
                    Plot.line(d, {x: fields.curve_fit, y: fields.altitude, stroke: "flight_phase", strokeOpacity: 1, strokeWidth: 2 }),

                    Plot.crosshair(d, {x: fields.vert_rate, y: fields.altitude, color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let ascent_velocityplot = createVelocityPlot(data.filter(item => item.flight_phase == "ascending"), altitudeplot.scale("color"), fields);
        setplot("Ascent Rate", ascent_velocityplot, "ascent_velocityplot");

        let descent_velocityplot = createVelocityPlot(data.filter(item => item.flight_phase == "descending"), altitudeplot.scale("color"), fields);
        setplot("Descent Rate", descent_velocityplot, "descent_velocityplot");


        /***********************/
        // the temperature chart
        /***********************/
        const createTemperaturePlot = function (d, c, fields) {

            return Plot.plot({
                color:  { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: width,
                height: height,
                //x: { label: "Temperature (F)", transform: (a) => (a - 273.15) * 9/5 + 32 },
                x: (fields.isImperial ? { label: "Temperature (F)" } : { label: "Temperature (C)" }),
                y: (fields.isImperial ? { label: "Altitude (ft)", interval: 500 } : { label: "Altitude (m)", interval: 150 }),
                facet: { label: "Beacon Callsign" },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d.filter(a=> !a.reynolds_transition), {x: fields.temperature, y: fields.altitude, stroke: "flight_phase", fx: "callsign" }),

                    // plot any reynolds transistions
                    Plot.dot(d.filter(a => a.reynolds_transition), {x: fields.temperature, y: fields.altitude, stroke: "red", fill: "red", fx: "callsign" }),

                    // add a text label for each reynolds transition
                    Plot.text(d.filter(a => a.reynolds_transition), {
                        x: fields.temperature,
                        y: fields.altitude,
                        text: (elem) => { return Math.round(elem[fields.altitude] / (fields.isImperial ? 1000 : 1000)).toLocaleString() + (fields.isImperial ? "k, " : "km, ") + (elem.reynolds_transition == "high_to_low" ? "Turbulent-to-Laminar" : "Laminar-to-Turbulent");},
                        textAnchor: "start", 
                        fill: "white", 
                        dx: +20,
                        dy: -10,
                        fx: "callsign"
                    }),

                    Plot.crosshair(d, {x: fields.temperature, y: fields.altitude, color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let temps = data.filter(a => a[fields.temperature] != null);
        let temperatureplot = (temps && temps.length > 0 ? createTemperaturePlot(temps, altitudeplot.scale("color"), fields) : null);
        setplot("Temperature", temperatureplot, "temperatureplot");


        /***********************/
        // the airdensity chart
        /***********************/
        const createAirdensityPlot = function (d, c, fields) {

            return Plot.plot({
                color: { ...c, legend: true, className: "legend" },
                marginLeft: 50,
                marginBottom: 50,
                marginTop: 50,
                marginRight: 50,
                style: { overflow: "visible", fontSize: "12px", color: "#c8c8c8" },
                width: width,
                height: height,
                x: (fields.isImperial ? { label: "Airdensity (slugs)" } : { label: "Airdensity (kg/m^3)" }),
                y: (fields.isImperial ? { label: "Altitude (ft)", interval: 500 } : { label: "Altitude (m)", interval: 150 }),
                facet: { label: "Beacon Callsign" },
                marks: [
                    // the grid and axis
                    Plot.axisX({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.axisY({ fill: "#c8c8c8", stroke: "#f0f0f0" }),
                    Plot.gridY({stroke: "#f0f0f0" }),
                    Plot.gridX({stroke: "#f0f0f0" }),
                    Plot.frame({stroke: "#404040", strokeWidth: 2}),

                    // The primary data series
                    Plot.dot(d.filter(a=> !a.reynolds_transition),  {x: fields.airdensity, y: fields.altitude, stroke: "flight_phase", fx: "callsign" }),

                    // plot any reynolds transistions
                    Plot.dot(d.filter(a => a.reynolds_transition), {x: fields.airdensity, y: fields.altitude, stroke: "red", fill: "red", fx: "callsign" }),

                    // add a text label for each reynolds transition
                    Plot.text(d.filter(a => a.reynolds_transition), {
                        x: fields.airdensity,
                        y: fields.altitude,
                        text: (elem) => { return Math.round(elem[fields.altitude] / (fields.isImperial ? 1000 : 1000)).toLocaleString() + (fields.isImperial ? "k, " : "km, ") + (elem.reynolds_transition == "high_to_low" ? "Turbulent-to-Laminar" : "Laminar-to-Turbulent");},
                        textAnchor: "start", 
                        fill: "white", 
                        dx: +20,
                        dy: -10,
                        fx: "callsign"
                    }),

                    Plot.crosshair(d, {x: fields.airdensity, y: fields.altitude, color: "flight_phase", ruleStrokeWidth: 2, textFill: "white", textStroke: "black", textStrokeOpacity: .7, textStrokeWidth: 20 })
                ]
            });
        };

        let densities = data.filter(a => a[fields.airdensity] != null);
        let airdensityplot = (densities && densities.length > 0 ?  createAirdensityPlot(densities , altitudeplot.scale("color"), fields) : null);
        setplot("Air Density", airdensityplot, "airdensityplot");

    } catch(error) {
        //alert("error: " + error.message);
        console.log(error);
    }
}


/***********
* buildTable
*
* Build the table of information about the flight's details.
***********/
function buildTable(json) {

    // units
    const imperial = (UNITS == "imperial" ? true : false);

    // indices 
    let key, i;
    const packets = json.packets;
    const launchdate = json.day;
    const max_altitude = (imperial ? json.maxaltitude_ft : json.maxaltitude_m);
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

        return "<a href=\"" + URL + "\" target=\"_blank\">" + lat.toFixed(8) + ", " + lon.toFixed(8) + "</a> @ " + alt.toLocaleString() + (imperial ? "ft" : "m");
    };

    // wrapper div
    let div = document.createElement("div");
    div.setAttribute("style", "margin: 30px;");

    // title
    let p = document.createElement("p");
    p.setAttribute("class", "normal");
    p.setAttribute("style", "border: 0; font-size: 1.2em; margin-left: 0; font-variant: small-caps;");
    p.innerHTML = "Flight Data";
    div.appendChild(p);

    // Create the table
    let table = document.createElement("Table");
    let metadata = document.getElementById("metadata");
    table.setAttribute("class", "flightlist-plain");
    table.setAttribute("style", "width: auto;");

    // the columns
    const columns = ["Flight", "Date", "Balloon Size", "Parachute", "Beacon Callsigns", "Max Altitude", "Launch Location", "Landing Location", "Distance Traveled", "Flight Duration", "Ascent Airflow Transition Points", "Lift Factor", "H<sub>2</sub> Fill", "Number of Data Points", "Data"];

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
        p.setAttribute("style", "border: 0; font-size: 1.2em; margin-left: 0; font-variant: small-caps;");
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
            const keyname = keys[key].split("_")[0];
            headerCell.innerHTML = keyname;
            headerCell.setAttribute("class", "flightlistheader");
            row.appendChild(headerCell);
        }

        // table rows
        //let values = Object.values(js);
        let tablerow = table.insertRow(-1);

        //for (let value in values) {
        for (const [key, value] of Object.entries(js)) {
            let tablecell = document.createElement("td");
            tablecell.setAttribute("class", "flightlist");

            // get the units from the key name
            const units = key.split("_")[1];

            //tablecell.setAttribute("style", "font-size: 1em; padding-left: 10px; text-align: left;");
            tablecell.innerHTML = (value * 1.0).toFixed(2) + units + "s";
            tablerow.appendChild(tablecell);
        }

        div.appendChild(table);
        return div;
    };

    // function to build a quick table for displaying the Reynolds transition points
    const reynoldstable = function(data, isImperial) {
        let html = "<table style=\"padding: 10px;\">";
        html += "<tr><th style=\"font-variant: small-caps; font-size: 1.1em; text-align: left; border-bottom: 1px solid darkgray;\">Reynolds Number</th><th style=\"font-variant: small-caps; font-size: 1.1em; text-align: right; padding-left: 20px; border-bottom: 1px solid darkgray;\">Altitude</td></tr>";
        html += json.reynolds_transitions.reduce(function(html, item) {
            html += "<tr><td style=\"font-size: 1em; text-align: left;\">";
            html += item.transition;
            html += "</td><td style=\"font-size: 1em; padding-left: 20px; text-align: right;\">";
            html += (isImperial ? item.altitude_ft.toLocaleString() + "ft" : item.altitude_m.toLocaleString() + "m");
            html += "</td></tr>";
            return html;
        }, '');
        html += "</table>";
        return html;
    };


    // the balloonsize
    const balloonsize_metric = parseInt(json.balloonsize);
    const balloonsize_imperial = balloonsize_metric * 0.00220462;

    // the max altitude as determined by telemetry packets
    let burst_ft = json.maxaltitude_ft;
    let burst_m = json.maxaltitude_m;

    // determine if the accelerometer detected burst was successful or not
    const detected_burst = (json.detected_burst && json.detected_burst.detected);
    if (detected_burst) {
        let db = json.detected_burst;
        burst_ft = (db.burst_ft > burst_ft ? db.burst_ft : burst_ft);
        burst_m = (db.burst_m > burst_m ? db.burst_m : burst_m);
    }

    // the various entries for the cells.
    const cellvalues = [
        json.flight,
        json.day,
        (imperial ? balloonsize_imperial.toFixed(2) + "lbs" : balloonsize_metric.toFixed(0) + "gm"),
        (imperial ? (json.parachute.size_ft * 1.0).toFixed(0) + "ft" : (json.parachute.size_m * 1.0).toFixed(2) + "m") + " " +
        json.parachute.description,
        json.beacons.join(", "),
        (imperial ? 
            (burst_ft >= 100000 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + burst_ft.toLocaleString() + "ft </mark>" : burst_ft.toLocaleString() + "ft") :
            (burst_m >= 30480 ? "<mark class=\"okay\" style=\"font-variant: normal;\"> " + burst_m.toLocaleString() + "m </mark>" : burst_m.toLocaleString() + "m") 
        ) + 
        (detected_burst ? "<br><font style=\"font-size:.8em;color:#aaaaaa;\">Beacon Detected</font>" : "")
        ,
        mapurl(json.flight, json.launch_location.latitude, json.launch_location.longitude, (imperial ? json.launch_location.altitude_ft : json.launch_location.altitude_m)),
        mapurl(json.flight, json.landing_location.latitude, json.landing_location.longitude, (imperial ? json.landing_location.altitude_ft : json.launch_location.altitude_m)),
        (imperial ? json.range_distance_traveled_mi.toFixed(2) + "mi" : json.range_distance_traveled_km.toFixed(2) + "km"),
        json.flighttime,
        reynoldstable(json.reynolds_transitions, imperial), 
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
        {"type": "pandas", "ext": "pkl" },
        {"type": "parquet","ext": "parquet" },
        {"type": "kml",    "ext": "kml" }
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

    // filter the weights based on the type of units we're displaying
    const filtered_weights = Object.fromEntries(
        Object.entries(json.weights).filter(
            ([key, val]) => key.includes( (imperial ? "_lb" : "_kg"))));

    // add the weights table to the page element
    metadata.appendChild(weighttable(filtered_weights));
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
    updatePage(FLIGHT_JSON);

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
    updatePage(FLIGHT_JSON);

    // change the units display
    createUnitsLink(UNITS);
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
    UNITS = document.getElementById("units").getAttribute("data-units");

    // defaults
    if (!UNITS)
        UNITS = default_value;

    // defaults
    if (UNITS != "imperial" && UNITS != "metric")
        UNITS = default_value;

    // if we've been supplied with a flightid, then process
    if (flightid) {

        // create a map object
        map = initialize_map('map');

        // initialize the various map panes
        initialize_panes();
        
        // update the header label
        document.getElementById("headerlabel").innerHTML = "Telemetry for " + flightid;

        // get the fligh list metadata
        getFlightList("/flightdata/json/flights_metadata.json").then((json) => {

            // save the flightlist metadata
            FLIGHTLIST = json;

            // update the prev and next flights on the header label
            updateNextPrev(FLIGHTLIST.flight);
        });

        // fetch flight data and process
        getFlight("/flightdata/json/" + flightid.toLocaleLowerCase() + ".json");

        // create the initial units link
        createUnitsLink(UNITS);

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
