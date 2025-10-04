/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2025 Jeff Deaton (N0JD)
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
 * Global variables
 *
************/

// The map object and default starting location
let map;
let starting_location = { "lat": 39.739, "lon": -104.984, "zoom": 7 };

// The layercontrol object
let layercontrol;

// the GPS status box
let gpsstatusbox;

// the backend status box (only added if we're not using the internet kiosk system as the "backend")
let backendstatusbox;

// status box for connection messages
let connectionbox;

// The catchall stations layer
let stations;

// THe layer for tracker stations
let trackers;

// The active trackers list
let trackerslist = {};

// The active flight list
let flightlist = {};

// my location layer and position source preference
let mylocation;
let useGeoLocation = false; // we assume false here unless the user is connected to the EOSS kiosk website (e.g. track.eoss.org)

// The hostname of the EOSS kiosk system
let kiosk_hostname = "track.eoss.org";
let KIOSKMODE = false;  // are we using the kiosk system or not

// the SSESteam class object that will handle SSE ops
let ssestream;

// The list of packets we've heard from the backend.  This is treated like a FIFO list.
let packetlist = [];

// age limit in seconds for keeping packets in the packetlist.  i.e. when to "shift" out the first element
let agelimit = 3600 * 3;

// is this an apple-based platform?  Used to determine if we need to craft links for apple maps or google maps.
let isApplePlatform = true;

// global color map for flight paths and the breadcrumbs within them.
// The global color index (so that each new flight gets a new color set)
let colorindex = 0;
let colorMap = {};
let ascending_colorsets = [
    { color : 'hotpink', markerColor: 'deeppink'},
    { color : 'green', markerColor: 'darkgreen'},
    { color : 'chocolate', markerColor: 'saddlebrown'},
    { color : 'olivedrab', markerColor: 'darkolivegreen'},
    { color : 'red', markerColor: 'darkred'},
    { color : '#00e600',   markerColor: '#009900'}
];
let descending_colorsets = [
    { color : 'cadetblue', markerColor: 'steelblue'},
    { color : 'darkorchid', markerColor : 'purple'},
    { color : 'slateblue', markerColor: 'darkslateblue'},
    { color : 'mediumpurple', markerColor : 'indigo'},
    { color : 'blue',       markerColor: 'darkblue'},
    { color : 'royalblue',   markerColor: 'blue'}
];

function getColorSet(flightname) {
    return colorMap[flightname];
}

function initializeColorSet(flightname) {
    if (!colorMap[flightname]) {
        colorMap[flightname] = {};
    }

    if (colorindex > ascending_colorsets.length - 1)
        colorindex = 0;

    let colors = { "ascending": ascending_colorsets[colorindex], "descending": descending_colorsets[colorindex] };
    colorMap[flightname] = colors;
    colorindex += 1;

    return colors;
};

// return a string represenation of a number, but padded with a leading zero.  Primarily used with times/dates.
function padNumber(n) {
    n = Math.floor(Math.abs(n));
    return n.toString().padStart(2, '0');
}

// Return the date/time object as an ISO formated string (YYYY-MM-DD HH:MM:SS)
function getISODateTimeString(thedate, millisecs) {
    var ts;

    if (thedate)
        ts = thedate;
    else
        ts = new Date(Date.now());

    var str =
        ts.getFullYear() +
        "-" + padNumber(ts.getMonth()+1) +
        "-" + padNumber(ts.getDate()) +
        " " + padNumber(ts.getHours()) +
        ":" + padNumber(ts.getMinutes()) +
        ":" + padNumber(ts.getSeconds());

    if (millisecs)
        str += "." + ts.getMilliseconds();

    return str;
}

// helper function to determine if the flight is ascending based on a (altitude in feet) and v (velocity in ft/sec)
const isAscending = function(a, v) { return (v >= 5 || (v >= 0 && a > 10000) ? true : false); };

// helper function to determine if the flight is descending based on a (altitude in feet) and v (velocity in ft/sec)
const isDescending = function(a, v) { return (v <= -5 || (v > -5 && v < 0 && a > 10000) ? true : false); };

// helper function to determine if the flight is on the ground based on a (altitude in feet) and v (velocity in ft/sec)
const isOnGround = function(a, v) { return (v > -5 && v < 5 && a < 10000 ? true : false); };

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
* distance
*
* This function return the distance in miles between two lat/lon points
***********/
function distance(lat1, lon1, lat2, lon2) {

    // Radians per degree
    var p = Math.PI / 180;

    // The cosine function
    var c = Math.cos;

    // partial calculation...
    var a = 0.5 - c((lat2 - lat1) * p)/2 +
            c(lat1 * p) * c(lat2 * p) *
            (1 - c((lon2 - lon1) * p))/2;

    // Finish the calcs and return the distance in miles
    return Math.round((12742 * Math.asin(Math.sqrt(a)))*.6213712 * 100)/100;
}


// helper function to craft an HTML string with lat/lon coordinates with a "copy to clipboard" clickable icon for a geojson Point object.
function createCoordsHTML(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point")
        return "";

    // check coordinates
    if (!geojson.geometry.coordinates || geojson.geometry.coordinates[0] == 0 || geojson.geometry.coordinates[1] == 0)
        return "";

    // this station's callsign / name
    let callsign = (geojson.properties.callsign ? geojson.properties.callsign : "Location");

    // if this is the burst breadcrumb, change the callsign to indicate that.
    if (geojson.properties.physics && geojson.properties.physics.burst == true)
        callsign = (geojson.properties.flightid ? geojson.properties.flightid + " Burst" : callsign);

    // construct a random ID the copyToClipboard function can use to identify the coords string.
    let id = (Math.random() + 1).toString(36).split(".")[1].toUpperCase();

    let lat = (geojson.geometry.coordinates[1] * 1.0).toFixed(4);
    let lon = (geojson.geometry.coordinates[0] * 1.0).toFixed(4);
    // note:  '%2C' is the ',' (comma) character. but we use the % version of that when forming up URL strings
    let destination = lat + "%2C" + lon;

    
    // get our current location (if available)
    let mycoords = "";
    let distance_to_destination = 0;
    if (mylocation) {
        let f= mylocation.getFeature("My Location");
        if (f && f.geometry && f.geometry.coordinates) {
            mycoords = f.geometry.coordinates[1] + "%2C" + f.geometry.coordinates[0];
            distance_to_destination = distance(f.geometry.coordinates[1], f.geometry.coordinates[0], lat, lon);
        }
    }

    // form up the URL that will take the user to their specific map platform for directions to these coordinates
    let URL;

    // Are we on an Apple device?
    if (isApplePlatform) {
        URL = "https://maps.apple.com/?q=" + callsign + "&ll=" + destination;
    }

    // we're using Google Maps as we're not on an Apple device
    else {

        // if we know where "we" are, then ask Google Maps to plot a course for us
        if (mycoords) {
            // by default we're driving to this destination
            let travelmode = "driving";

            // However, if this is a flight, it's on the ground (or nearly so), and we're not far away, then we should ask Google for a "walking" route instead of "driving".
            if (isFlight(geojson) && geojson.properties.physics && isOnGround(geojson.properties.physics.altitude, geojson.properties.physics.z_velocity) && distance_to_destination < 3.1)
                travelmode = "walking";
            else if (distance_to_destination < 1) // ...or...we're just really close to the station
                travelmode = "walking";

            URL = "https://www.google.com/maps/dir/?api=1" +
                "&origin=" + mycoords +
                "&destination=" + destination +
                "&travelmode=" + travelmode + 
                "&dir_action=navigate";
        }

        // otherwise we just query Google Maps for the location itself.
        else {
            URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon + "&query_place_id=" + lat + "%2C" + lon;
        }
    }

    let html = "<tr><td colspan=2 style=\"margin:0; padding:0; text-align: left;\">";
    html += "Coords: " + (URL ? "<a target=\"_blank\" href=\"" + URL + "\">" : "") + "<span id=\"" + id + "-coords\">" + lat + ", " + lon + "</span>" + (URL ? "</a>" : "");
    html += " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">";
    html += "</td></tr>";

    return html;
}

// helper function to create an HTML string for flight telemetry (if available, otherwise returns null)
function createTelemetryHTML(geojson) {

    // our HTML string
    let html = ""

    // if this feature contains phyiscs and a beacon then we try to report on that telemetry
    if (geojson && geojson.properties && geojson.properties.physics && geojson.properties.beacon) {

        html += "<tr><td style=\"margin:0; padding:0; text-align: left;\">";

        // the beacon that transmitted this position report
        const reporting_beacon = "Beacon : " + geojson.properties.beacon.toUpperCase();
        html += reporting_beacon;
        html += "</td>";

        // vertical rate (ft/min)
        const vrate = Math.round(geojson.properties.physics.z_velocity * 60);
        html += "<td style=\"text-align: left; margin:0; padding:0;\"> &nbsp; Vert Rate: " + vrate.toLocaleString() + " ft/min</td>";
        html += "</tr>";
    }

    return html;
}


// helper function to create an HTML string for the speed, bearing, and altitude of a geojson Point object.
function createSpeedHTML(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point" || !geojson.properties)
        //return "<font style=\"text-align: left; clear right; float left;\"><br>Alt: n/a &nbsp; n/aMPH &nbsp; @ n/a&deg;</font>";
        return "";

    // Lots to check for a valid speed & bearing result...we don't report speed for a stationary object.
    // speed_mph is > 0 && < 300
    // bearing is a number and >= 0
    // altitude is not 0
    //
    // by default we assume that the speed value should not be reported.
    let speedValid = false;
    if (geojson.properties.speed_mph && geojson.properties.bearing && geojson.properties.altitude) {
        if (geojson.properties.speed_mph > 0 && geojson.properties.speed_mph < 300 && geojson.properties.bearing >= 0 && geojson.properties.altitude != 0)
            speedValid = true;
    }

    //console.log("speedValid: ", speedValid, geojson.properties.altitude, geojson.properties.speed_mph, geojson.properties.bearing);

    let str = (typeof(geojson.properties.altitude) == "undefined" ? "" : (geojson.properties.altitude != 0 && geojson.properties.altitude != "" ? "Alt: <font class=\"altitudestyle\">" + 
            Math.round(geojson.properties.altitude * 1.0).toLocaleString() + "ft</font>" : "")) + 
        (speedValid ? " &nbsp; " + (geojson.properties.speed_mph * 1.0 ).toFixed(0) + " MPH &nbsp; @ " + (geojson.properties.bearing * 1.0).toFixed(0) + "&deg;" : "");

    let html = "";
    if (str) {
        html = "<tr><td colspan=2 style=\"margin:0; padding:0; text-align: left;\">";
        html += str;
        html += "</td></tr>";
    }

    return html;
}

    // the frequency / heardfrom string
// help function to create an HTML string with the "heardfrom" and frequency of where this packet came from (i.e. who transmitted it).
function createHeardfromHTML(geojson) {
    if (!geojson || !geojson.properties)
        return false;

    let heardfrom = "";
    heardfrom += (typeof(geojson.properties.frequency) == "undefined" ? "" : (geojson.properties.frequency != "" ? "Heard on: " + (geojson.properties.frequency / 1000000)  + 
        (geojson.properties.frequency == "ext radio" || geojson.properties.frequency == "TCPIP" ? "" : "MHz") 
        + (typeof(geojson.properties.heardfrom) == "undefined" ? "" : (geojson.properties.heardfrom != "" ? " via " + geojson.properties.heardfrom : "" )) : "" )); 

    if (typeof(geojson.properties.source) != "undefined") {
        if (geojson.properties.source != "direwolf" && geojson.properties.source != "ka9q-radio") 
            heardfrom = "Heard from TCPIP";
    }

    let html = "";
    if (heardfrom) {
        html = "<tr><td colspan=2 class=\"pathstyle\" style=\"margin:0; padding:0; text-align: left;\">";
        html += heardfrom;
        html += "</td></tr>";
    }

    return html;
}

/************
*
* connection status class
*
* ***********/
L.Control.Connectionstatus = L.Control.extend({
    options: {
        position: 'topleft'
    },

    initialize:  function(options) {
        L.setOptions(this, options);

        // maximum number of lines to display
        this._maxlines = 20;
    },

    // Called when this object is added to the map
    onAdd: function (map) {
        // the outer, primary container
        this._container = L.DomUtil.create('div', 'leaflet-control-connectionstatus');

        // save the map object
        this._onThisMap = map;
        
        // the container for status text
        this._statuscontainer = L.DomUtil.create('table', 'leaflet-control-connectionstatus-table', this._container);

        // create a header row and add that to the table
        let tr = L.DomUtil.create("tr", "leaflet-control-connectionstatus-table", this._statuscontainer);
        let tdleft = L.DomUtil.create("th", "leaflet-control-connectionstatus-table", tr);
        let tdright = L.DomUtil.create("th", "leaflet-control-connectionstatus-table", tr);
        tdleft.innerHTML = "Time";
        tdright.innerHTML = "Message";
        tdright.style.paddingLeft='10px';

        return this._container;
    },

    addStatus: function(statusstring) {

        // current time string
        const tm = new Date(Date.now()).toLocaleTimeString('en-US', { hour12: false});

        // create a new row and add that to the table
        let tr = L.DomUtil.create("tr", "leaflet-control-connectionstatus-table", this._statuscontainer);
        let tdleft = L.DomUtil.create("td", "leaflet-control-connectionstatus-table", tr);
        let tdright = L.DomUtil.create("td", "leaflet-control-connectionstatus-table", tr);
        tdleft.innerHTML = tm;
        tdright.innerHTML = statusstring;
        tdright.style.paddingLeft = '10px';

        // current number of rows in the table
        const numrows = this._statuscontainer.rows.length;
        if (numrows > this._maxlines)
            this._statuscontainer.deleteRow(1);

        return this;
    },

    // determine if this control is visible on the map
    onMap:  function() {
        return (this._onTheMap ? true : false);
    }

});


L.Map.mergeOptions({
    connectionstatus: false
});

// this runs immediately after the class constructor
L.Map.addInitHook(function () {
    if (this.options.connectionstatus) {
        this.connectionstatus = new L.Control.Connectionstatus();
        this.addControl(this.connectionstatus);
    }
});

// factory function for creating a new instance of the  "Connectionstatus" class.
L.control.connectionstatus = function (options) {
    return new L.Control.Connectionstatus(options);
};



/************
*
* backend process status box that is added to the map when we're not using the kiosk system (i.e. over the internet to track.eoss.org).
*
* ***********/
L.Control.Statusbox = L.Control.extend({
    options: {
        position: 'topleft'
    },

    initialize:  function(options) {
        L.setOptions(this, options);
    },

    // Called when this object is added to the map
    onAdd: function (map) {
        // the outer, primary container
        this._container = L.DomUtil.create('div', 'leaflet-control-statusbox');

        // save the map object
        this._onThisMap = map;
        
        // the container for status text
        this._statuscontainer = L.DomUtil.create('div', 'statusboxtext', this._container);

        // display default status
        let statusstring = "System: <mark class=\"notokay\">[ NOT RUNNING ]</mark>";
        this.show(statusstring);

        return this._container;
    },

    setStatus: function(statusvalue) {

        // by default dispay that where not running
        let i = 0;
        let statusstring;

        if (statusvalue)
            i = statusvalue;

        switch (i) {
            case 0:
                statusstring = "System: <mark class=\"notokay\">[ NOT RUNNING ]</mark>";
                break;
            case 1:
                statusstring = "System: <mark class=\"okay\">[ RUNNING ]</mark>";
                break;
            case -1:
                statusstring = "System: <mark class=\"marginal\">[ MARGINAL]</mark>";
                break;
            default:
                statusstring = "System: <mark class=\"notokay\">[ NOT RUNNING ]</mark>";
                break;
        }

        this.show(statusstring);
    },

    // update the content of the GPS box with 'message' text.
    show: function (message) {
        let elem = this._statuscontainer;
        elem.innerHTML = message;
    },

    // determine if this control is visible on the map
    onMap:  function() {
        return (this._onTheMap ? true : false);
    }
});

L.Map.mergeOptions({
    statusbox: false
});

// this runs immediately after the class constructor
L.Map.addInitHook(function () {
    if (this.options.statusbox) {
        this.statusbox = new L.Control.Statusbox();
        this.addControl(this.statusbox);
    }
});

// factory function for creating a new instance of the  "Statusbox" class.
L.control.statusbox = function (options) {
    return new L.Control.Statusbox(options);
};


/************
*
* GPS status box that is added to the map when we're using the backend GPS for location information
*
* ***********/
L.Control.Gpsbox = L.Control.extend({
    options: {
        position: 'topright'
    },
    _mylocation: null,

    initialize:  function(options) {
        L.setOptions(this, options);
        if (options)
            this._mylocation = (options.mylocation ? options.mylocation : null);
    },

    // Called when this object is added to the map
    onAdd: function (map) {
        // the outer, primary container
        this._container = L.DomUtil.create('div', 'leaflet-control-gpsbox');

        // save the map object
        this._onThisMap = map;
        
        // the navigation arrow
        let img = L.DomUtil.create('img', 'locationtriangle', this._container);
        img.src = '/images/graphics/locationtriangle.png';

        // the container for status text
        this._statuscontainer = L.DomUtil.create('div', 'gpsstatustext', this._container);

        // self
        let self = this;

        let clicker = function(evt) {

            // the mylocation layer group
            let ml = self._mylocation;

            // if there is a valid mylocation object, then attempt to grab the coordiates from the latest update thereto
            if (ml) {
                let lastlocation = ml.getLastFeature(); 

                // if there was a valid last location with valid coords, then pan the map to that location...assuming we've been added to a map.
                if (lastlocation && lastlocation.geometry && lastlocation.geometry.coordinates && lastlocation.geometry.coordinates[0] != 0 && lastlocation.geometry.coordinates[1] != 0)
                    self._onThisMap.panTo({ lat: lastlocation.geometry.coordinates[1], lng: lastlocation.geometry.coordinates[0] });
            }
        };

        // add event handlers that will pan the map to our current location upon clicking
        this._container.addEventListener('click', clicker);
        //this._statuscontainer.addEventListener('click', clicker);
        //

        // initially we set the display to NO STATUS
        this.setGPSStatus(-1);

        return this._container;
    },

    // updates the GPS box to display the current backend GPS fix status
    //
    // fixvalue can be one of the following, if outside of this range nothing is updated.
    //     0 - no data                          (displayed as red)
    //     1 - no fix, but GPS present          (displayed as red)
    //     2 - 2D fix (i.e. no altitude info)   (displayed as yellow)
    //     3 - 3D fix.                          (displayed as green) 
    //     4 - user's end device.               (displayed as green)
    //
    // using a fixvalue == 4, will cause the status box to display "My Location" as the status message as we're just using the end user's device for location info.
    setGPSStatus: function(fixvalue) {

        let gpsfix;

        switch (fixvalue) {
            case 0:
                gpsfix = "GPS: <mark class=\"notokay\">[ NO DATA ]</mark>";
                break;
            case 1:
                gpsfix = "GPS: <mark class=\"notokay\">[ NO FIX ]</mark>";
                break;
            case 2:
                gpsfix = "GPS: <mark class=\"marginal\">[ 2D ]</mark>";
                break;
            case 3:
                gpsfix = "GPS: <mark class=\"okay\">[ 3D ]</mark>";
                break;
            case 4:
                gpsfix = "<mark class=\"okay\">[ My Location ]</mark>";
                break;
            default:
                gpsfix = "GPS: <mark class=\"notokay\">[ NO STATUS ]</mark>";
                break;
        }
        this.show(gpsfix);
    },

    // update the content of the GPS box with 'message' text.
    show: function (message) {
        let elem = this._statuscontainer;
        elem.innerHTML = message;
    },

    // determine if this control is visible on the map
    onMap:  function() {
        return (this._onTheMap ? true : false);
    },

    // Toggle CSS to the base element so that it glows
    _toggle: function() {
        let b = this._container;

        if (b)
            return b.classList.toggle("leaflet-control-box-glow");
        else
            return false;
    }

});

L.Map.mergeOptions({
    gpsbox: false
});

// this runs immediately after the class constructor
L.Map.addInitHook(function () {
    if (this.options.gpsbox) {
        this.gpsbox = new L.Control.Gpsbox();
        this.addControl(this.gpsbox);
    }
});

// factory function for creating a new instance of the  "Gpsbox" class.
L.control.gpsbox = function (options) {
    return new L.Control.Gpsbox(options);
};



/***********
 * SSE class
 *
 * Used to encapsulate the various SSE stream events, which events we want to subscribe too, and handlers for those events.
 **********/
class SSEStream {
    constructor(options) {

        // options should have these keys
        // options = { handlers: [...list of handlers...], callback: <callback function> }

        // handlers should be an array of objects, for example:
        // handlers = [
        //     { "eventname": "myeventname", "handler": myhandlerfunc },
        //     { "eventname": "myeventname2", "handler": myhandlerfunc2 }
        // ];

        // the eventsource
        this.eventsource = null;

        // the watchdog timer
        this.watchdog = null;

        // watchdog check period (in secs)
        this.watchdog_seconds = 15;

        // the update counter to keep track of the number of SSE events we've heard
        this.datacounter = 0;
        this.datacounter_prev = 0;

        // timestamp fo the last update...just set this to 'now' for the moment.  Will be updated on a call to 'start'.
        this.lastupdate = Date.now();

        // the error callback function
        if (options && options.callback)
            this.errorCallback = options.callback;
        else
            this.errorCallback = null;

        // handlers
        if (options && options.handlers)
            this.handlers = options.handlers;

        if(typeof(EventSource) !== "undefined") 
            return this;
        else  {
            console.log("Unable to use EventSource objects");
            return null;  // we can't use SSE streaming features
        }
    }

    // start SSE operations
    start() {

        if (!this.handlers)
            return null;

        // if an EventSource was already running, the close it
        if (this.eventsource) 
            this.eventsource.close();

        // set the update counter to zero
        this.datacounter = 0;
        this.datacounter_prev = 0;

        // set the lastupdate time to now
        this.lastupdate = Date.now();

        // the URL string
        let urlstring = this._buildURLString(this.handlers);

        // Create new SSE source
        try {
            this.eventsource = new EventSource(urlstring);
        }
        catch (e) {
            console.log({"what": "eventsource creation failed", "error": e});
            return null;
        }

        // this object
        let self = this;

        // loop through those events we're supposed to listen too.  We wrap the handler function in order to keep track of last update times/counts.
        this.handlers.forEach(function(h) {
            self.eventsource.addEventListener(h.eventname, function(data) {
                self.datacounter++;
                self.lastupdate = Date.now() / 1000;
                h.handler(data);
            });
        });

        // listen for any errors, try and restart the connection if there were any
        this.eventsource.addEventListener("error", function(event) {

            // close the event source
            self.close();

            // if an error callback function was supplied, call that.
            if (this.errorCallback)
                this.errorCallback();

            // wait for one second then restart SSE
            setTimeout(function() {
                self.start();
            }, 1000);
        });


        // if there is an active watchdog timer running, clear it.
        if (this.watchdog)
            clearInterval(this.watchdog);

        // setup the watchdog timer to display status every 'watchdog_seconds' 
        this.watchdog = setInterval(function() {
            self.watchdog_handler();
        }, this.watchdog_seconds*1000);
    }

    // method for building the url string 
    _buildURLString(handlers) {
        if (!handlers)
            return null;

        // starting value for the URL
        let urlstring = "ssestream.php";

        // loop through the options provided creating a URL
        urlstring = handlers.reduce(function(str, item) {
            return str + "&" + item.eventname + "=true";
        }, urlstring);

        // replace the first '&' with a '?' so we have a properly formed GET request URL
        urlstring = urlstring.replace("&", "?");

        return urlstring;
    }

    // update the set of event handlers we want this stream to listen too
    setHandlers(handlers) {
        if (handlers)
            this.handlers = handlers;
        return this;
    }

    // add a new handler(s) to our set 
    addHandlers(handlers) {

        // sanity check
        if (!handlers)
            return this;

        // if we don't already have any handlers, create a blank one
        if (!this.handlers) {
            this.handlers = [];
        }

        // is this an array?
        if (Array.isArray(handlers)) {
            // this object
            let self = this;

            handlers.forEach(function(a) {
                self.handlers.push(a);
            });
        }
        else {
            this.handlers.push(handlers);
        }

        return this;
    }

    // close the connection
    close() {

        if (this.eventsource)
            this.eventsource.close();

        this.eventsource = null;

        return this;
    }

    // restart operations
    restart() {

        let self = this;

        // close down the eventsource connection
        this.close();

        // wait for one second then start SSE
        setTimeout(function() {
            self.start();
        }, 1000);

        return this;
    }

    // Watchdog handler function.  Called periodically to check on the status of the SSE connection.  If no data is coming through, then restart the connection
    // and call the supplied callback
    watchdog_handler() {
        
        // get the per second metrics
        let data_per_sec = (this.datacounter - this.datacounter_prev) / this.watchdog_seconds;

        // elapsed secs since last update
        let delta = Math.round((Date.now()/1000 - this.lastupdate) * 100) / 100;

        // set the prior value
        this.datacounter_prev = this.datacounter;

        // if no data then restart operations
        if (delta > 30) {

            // restart the SSE stream
            ssestream.restart();

            // call the callback function with a status message and severity (0 - informational, 1 - critical, had to restart SSE)
            if (this.errorCallback)
                this.errorCallback({"statusmessage": "Restarting SSE...", "severity": 1});
        }
        else {
            // call the callback function with a status message and severity (0 - informational, 1 - critical, had to restart SSE)
            if (this.errorCallback)
                this.errorCallback({"statusmessage": data_per_sec.toFixed(2) + " objects/sec", "severity": 0});
        }
    }
}



/***********
* aprsStations class
*
* An extension of the GeoJSON class so we have a way to track which APRS stations are on the map, etc..
*
* By default it only keeps the latest packet heard for each station.
***********/
let AprsStations = L.GeoJSON.extend({

    options: {

        // This is called for each feature added 
        onEachFeature:  function (feature, layer) {

            // create this layer's popup and/or tooltip content
            updateAprsObject(feature, layer);

        }, // onEachFeature
            

        // for every point geometry added, this function is called.
        pointToLayer: function (feature, latlon) {

            // which z-ordered pane should this feature be added too?
            let pane = getMapPane(feature);

            // get the filename and rotation for the PNG for this APRS object
            let file_and_rotation = getFilenameAndRotation(feature);

            if (file_and_rotation) {
                    
                // iconsize
                let iconsize = 24;

                // icon center
                let iconsize_center = Math.trunc(iconsize/2);
             
                // move the tooltip anchor location down just a little
                let tipanchor = iconsize_center + 10;

                // new icon for this object
                let myIcon = L.icon({
                    iconUrl: file_and_rotation.filename,
                    iconSize: [iconsize, iconsize],
                    iconAnchor: [iconsize_center, iconsize_center],
                    popupAnchor: [0, -iconsize_center],
                    tooltipAnchor: [0, tipanchor]
                });

                // return a new marker object with our custom icon and rotation
                return L.marker(latlon, { icon: myIcon, riseOnHover: true, rotationAngle: file_and_rotation.rotation, rotationOrigin: "center center", pane: pane });
            }

            // What to do with a point that doesn't have a symbol?  Just return a dumb circle, but check if the feature has a defined radius.
            //
            // check for style properties like radius and fillcolor
            let fillcolor = (feature.properties.style && feature.properties.style.fillcolor ? feature.properties.style.fillcolor : "blue");
            let radius = (feature.properties.style && feature.properties.style.radius ? feature.properties.style.radius : 3);
            return L.circleMarker(latlon, { radius: radius , riseOnHover: true, fillColor: fillcolor, fillOpacity: .9, stroke : false, fill: true, pane: pane });

        }, // pointToLayer
        

        // this is called when we get new data for a feature already in our list
        updateFeature: function(newjson, layer) {

            // Must have properties and callsign objects
            if (!newjson || !layer)
                return null;

            //console.log({"w": "updating data", "callsign": newjson.properties.callsign, "tm": newjson.properties.tm, "heardfrom": newjson.properties.heardfrom, "f": newjson});

            // The incoming geometry type
            let type = newjson.geometry.type;

            // The incoming coordinates
            let coordinates = newjson.geometry.coordinates;

            // change the coordinates for this layer (so it moves on the map)
            switch (type) {
                case 'Point':
                    layer.setLatLng(L.GeoJSON.coordsToLatLng(coordinates));
                    break;
                case 'LineString':
                case 'MultiLineString':
                    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(coordinates, type === 'LineString' ? 0 : 1));
                    break;
                case 'Polygon':
                case 'MultiPolygon':
                    layer.setLatLngs(L.GeoJSON.coordsToLatLngs(coordinates, type === 'Polygon' ? 1 : 2));
                    break;
                default:
                    break;
            }

            // Update the popup content
            updateAprsObject(newjson, layer);

            // Update the icon for this object
            updateIcon(newjson, layer);
            
            return layer;
        }, // updateFeature

        // This will filter out geojson objects we don't want added.  It should return true/false.
        // By default, we're only interested in tracker, flight, RF packets, or "My Location" packets.  All other stations we want to ignore.
        filter:  function(geojson) {

            // Determine what type of station this is
            let t = isTracker(geojson);
            let f = isFlight(geojson);
            let l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);
            let rf = isRFPacket(geojson);

            // Check this callsign against the flightlist, trackerlist, "My Location", and if an RF packet
            if (t || f || l || rf)
                return true;

            // by default return false.
            return false;
        },


    }, // options
    
    // Override the parent initialize function so we can set the "name" and options for this class
    initialize: function(name, options) {
        L.GeoJSON.prototype.initialize.call(this);
        this.name = name;
        L.setOptions(this, options);

        // The list of features we're maintaining
        this._features = {};

        // the last feature we ingested/updated
        this._lastfeature = null;
    },

    // override the parent AddData function so we can check if a feature has already been added to this layer group.
    addData: function(geojson) {

        if (!geojson)
            return this;

        // what type of feature is this?
        let isFeature = geojson.type && geojson.type == "Feature";
        let isFeatureCollection = geojson.type && geojson.type == "FeatureCollection";

        // if this geosjon isn't a feature or a featurecollection then eject.
        if (!isFeature && !isFeatureCollection)
            return this;

        // if this is a feature collection, then add each feature, in turn, to this layer.
        if (isFeatureCollection && geojson.features) {
            for (feature in geojson.features) 
                this.addData(geojson.features[feature]);
            return this;
        }

        //
        //
        // we're handling an individual feature if we're at this point.
        //
        //

        // must be properly formed
        if (!geojson.properties || !geojson.properties.callsign) {
            return this;
        }

        if (!geojson.geometry || !geojson.geometry.type) {
            return this;
        }

        // check if this incoming geojson passes our filter
        if (this.options.filter && !this.options.filter(geojson)) 
            return this;

        // normalize this feature (fixes time, etc.)
        geojson = this._normalizeGeoJson(geojson);

        //console.log(this.name + " [" + geojson.properties.callsign + ", " + geojson.properties.tm + "]: adding packet: " + (geojson.properties.raw ? geojson.properties.raw : JSON.stringify(geojson.properties)));

        // Try and determine who we heard this packet from
        let heardfrom = getPacketSource(geojson);
        geojson.properties.heardfrom = (heardfrom ? heardfrom : "");

        // check if this feature is already in our list
        let existing_f = this.getFeature(geojson.properties.callsign);
        let oldlayer = this.getFeatureLayer(geojson.properties.callsign);

        // determine if this is new data or updates to a station we're already tracking
        if (existing_f) {

            // is this duplicate data? (ex. digipeated packets)
            if (!this.isduplicate(geojson, existing_f)) {

                // not duplicate...so we update the geojson feature for this APRS object
                this._features[existing_f.properties.callsign].feature = structuredClone(geojson);

                // update the last feature with this geojson
                this._lastfeature = geojson;

                // now update this feature's popup, tooltip, etc., etc.
                return this.options.updateFeature(geojson, oldlayer);
            }
            else  
                return this;
        }

        // this is a new object
        else {

            // this is new data so create a layer from the geojson.  This will automatically call the pointToLayer function within our options.
            let layer = L.GeoJSON.geometryToLayer(geojson, this.options);

            // if unable to create a layer from the geojson, then return.
            if (!layer) {
                return this;
            }

            // Add this new feature to our list.
            this.addFeature(geojson, layer);

            // style vector layers
            if (layer.setStyle) 
                layer.setStyle(this.options.style(geojson));

            // call the onEachFeature function for styling, etc.
            this.options.onEachFeature(geojson, layer);

            // update the last feature with this geojson
            this._lastfeature = geojson;

            // add this new layer 
            return this.addLayer(layer);
        }

    }, // addData


    // compare geojson features.  returns true if the newjson represents duplicate data.
    isduplicate: function(newjson, oldjson) {

        // check inputs
        if (!newjson || !oldjson) 
            return false;

        // for point objects (i.e. APRS objects)
        if (newjson.geometry && newjson.geometry.type && newjson.geometry.type == "Point") {
            // timestamps from new and old JSON features
            let olddate = new Date(oldjson.properties.tm);
            let newdate = new Date(newjson.properties.tm);
            let timediff_secs = (newdate - olddate);

            // if this new data was heard < 10secs from the prior packet AND the "heardfrom" station was not "direct" AND the MD5 hashs between old & new are identical...
            // ...then we assume this is a duplicate packet and return.
            if (timediff_secs < 10000 && newjson.properties.heardfrom != "direct" && newjson.properties.hash == oldjson.properties.hash) 
                return true;
        }

        // for everything else we just return false as this appears to be new data
        return false;

    }, // isduplicate

    // normalize the geojson feature.  This is called by "addData" whenever data is added to this layer group to "fix up" items within the feature's properties or add new ones.
    _normalizeGeoJson: function(geojson) {

        // only look at those features that have properties 
        if (!geojson || !geojson.properties)
            return geojson;

        // where to store the updated feature
        let newgeojson = geojson;

        // if the existing feature's tm property doesn't exist, then check the "time" property, and failing that, just use the current time.
        if (!newgeojson.properties.tm) {

            // create the tm date object using the time string property instead
            if (newgeojson.properties.time) 
                newgeojson.properties.tm = new Date(Date.parse(newgeojson.properties.time));
            else 
                // fallback if there's no time available anywhere...we just use the current time
                newgeojson.properties.tm = new Date(Date.now());
        }

        // convert the tm property to be a Date object in the newgeojson, if not already
        if (!(newgeojson.properties.tm instanceof Date))  
            newgeojson.properties.tm = new Date(Date.parse(newgeojson.properties.tm));

        // create the time string property...if it doesn't already exist
        if (!newgeojson.properties.time) 
            newgeojson.properties.time = getISODateTimeString(newgeojson.properties.tm, true);

        // create an epoch seconds property that represents the receive time of this feature in the number of seconds since 1970.  This aids with time comparisons elsewhere.
        if (!newgeojson.properties.epoch) 
            newgeojson.properties.epoch = newgeojson.properties.tm.getTime() / 1000;

        return newgeojson;
    },


    // Return the feature (i.e. geojson) for this callsign
    getFeature: function(callsign) {
        return this._features[callsign] && this._features[callsign].feature;
    },

    // Return the entire list of features being tracked by this layer group
    getFeatureList: function() {
        return this._features;
    },

    // Return the Leaflet layer that represents the feature identified by the supplied callsign.
    getFeatureLayer: function(callsign) {
        return this._features[callsign] && this._features[callsign].layer;
    },

    // Add this feature to our list
    addFeature: function(feature, layer) {
        this._features[feature.properties.callsign] = { "feature": feature, "layer": layer };
    },

    // Remove a feature from this layer group 
    rmFeature: function(callsign) {
        if (callsign && this._features[callsign]) {
            this.removeLayer(this._features[callsign].layer);
            delete this._features[callsign];
        }
        return this;
    },

    // prune features from this layer group by comparing to a supplied "good list" of callsigns
    // returns the number of features removed
    pruneFeatures: function(callsignlist) {
        let i = 0;

        // sanity check
        if (!callsignlist)
            return 0;

        // Loop through the list of features we're maintaining, comparing each one to the callsignlist.
        // If the feature doesn't exist in the supplied callsignlist, then remove it from this layer group.
        for (f in this._features) {
            if (!callsignlist.find(callsign => callsign == f)) {
                this.rmFeature(f);
                i++;
            }
        }
        return i;
    },

    // prune features from this layer group by comparing the timestamp on features to a supplied cutoff age (in seconds)
    // returns the number of features removed
    pruneOldFeatures: function(cutoff) {
        let i = 0;

        // sanity check
        if (!cutoff || cutoff <= 0)
            return 0;

        // The current date/time
        let currenttime = Date.now() / 1000;

        // Loop through the list of features we're maintaining, comparing each one's age to the cutoff age (in seconds)
        // If the feature doesn't exist in the supplied callsignlist, then remove it from this layer group.
        for (f in this._features) {
            let epoch = this._features[f].feature.properties.epoch
            if (epoch && currenttime - epoch > cutoff) {
                this.rmFeature(f);
                i++;
            }
        }
        return i;
    },

    // get the last feature observed
    getLastFeature: function() {
        return this._lastfeature;
    }

});

// AprsStations factory function
function aprsStations(name, options) {
    return new AprsStations(name, options);
}


/*******************************************************
* FlightLayer class
*
* An extension of the GeoJSON class so we have a way to track which APRS stations are on the map, etc..
*
* By default it only keeps the latest packet heard for each station.
********************************************************/
let FlightLayer = AprsStations.extend({

    options: {
        // This will filter out geojson objects we don't want added.  It should return true/false.
        // By default, we're only interested in tracker, flight, or "My Location" packets.  All other stations we want to ignore.
        filter:  function(geojson) {

            // Determine what type of station this is
            let t = isTracker(geojson);
            let f = isFlight(geojson);
            let b = isBreadcrumb(geojson);
            let br = isBurst(geojson);
            let p = isFlightPath(geojson);
            let l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);

            // Check this callsign against the flightlist and trackerlist and "My Location"
            if (t || f || l || b || br || p)
                return true;

            // by default return false.
            return false;
        },

        // style function.  Only applies to Path's like lines and polygons.
        style:  function(geojson) {

            if (!geojson || !geojson.properties)
                return {};

            // default style (if all else fails, this is the color of vector layers).  For a Flight, this will be the color when "on the ground".
            let default_color = "gray";

            // get the color map
            let colormap = (getColorSet(geojson.properties.flightid) ? getColorSet(geojson.properties.flightid) : 
                { 
                    "ascending": { color : 'blue', markerColor: 'darkblue'},
                    "descending":{ color : 'gray', markerColor: 'darkgray'} 
                }
            );

            // the style
            style = { 
                color: (geojson.properties.ascending ? colormap.ascending.color : (geojson.properties.descending ? colormap.descending.color : default_color)),
                fillColor: (geojson.properties.ascending ? colormap.ascending.color : (geojson.properties.descending ? colormap.descending.color : default_color)),
                weight: 2,
                pane: "pathsPane"  // so that these lines/polygons are at the bottom of the z-ordered stack on the map
            };

            return style;
        }
    },

    // for checking duplicate packets for an indivdual beacon
    addToBeaconList: function(geojson) {

        // just in case
        if (!geojson || !geojson.properties || !geojson.properties.callsign)
            return false;

        // get this beacon's details
        let thisbeacon = this.options.beacons.find(a => a.callsign == geojson.properties.callsign);

        // return if we can't find one
        if (!thisbeacon)
            return false;

        // get time/date from a packet
        const gettime = function(p) {
            if (!p || !p.properties)
                return false;

            if (p.properties.raw)
                return getPacketTimestamp(p);
            else if (p.properties.tm)
                return new Date(p.properties.tm);
            else
                return false;
        };

        // sort this beacon's packets by date/time and save the results (array.sort method sorts "in place")
        let beaconlist = thisbeacon.packetlist;
        let lastfive;
        if (beaconlist) {
            beaconlist.sort((a, b) => gettime(a) - gettime(b));
            lastfive = beaconlist.slice(Math.max(beaconlist.length - 5, 0)).reverse();
        }

        // check the last several packets to make sure this isn't duplicate data
        for (p in lastfive) {
            if (this.isduplicate(lastfive[p], geojson))
                return false;
        }

        // add this geojson (i.e. packet) to the list of position packets for this beacon
        beaconlist.push(geojson);

        return true;
    },

    // used to compute x,y,z physics for a given geojson feature (i.e. an APRS packet from an individual beacon), 
    // and add those results to the overall physics array for this flight.  Called from addData method.
    computePhysics:  function(geojson) {
        
        // just in case
        if (!geojson || !geojson.properties || !geojson.properties.callsign || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point" || !geojson.geometry.coordinates) 
            return false;

        // which beacon list?
        let beacon = this.options.beacons.find(a => a.callsign == geojson.properties.callsign);
        if (!beacon)
            return false;

        // get time/date from a packet
        const gettime = function(p) {
            if (!p || !p.properties)
                return false;

            if (p.properties.raw)
                return getPacketTimestamp(p);
            else if (p.properties.tm)
                return new Date(p.properties.tm);
            else
                return false;
        };

        // default values, all 0's
        let x=0, xv=0, xa=0;
        let y=0, yv=0, ya=0;
        let z=0, zv=0, za=0;
        let timediff_secs=0;

        // get the last data point from this beacon and the time delta
        let lastpoint = beacon.physics[beacon.physics.length - 1];

        // last overall physics point (not necessarily from this same beacon).  Use this for launch, burst, and landing determination.
        let lastoverallpoint = this.options.flightphysics[this.options.flightphysics.length -1];

        // the date/timestamp from this incoming feature
        let thedate = gettime(geojson);

        // calculate the time delta between this geojson point and the lastpoint.
        if (lastpoint) {
            let olddate = lastpoint.tm;
            if (thedate) 
                timediff_secs = (thedate - olddate) / 1000;
        }

        // all of these values will default to 0 if the timediff_secs value is also 0.  timediff_secs will be 0 if this is the very first point we've encountered.
        // x-dimension (longitude).  Units are in degrees and /sec
        x = (geojson.geometry.coordinates[0] ? geojson.geometry.coordinates[0] * 1.0 : 0);
        xv = (timediff_secs ? (x - lastpoint.x) / timediff_secs : 0);
        xa = (timediff_secs ? (xv - lastpoint.x_velocity) / timediff_secs : 0);

        // y-dimension (latitude).  Units are in degrees and /sec
        y = (geojson.geometry.coordinates[1] ? geojson.geometry.coordinates[1] * 1.0 : 0);
        yv = (timediff_secs ? (y - lastpoint.y) / timediff_secs : 0);
        ya = (timediff_secs ? (yv - lastpoint.y_velocity) / timediff_secs : 0);

        // z-dimension (altitude).  Units are in ft and sec.
        z = (geojson.properties.altitude ? geojson.properties.altitude * 1.0 : 0);
        zv = (timediff_secs ? (z - lastpoint.z) / timediff_secs : 0);
        za = (timediff_secs ? (zv - lastpoint.z_velocity) / timediff_secs : 0);


        // if there was a last overall point, then we need determine if we've encountered a burst, launch, or touchdown condition
        let landing_encountered = false;
        if (lastoverallpoint) {

            // check if we've just encountered burst/cutdown
            if (!lastoverallpoint.burst && this.burst && this.burst.length == 0) {
                let burst = (z < lastoverallpoint.z && lastoverallpoint.z > 10000 && z > 10000 && zv < 0 ? true : false);

                // if true, then we've just experienced a burst event!
                if (burst) {

                    // update the last beacon physics point to indicate burst was true
                    //beacon.physics[beacon.physics.length - 1].burst = burst;
                    lastoverallpoint.burst = burst;

                    // this breadcrumb feature ID
                    let featureid = geojson.properties.flightid + "_" + lastpoint.id + "_breadcrumb";

                    // update the burst breadcrumb 
                    if (this._features[featureid] && this._features[featureid].feature && this._features[featureid].feature.properties && this._features[featureid].feature.properties.physics) {

                        // update the prior breadcrumb feature
                        this._features[featureid].feature.properties.physics.burst = burst;

                        // create a burst feature based off the last breadcrumb (i.e. the breadcrumb with the highest altitude)
                        let burst_geojson = this.createBurstFeature(this._features[featureid].feature);

                        // now add this new feature 
                        if (burst_geojson) {

                            // call underlying method to get this feature added to this layer as we don't need additional processing performed upon adding this synthetic point
                            let ret = AprsStations.prototype.addData.call(this, burst_geojson);
                        }
                    }

                    // add this burst object to the list we're tracking for each beacon
                    this.burst.push({callsign: geojson.properties.callsign, tm: gettime(geojson), altitude: lastoverallpoint.z, latitude: lastoverallpoint.y, longitude: lastoverallpoint.x, lastoverallpoint, geojson});
                    console.log("burst", {flightid: geojson.properties.flightid, callsign: geojson.properties.callsign, tm: gettime(geojson), altitude: lastoverallpoint.z, latitude: lastoverallpoint.y, longitude: lastoverallpoint.x, lastoverallpoint, geojson});
                }
            }


            // check if we've encountered a launch condition
            if (!lastoverallpoint.launch && this.launch && this.launch.length == 0) {

                // check if we've encountered a launch
                if (zv > 5 && z < 10000 && lastoverallpoint.z_velocity < 5 && lastoverallpoint.z_velocity != 0) {
                    this.launch.push({callsign: lastoverallpoint.source, tm: lastoverallpoint.tm, altitude: lastoverallpoint.z, latitude: lastoverallpoint.y, longitude: lastoverallpoint.x, lastpoint: lastoverallpoint, geojson});
                    console.log("launch", {flightid: geojson.properties.flightid, callsign: lastoverallpoint.source, tm: lastoverallpoint.tm, altitude: lastoverallpoint.z, latitude: lastoverallpoint.y, longitude: lastoverallpoint.x, lastpoint: lastoverallpoint, geojson});
                    lastoverallpoint.launch = true;
                }
            }

            // check if we've encountered a landing condition
            if (!lastoverallpoint.landing && this.landing && this.landing.length == 0) {

                // check if we've encountered a landing
                if (zv < 5 && zv > -5 && z < 10000 && lastoverallpoint.z_velocity < -5) {
                    this.landing.push({callsign: geojson.properties.callsign, tm: gettime(geojson), altitude: z, latitude: y, longitude: x, lastoverallpoint});
                    console.log("landing", {flightid: geojson.properties.flightid, callsign: geojson.properties.callsign, tm: gettime(geojson), altitude: z, latitude: y, longitude: x, lastoverallpoint});
                    landing_encountered = true;
                }
            }
        } // if (lastoverallpoint)


        // construct a new data point for this geojson
        let newpoint = {
            "tm" : thedate,  // this iwll be the 'packettime' if available otherwise will be the 'tm' time 
            "id": (this.options.flightphysics ? this.options.flightphysics.length : 0),
            "source": geojson.properties.callsign, 
            "delta": timediff_secs,
            "x": x,
            "x_velocity": xv,
            "x_acceleration": xa,
            "y": y,
            "y_velocity": yv,
            "y_acceleration": ya,
            "z": z,
            "z_velocity": zv,
            "z_acceleration": za,
            "burst": false,
            "launch": false,
            "landing": landing_encountered,

            // include these values as it might be useful for presentation purposes
            "speed_mph": geojson.properties.speed_mph,
            "altitude": geojson.properties.altitude,
            "bearing": geojson.properties.bearing,
            "raw": geojson.properties.raw
        };

        // If the physics array doesn't exist, then create a blank one.   This is used to hold various physical telemetry from the beacon
        if (!beacon.physics) 
            beacon["physics"] = [];

        // Add this data point to the individual array for this beacon and sort it
        beacon.physics.push(newpoint);
        beacon.physics.sort((a, b) => a.tm - b.tm);

        // if the overall physics array for the flight doesn't exist, then create it.
        if (!this.options.flightphysics)
            this.options["flightphysics"] = [];

        // Add this data point to the overall array for this flight and sort it
        this.options.flightphysics.push(newpoint);
        this.options.flightphysics.sort((a, b) => a.tm - b.tm);

        // find max altitude point within the flightphysics array
        const max_altitude = this.options.flightphysics.reduce((acc, obj) => Math.max(acc, obj.z), -Infinity);
        const max_altitude_index = this.options.flightphysics.findIndex(a => a.z == max_altitude);

        // ascending linestring
        if (this.options.flightphysics.length > 0) 
            this.options.ascending_linestring = this.options.flightphysics.slice(0,max_altitude_index+1).map(a => [a.x, a.y]);
        else 
            this.options.ascending_linestring = [];

        // descending linestring
        // we need to add the prior data point to the beginning of the descending array so the linestring will "start" as the last ascending data point.
        if (max_altitude_index < this.options.flightphysics.length)
            this.options.descending_linestring = this.options.flightphysics.slice(max_altitude_index).map((a) => [a.x, a.y]);
        else 
            this.options.descending_linestring = [];

        return newpoint;
    }, // computePhysics


    // used to create a burst object (geojson).  
    createBurstFeature: function (geojson) {
        // we need an object to start from.
        if (!geojson)
            return false;

        // the new burst feature
        let feature = geojson;

        // Adjust the callsign
        feature.properties.callsign = geojson.properties.flightid + "_burst";

        // set the object type
        feature.properties.objecttype = "burst";

        // set the label, tooltip, comment text fields
        feature.properties.comment = "Approximate Burst";

        // burst
        feature.properties.burst = true;

        // symbol
        feature.properties.symbol = "/n";

        return feature;

    }, // createBurstFeature


    // this will reform some of the elements of this feature to so that a single "flight" feature is tracked (on the map).
    reformGeoJson: function(geojson) {

        // just in case
        if (!geojson || !geojson.properties)
            return false;

        // check if this callsign is in our beacon list.  If it is, then we rename the callsign for this feature to be the flight name.
        //let isbeacon = this.options.beacons[geojson.properties.callsign];
        let isbeacon = this.options.beacons.find(a => a.callsign == geojson.properties.callsign);
        let newjson = structuredClone(geojson);
        //let newjson = geojson;
        if (isbeacon) {
            newjson.properties.callsign = isbeacon.flightid;
            newjson.properties.flightid = isbeacon.flightid;
            newjson.properties.beacon = geojson.properties.callsign;
        }

        return newjson;
    },


    // override the parent AddData function so we can handle packets from beacons on this flight
    addData: function(geojson) {

        // Adjust the "callsign" for this geojson feature so that it represents a single "flight" and not multiple beacons on the map
        let reformed = this.reformGeoJson(geojson);

        // make sure the incoming geojson also has its flightid property set...as this is the geojson that is used for adding beacons to the beaconlist.
        if (geojson.properties)
            geojson.properties.flightid = reformed.properties.flightid;

        // call underlying method to get this feature added to this layer.
        let layer = AprsStations.prototype.addData.call(this, reformed);

        // add this packet to the list for each beacon.  If successful, then compute the physics for this most recent packet.
        if (layer && this.addToBeaconList(geojson)) {

            // update the physics lists for beacons and the flight overall.  
            let latestpoint = this.computePhysics(geojson); 

            // Add the computed physics to this feature's geojson...for downstream uses...but only if it is an actual "beacon" feature
            if (this._features[reformed.properties.callsign] && this._features[reformed.properties.callsign].feature.properties && latestpoint)  
                this._features[reformed.properties.callsign].feature.properties.physics = latestpoint;

            // get the list of paths, breadcrumbs, and other synthetic objects for this flight and add them to this layer.
            AprsStations.prototype.addData.call(this, this.updatePaths(latestpoint));
        }

        return layer;
    }, // addData

    

    // function to create the geojson that represents the paths a flight has taken (ex. ascent, descent).  It accepts an array of "physics point" objects that represent 
    // the x,y,z location the flight has taken.
    updatePaths: function(latestpoint) {

        // sanity check (we check this because we only want to go to the trouble of updating the path IF the path has actually changed)
        if (!latestpoint)
            return false;

        // helper function to create geojson feature for a "path"
        const createPathFeature = function(fid, name, coords) {
            if (!coords || coords.length == 0)
                return false;

            return {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": (coords ? coords : [])
                },
                "properties": {
                    "flightid": fid,
                    "tm": new Date(Date.now()),
                    "callsign":  fid + "_" + name + "_path",
                    "ascending": (name == "ascent" ? true : false),
                    "descending": (name == "descent" ? true : false),
                    "objecttype": name + "_path"
                }
            };
        };

        // helper function to create the geojson point feature that serves as the breadcrumb within the flight path (on the map)
        const createBreadcrumb = function(fid, physicspoint) {
            if (!physicspoint)
                return false;

            return {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [physicspoint.x, physicspoint.y]
                },
                "properties": {
                    "flightid": fid,
                    "tm": physicspoint.tm,
                    "physics": physicspoint,
                    "callsign":  fid + "_" + physicspoint.id + "_breadcrumb",
                    "ascending": isAscending(physicspoint.z, physicspoint.z_velocity),
                    "descending": isDescending(physicspoint.z, physicspoint.z_velocity),
                    "objecttype": name + "breadcrumb",
                    "speed_mph": physicspoint.speed_mph,
                    "altitude": physicspoint.altitude,
                    "bearing": physicspoint.bearing,
                    "beacon": physicspoint.source
                }
            };
        };


        // helper function to create a geojson feature collection from an array of features
        const createFeatureCollection = function(features) {
            return {
                "type": "FeatureCollection",
                "features": (features ? features : [])
            };
        };

        // our list of features
        let features = [];

        // create the ascent and descent features
        let ascentFeature = createPathFeature(this.name, "ascent", this.options.ascending_linestring);
        let descentFeature = createPathFeature(this.name, "descent", this.options.descending_linestring);
        if (ascentFeature)
            features.push(ascentFeature);
        if (descentFeature)
            features.push(descentFeature);

        // breadcrumb features
        for (i in this.options.flightphysics) 
            features.push(createBreadcrumb(this.name, this.options.flightphysics[i]));

        // if we have some features, the bundle them into a FeatureCollection and return
        if (features.length > 0)
            return createFeatureCollection(features);
        else
            return false;
        
    }, // updatePaths


    // create a landing prediction feature
    //
    // returns:  a FeatureCollection w/ all the features needed for the landing prediction
    createLandingPrediction: function() {

        let beacons = this.options.beacons;
        let b;

        // loop through each beacon's physics points
        for (b in beacons) {

            let physicspoints = beacons[b].physics;



        }



    } // createLandingPrediction

});


// This runs immediately after the base class initialize function.
FlightLayer.addInitHook(function() {

    // setup packet buckets for each beacon on this flight
    let beacons = this.options.beacons;
    let b;
    for (b in beacons) {

        // create a list to store packets from each beacon
        beacons[b]["packetlist"] = [];

        // store individual beacon computed physics here (ex. timestamp, altitude, velocity, acceleration, etc.)
        beacons[b]["physics"] = [];
    }

    // store the consolidated flight telemetry data here (ex. timestamp, altitude, velocity, acceleration, etc.)
    this.options["flightphysics"] = [];

    // set this flight's color set for ascent, descent, etc. paths and breadcrumbs
    initializeColorSet(this.name);

    // burst has yet to be encountered.
    this.burst = [];
    this.landing = [];
    this.launch = [];

});


// FlightLayer factory function
function flightLayer(name, options) {
    return new FlightLayer(name, options);
}




// take a raw APRS packet and extract the timestamp if present
function getPacketTimestamp(packet) {

    if (!packet || !packet.properties || !packet.properties.raw) 
        return null;

    // example position packet:  KC0D-14>APZEOS,EOSS,WIDE2-1,qAO,N0NDM-6:/122130h4013.60N/10404.68WO000/000/A=004553 203T8619P 'EOSS Balloon'
    // example object packet: N2XGL-6>APRARX,TCPIP*,qAC,T2SJC:;RSONDE-CR*012152h4....

    // Split off the information part of the packet
    let raw = packet.properties.raw;
    let info = raw.split(":").slice(1).join();
    let datetime = null;
    if (info) {


        // position packets with a timestamp (always in UTC time)
        if (info[0] == "/") {
            let h_char = info.search("h");
            if (h_char) {
                let timestring = info.substring(1, h_char).replace(/(.{2})/g,"$1:").split(":");

                // current datetime
                datetime = new Date(Date.now());

                // offset from UTC/GMT/zulu
                let offset = datetime.getHours() - datetime.getUTCHours(); 

                datetime.setHours(timestring[0] * 1.0 + offset);
                datetime.setMinutes(timestring[1] * 1.0);
                datetime.setSeconds(timestring[2] * 1.0);
                datetime.setMilliseconds(0);
            }
        }

        // object packets with a timestamp (always in UTC time)
        else if (info[0] == ";") {
            let star_char = info.search("\\*");
            let h_char = info.search("h");
            if (h_char) {
                let timestring = info.substring(star_char + 1, h_char).replace(/(.{2})/g,"$1:").split(":");

                // current datetime
                datetime = new Date(Date.now());

                // offset from UTC/GMT/zulu
                let offset = datetime.getHours() - datetime.getUTCHours(); 

                datetime.setHours(timestring[0] * 1.0 + offset);
                datetime.setMinutes(timestring[1] * 1.0);
                datetime.setSeconds(timestring[2] * 1.0);
                datetime.setMilliseconds(0);
            }
        }
    }

    return datetime;
}

// this will determine the PNG filename that represents this APRS symbol and it's correct rotation (to reflect its current bearing).
function getFilenameAndRotation(geojson) {

    // was a APRS symbol provided?
    if (geojson.properties.symbol) {

        // Determine the file path to the PNG icon that represents this symbol
        let filename = null;

        // by default we don't rotate the icon
        let rotation = 0;

        // check the symbol and determine the correct PNG filename that represents this APRS symbol
        if (geojson.properties.symbol.startsWith('\\') || geojson.properties.symbol.startsWith('\/') || geojson.properties.symbol.startsWith('1x')) 
            filename = "/images/aprs/" + symbols[geojson.properties.symbol].tocall + ".png";                
        else 
            filename = "/images/aprs/" + geojson.properties.symbol.charAt(0) + "-" + symbols["\\" + geojson.properties.symbol.charAt(1)].tocall + ".png";

        // Determine if a bearing was provided ...AND... this symbol is one that we "should" rotate (ex. it's a vehicle, etc.)
        if (typeof(geojson.properties.bearing) != "undefined" && typeof(symbolRotation[geojson.properties.symbol.charAt(1)]) != "undefined") {
            let clear_to_rotate = false;

            // Is this is an alternate APRS symbol?
            if (geojson.properties.symbol.charAt(0) == "\\" || geojson.properties.symbol.match(/^[0-9a-zA-Z]/)) {
                if (symbolRotation[geojson.properties.symbol.charAt(1)].alternate == "true")
                    clear_to_rotate = true;
            }
            else
                clear_to_rotate = true;

             
            // If this is a rotatable symbol (ex. a vehicle, etc.) then proceed to calculate the rotation
            if (clear_to_rotate) {
                 
                // Calculate the amount of rotation needed given the individual icon's "starting" orientation (ex. most vehicle icons point to 90degs).
                rotation = (geojson.properties.bearing * 10 / 10) - (symbolRotation[geojson.properties.symbol.charAt(1)].degrees * 10 / 10);

                // If the rotation is far enough, then we need to flip the symbol so that it appears "right side up".
                if (symbolRotation[geojson.properties.symbol.charAt(1)].flip == "true" && (geojson.properties.bearing * 10 / 10) > 180) {
                    filename = filename.split(".")[0] + "-flip.png";
                    rotation = symbolRotation[geojson.properties.symbol.charAt(1)].degrees * 10 / 10;
                    rotation = (geojson.properties.bearing * 10 / 10) - (rotation > 180 ? rotation - 180 : rotation + 180);
                }
            }
        }

        // return the filename and rotation for this APRS object
        return { "filename": filename, "rotation": rotation};
    }

    // Could not determine filename or rotation
    return null;

} // getFilenameAndRotation


// this will update/rotate the icon displayed for a given APRS object (i.e. layer on the map).
function updateIcon(geojson, layer) {

    if (!geojson || !layer)
        return null;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // An iconsize of 24px is about optimal.
    let iconsize = 24;

    // determine the icon center
    let iconsize_center = Math.trunc(iconsize/2);

    // Place the anchor point for the tooltip just a smidge lower, vertically, than center.  (i.e. the label underneath the icon)
    let tipanchor = iconsize_center + 10;

    // get the appropriate filename for the PNG and any appropriate rotation
    let file_and_rotation = getFilenameAndRotation(geojson);

    // Create a new icon (we do this because the APRS station might have changed it's symbol)
    // ...but only if there is a valid filename/symbol for this station.  Otherwise, we don't create a custom icon for this layer.
    if (file_and_rotation) {
        let myIcon = L.icon({
            iconUrl: file_and_rotation.filename,
            iconSize: [iconsize, iconsize],
            iconAnchor: [iconsize_center, iconsize_center], 
            popupAnchor: [0, -iconsize_center],
            tooltipAnchor: [0, tipanchor]
        }); 

        // Set the icon for this layer to the one we just created
        layer.setIcon(myIcon);

        // Change the rotation angle of the icon used by this marker.
        layer.setRotationAngle(file_and_rotation.rotation);
        layer.setRotationOrigin("center center");
    }
    else if (layer instanceof L.CircleMarker) {
        if (geojson.properties.style && geojson.properties.style.radius) 
            layer.setRadius(geojson.properties.style.radius);
        if (style && geojson.properties.style && geojson.properties.style.fillcolor) 
            layer.setStyle({ fillcolor: geojson.properties.style.fillcolor});
    }

    return layer;

} // updateIcon


// helper function to update an existing or bind a new popup to this layer
function popup(content, l) {
    let existing = l.getPopup();

    if (existing)
        l.setPopupContent(content, { className: 'myPopupStyle' });
    else 
        l.bindPopup(content, {className:  'myPopupStyle'} );
    return l.getPopup();
};

// helper function to update an existing or create a new tooltip for this layer (i.e. label underneath object)
//function tooltip(label, l, offset, style) {
function tooltip(options) {

    if (options.layer && options.label) {

        // if there's already a tooltip on this layer, then update the label and offset
        if (options.layer.getTooltip())
            options.layer.setTooltipContent(options.label, (options.offset ? options.offset : L.point(0,0)));

        // no tooltip?  Create a new one and attached it to the layer
        else
            options.layer.bindTooltip(options.label, { 
                className:  (options.style ? options.style : "myTooltipLabelStyle"), 
                permanent:true, 
                direction: "center", 
                opacity: .9, 
                offset: (options.offset ? options.offset : L.point(0,0)),
                pane: (options.pane ? options.pane : "otherTooltipPane")
            }).openTooltip();

        return options.layer.getTooltip();
    }

    return null;
}


// This is the primary function for creating/updating an APRS objects's popup, label (aka tooltip).  It will call various "helper" functions to create HTML
// content from a geojson feature's properties based on the type of APRS object (ex. balloon, vehicle, breadcrumb, etc.).
function updateAprsObject(geojson, layer) {

    // sanity check...
    if (!geojson || !layer)
        return null;

    // check objects
    if (!geojson.properties.callsign || !geojson.geometry || !geojson.geometry.type)
        return null;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // we only want to update the popup and tooltip content for POINT objects.
    if (geojson.geometry.type && geojson.geometry.type == "Point") {

        // check what sort of object this is and call the appropriate content generator
        if (isFlight(geojson)) {
            popup(stationPopup(geojson), layer);
            let l = tooltip({layer: layer, label: stationTooltip(geojson), offset: L.point(0, 7), style: "flightTooltipLabelStyle", pane: "flightTooltipPane"});
        }
        else if (isTracker(geojson)) {
            popup(stationPopup(geojson), layer);
            let l = tooltip({layer: layer, label: stationTooltip(geojson)});
        }
        else if (isBurst(geojson)) {

            // double check that this feature is the burst location
            if (geojson.properties.physics && geojson.properties.physics.burst == true) {
                popup(breadcrumbPopup(geojson), layer);
                let l = tooltip({
                    layer: layer, 
                    label: stationTooltip(geojson), 
                    offset: L.point(0, 5)
                    //style: "burstBreadcrumbStyle"
                });
            }
            else 
                popup(breadcrumbPopup(geojson), layer);
        }
        else if (isBreadcrumb(geojson)) {
            popup(breadcrumbPopup(geojson), layer);
        }
        else if (isMyLocation(geojson)) {
            popup(stationPopup(geojson), layer);
        }
        else {
            // everything else
            popup(stationPopup(geojson), layer);
            tooltip({layer: layer, label: stationTooltip(geojson)});
        }
    }

    // otherwise return nothing
    return layer;

} // updateAprsObject


// create the html popup content for breadcrumbs within a flight's path.
function breadcrumbPopup(geojson) {

    if (!geojson || !geojson.properties)
        return false;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // is this the burst object
    let isburstObject = callsign.endsWith("_burst") && geojson.properties.physics && geojson.properties.physics.burst == true;

    // check if this is the burst breadcrumb/object
    if (isburstObject)
        callsign = geojson.properties.flightid + " Burst";

    // example json of a breadcrumb
    //{
    //    "type": "Feature",
    //    "geometry": {
    //    "type": "Point",
    //    "coordinates": [physicspoint.x, physicspoint.y]
    //},
    //    "properties": {
    //    "flightid": fid,
    //    "tm": physicspoint.tm,
    //    "point": physicspoint,
    //    "callsign":  fid + "_" + physicspoint.id + "_breadcrumb",
    //    "ascending": isAscending(physicspoint.z, physicspoint.z_velocity),
    //    "descending": isDescending(physicspoint.z, physicspoint.z_velocity),
    //    "objecttype": name + "breadcrumb"
    //}


    // Example of json from a physicspoint
    //{
    //    "tm" : packettime,
    //    "id": (this.options.flightphysics ? this.options.flightphysics.length : 0),
    //    "source": geojson.properties.callsign, 
    //    "delta": timediff_secs,
    //    "x": x,
    //    "x_velocity": xv,
    //    "x_acceleration": xa,
    //    "y": y,
    //    "y_velocity": yv,
    //    "y_acceleration": ya,
    //    "z": z,
    //    "z_velocity": zv,
    //    "z_acceleration": za
    //}
    
    // the flight name
    let fid = (typeof(geojson.properties.flightid) != "undefined" ? geojson.properties.flightid : "breadcrumb");

    // The time
    let thetime = new Date(geojson.properties.tm);
    let timestring;
    if (thetime) 
        // if we're able to decode the time string into an actual Date object then construct a 24hr time representation.
        timestring = thetime.toLocaleTimeString("en-us", {hour12: false});

    // The HTML string for the popup content.
    let html = "<table style=\"margin:0; padding:0;\"><tr>";
    html += "<td style=\"text-align: left; margin:0; padding:0; white-space: nowrap;\"><strong>" + (isburstObject ? callsign : fid) + "</strong></td>";

    // build the rest of the HTML string
    html += (timestring ? "<td style=\"text-align: right; margin:0; padding:0; white-space: nowrap;\">" + timestring + "</td>" : "</td>&nbsp;</td>");
    html += "</tr>";

    // The comment (only if this is a burst object)
    if (isburstObject) {
        const comment = (typeof(geojson.properties.comment) == "undefined" ? "" : (geojson.properties.comment != "" ? "<tr><td colspan=2 style=\"margin:0; padding:0;\" class=\"commentstyle\">" + geojson.properties.comment + "</td></tr>" : ""));

        html += comment;
    }

    // the speed, bearing, altitude
    html += createSpeedHTML(geojson);

    // telemetry info (beacon, vertical rate, etc.)
    html += createTelemetryHTML(geojson);

    // the lat/lon HTML string
    html += createCoordsHTML(geojson);
    html += "</table>";

    return html;

}


// this is a helper function to create the html for the popup content for an individual feature based on its geojson.properties.xxx values.  This should be called
// for "regular" APRS stations (ex. vehicles, objects, etc.).  
function stationPopup(geojson) {

    if (!geojson || !geojson.properties)
        return false;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // start of our HTML for this station's popup
    let html = "<table style=\"margin:0; padding:0;\"><tr>";
    html += "<td style=\"padding:0; margin:0; white-space: nowrap; text-align: left;\"><a target=\"_blank\" href=\"testmap.php" +
        "?followfeatureid=" + callsign +
        "&latitude=" + geojson.geometry.coordinates[1] +
        "&longitude=" + geojson.geometry.coordinates[0] +
        "&zoom=" + map.getZoom() +
        "&showallstations=1\">" +
        "<strong>" + callsign + "</strong></a></td>";



    //------------------ fix up the receive time of the geojson packet -------------
    // time variables
    let thetime;
    let timestring = "";

    // first check for the "time" property
    if (geojson.properties.time) {
        thetime = new Date(Date.parse(geojson.properties.time));
    }

    // fallback to the "tm" property
    else if (geojson.properties.tm) {
        thetime = new Date(Date.parse(geojson.properties.tm));
        geojson.properties.time = getISODateTimeString(thetime, true);
    } 

    // failing both of those, we don't have any timestamp to display in the popup?
    else {
        thetime = null;
    }

    // if we were able to decode the time string into an actual Date object, then construct a 24hr time representation.
    if (thetime) 
        timestring = thetime.toLocaleTimeString("en-us", {hour12: false});

    //------------------ end:  fix up the receive time of the geojson packet -------------
    
    // build the rest of the HTML string
    html += (timestring ? "<td style=\"margin: 0; padding:0; text-align: right; white-space: nowrap;\">" + timestring + "</td>" : "<td>&nbsp;</td>");
    html += "</tr>";

    // The comment
    const comment = (typeof(geojson.properties.comment) == "undefined" ? "" : (geojson.properties.comment != "" ? "<tr><td colspan=2 style=\"margin:0; padding:0;\" class=\"commentstyle\">" + geojson.properties.comment + "</td></tr>" : ""));

    html += comment;

    // flight telemetry (should return null if not available or this isn't a flight)
    const telemetry = createTelemetryHTML(geojson);
    html += telemetry;

    // the speed, bearing, altitude
    const speed = createSpeedHTML(geojson);
    html += speed;

    // the frequency and where packet was heard from
    const heardfrom = createHeardfromHTML(geojson);
    html += heardfrom;

    // the lat/lon HTML string
    const coords = createCoordsHTML(geojson);
    html += coords;

    // closing div
    html += "</table>";

    // return the html
    return html;

} // createStationPopupContent


// This will create the tooltip (ex. label underneath the marker on the map) with the supplied geojson
function stationTooltip(geojson) {

    // sanity check...
    if (!geojson)
        return false;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // display different content for trackers and flights
    // ...
    // ...

    // if there isn't a callsign we can't add a label under the this object's icon.  If the callsign is "My Location", then we return as 
    // we don't want any sort of label under a user's 'blue dot' that identifies their location.  
    if (!callsign || callsign == "My Location") 
        return null;

    // the tool tip content.  By default it only consists of the station's callsign.
    let content = callsign;

    // is this a tracker?
    let t = isTracker(geojson);
    if (t) 
        content = t.tactical.toUpperCase();

    // is this a flight beacon?
    let f = isFlight(geojson);
    if (f) 
        content = callsign + (geojson.properties.altitude && geojson.properties.altitude > 0 ? "<br>" + Math.round(geojson.properties.altitude * 1.0).toLocaleString() + "ft" : "");

    // is this the burst location breadcrumb?
    let b = isBreadcrumb(geojson);

    if (isBurst(geojson) && geojson.properties.physics && geojson.properties.physics.burst == true)
        content = "Burst<br>" + Math.round(geojson.properties.altitude * 1.0).toLocaleString() + "ft";

    return content;
} // updateTooltipContent




/***********
* setupMap function
*
* This function creates the map. 
***********/
function setupMap() {

    // Create a map object. 
    map = new L.Map('map', {
        preferCanvas:  true,
        zoomControl: false,
        minZoom: 1,
        maxZoom: 19 
    });

    // Set the center of the map and starting zoom level
    map.setView(new L.latLng(starting_location.lat, starting_location.lon), starting_location.zoom);

    /**************** zoom level display box ****************/
    // Create a small box in the top right hand corner to display the map zoom level
    //let zoomLevelBox = L.control.gpsbox().addTo(map);
    //zoomLevelBox.show("Zoom Level: " + map.getZoom());

    // change the text within the top lefthand box with the zoom level everytime it changes
    //map.on('zoomend', function(ev) {
    //    if (zoomLevelBox) {
    //        zoomLevelBox.show("Zoom Level: " + map.getZoom());
    //    }
    //});
    /********************************************************/

    // create the various z-level panes
    createMapPanes();

    // Add a GeoJSON layer to hold heard stations (this is the catchall).  This is not added to the map at startup.
    stations = aprsStations("stations");

    // Add a GeoJSON layer to hold tracker stations (regardless of what flight they might be assigned)
    trackers = aprsStations("trackers").addTo(map);

    // Add a GeoJSON layer for the end user's position
    mylocation = aprsStations("mylocation").addTo(map);

    // The GPS/Location status box 
    gpsstatusbox = L.control.gpsbox({ mylocation: mylocation }).addTo(map);

    /************************ layer selection control ***********/
    // Overlay layers
    let overlays = { "My Location": mylocation, "Other Stations": stations, "Trackers": trackers };

    // Add the layer control to the map
    layercontrol = L.control.layers({}, overlays).addTo(map);
    /********************************************************/

    // Add a zoom control to the map.  We do this last so that it's below the other controls in the top righthand corner of the map.:w
    let zoom = L.control.zoom({ "position": "topright" }).addTo(map);

    // load base map
    loadBaseMap({"name": "OSM Liberty", "tileurl": "/tileserver/osm-liberty/style.json", "addtomap": true, "layercontrol": layercontrol});

    // This fixes the layer control such that when used on a touchable device (phone/tablet) that it will scroll if there are a lot of layers.
    if (!L.Browser.touch) {
        L.DomEvent
        .disableClickPropagation(layercontrol._container)
        .disableScrollPropagation(layercontrol._container);
    } 
    else {
        L.DomEvent.disableClickPropagation(layercontrol._container);
    }

    return map;
}


/***********
* createMapPanes
*
* create the various z-level panes on the map.  This helps with z-ordering the various objects on the map so that less important icons/labels don't overlap, on top of something important (ex. like the flight).
***********/
function createMapPanes() {

    if (map) {

        // Pane for all flight Tooltips
        let flightTooltipPane = map.createPane("flightTooltipPane");

        // Pane for all non-flight tooltips, to put them underneath regular tooltips
        let otherTooltipPane = map.createPane("otherTooltipPane");

        // Pane for all flights, to put them at the top of the z-order
        let flightPane = map.createPane("flightPane");

        // Pane for all landing predictions
        let landingPredictionPane = map.createPane("landingPredictionPane");

        // Pane for all other stations, to put them underneath regular markers/objects
        let otherStationsPane = map.createPane("otherStationsPane");

        // Pane for all non-flight tooltips, to put them underneath regular tooltips.  All L.circleMarker's go here.
        let breadcrumbPane = map.createPane("breadcrumbPane");

        // Pane for all tracks, to put them at the bottom of the z-order.  All paths, lines, polygons go here.
        let pathsPane = map.createPane("pathsPane");

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
}

/************
 * getMapPane
 *
 * Tries to determine the correct z-order map pane for a given geojson feature
 ***********/
function getMapPane(geojson) {

    if (!geojson)
        return null;

    // Determine what type of station this is
    let f = isFlight(geojson);
    let t = isTracker(geojson);
    let b = isBreadcrumb(geojson);
    let br = isBurst(geojson);
    let p = isFlightPath(geojson);
    let lp = isLandingPrediction(geojson);
    let l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);

    // return appropriate pane
    if (f)
        return "flightPane";
    else if (lp)
        return "landingPredictionPane";
    else if (b || br)
        return "breadcrumbPane";
    else
        return "otherStationsPane";
}


/***********
* loadBaseMap
*
* load a basemap layer.  If the 'addtomap' option is 'true', then add this layer to the map.
***********/
async function loadBaseMap(options) {

    // fetch the backend tileurl JSON and adjust the hostname therein to be this system's hostname
    try {
        // fetch the backend tileurl JSON
        const response = await fetch(options.tileurl);
        const d = await response.json();

        const myname = options.name;
        const add = options.addtomap;
        const layercontrol = options.layercontrol;

        // get this system's current hostname
        const myhostname = window.location.hostname;

        // update the hostname within the tileURL of for the map styling
        if (d.sources)
            if (d.sources.openmaptiles)
                if (d.sources.openmaptiles.url) {
                    const url = new URL(d.sources.openmaptiles.url);
                    d.sources.openmaptiles.url = d.sources.openmaptiles.url.replace(url.hostname, myhostname);
                }
        if (d.sprite) {
            const url = new URL(d.sprite);
            d.sprite = d.sprite.replace(url.hostname, myhostname);
        }

        if (d.glyphs) {
            const url = new URL(d.glyphs);
            d.glyphs = d.glyphs.replace(url.hostname, myhostname);
        }

        let mapstyle = d;
        let basemap = L.maplibreGL({
            style: mapstyle,
            attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
        });

        layercontrol.addBaseLayer(basemap, myname);
        if (add)
            basemap.addTo(map);

    } catch (error) {
        console.log({"function": "loadBaseMap", "error": error});
        return false;
    }

    return true;
}


/************
 * isRFPacket
 *
 * Tries to determine if this geojson packet was heard via an RF device (i.e. an actual radio or SDR).
 ***********/
function isRFPacket(geojson) {

    // if there was a source indicated within the geojson
    if (typeof(geojson.properties.source) != "undefined") {

        // if the source is 'direwolf' or 'ka9q-radio' then return true.  These are the only cases including when using an external radio (as that uses direwolf).
        if (geojson.properties.source == "direwolf" || geojson.properties.source == "ka9q-radio") 
            return true;
    }

    return false;
}


/***********
* isBreadcrumb
*
* This will check the incoming geojson.properties.callsign for a substring, 'breadcrumb'.
* returns the tracker json if this callsign represents a tracker, otherwise false/null/undefined.
***********/
function isBreadcrumb(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    let result = geojson.properties.callsign.indexOf("breadcrumb") !== -1;
    return (result ? geojson : false);
}

/***********
* isMyLocation
*
* This will check the incoming geojson.properties.callsign for a substring, 'My Location"
* returns the json if this callsign represents a the location of the end user.
***********/
function isMyLocation(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    let result = geojson.properties.callsign.indexOf("My Location") !== -1;
    return (result ? geojson : false);
}

/***********
* isLandingPrediction
*
* This will check the incoming geojson.properties.callsign for a substring, '_prediction'
***********/
function isLandingPrediction(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    let result = geojson.properties.callsign.indexOf("_prediction") !== -1;
    return (result ? geojson : false);
}

/***********
* isFlightPath
*
* This will check the incoming geojson.properties.callsign for a substring, '_path'.
***********/
function isFlightPath(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    let result = geojson.properties.callsign.indexOf("_path") !== -1;
    return (result ? geojson : false);
}


/***********
* isTracker
*
* This will compare the incoming geojson.properties.callsign against the trackerlist global.
* returns the tracker json if this callsign represents a tracker, otherwise false/null/undefined.
***********/
function isTracker(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    // split out the incoming callsign from its SSID (ex. call-XX)
    let pieces = geojson.properties.callsign.split("-");
    let callsign = pieces[0];
    let ssid = (pieces[1] ? pieces[1] : null);

    if (trackerslist)
        return (trackerslist[geojson.properties.callsign] ? trackerslist[geojson.properties.callsign]  : (trackerslist[callsign] ? trackerslist[callsign] : false));
    else
        return false;
}


/***********
* isBurst
*
* This will compare the incoming geojson.properties.callsign against the flightlist global to determine if this is a burst object.
* returns the flight json if this callsign represents a burst object, otherwise false/null/undefined.
***********/
function isBurst(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    // cycle through the list of flights to determine if this packet belongs to a flight
    let f;
    for (f in flightlist) {

        // if the callsign is the name of the flight with "_burst" appended
        if (f + "_burst" == geojson.properties.callsign) 
            return true;
    }
    return false;
}



/***********
* isFlight
*
* This will compare the incoming geojson.properties.callsign against the flightlist global.
* returns the flight json if this callsign represents a flight, otherwise false/null/undefined.
***********/
function isFlight(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson || !geojson.properties || !geojson.properties.callsign)
        return false;

    // cycle through the list of flights to determine if this packet belongs to a flight
    let f;
    for (f in flightlist) {

        // if the callsign is the name of the flight
        if (f == geojson.properties.callsign)
            return true;

        // now loop through each callsign (i.e. beacon) assigned to this flight comparing it to our test case
        let c;
        for (c in flightlist[f].beacons) {
            const beacon_callsign = flightlist[f].beacons[c].callsign;
            if (beacon_callsign == geojson.properties.callsign) {
                return flightlist[f];
            }
        }
    }
    return false;
}


/***********
* packetRouter
*
* This function returns the correct GeoJSON layer that a packet should be added too
***********/
function packetRouter(p) {
    let defaultlayer = stations;

    // defaults
    let dist = 0;  // distance miles between packets
    let timedelta = 0; // seconds between timestamps

    // check if this station is in the flight list or is a tracker "assigned" to a flight (i.e. not "At Large")
    if (p.properties.callsign) {

        // if this is a tracker station then return the 'stations' layer
        if (isTracker(p)) 
            return trackers;

        // which flight layer does this packet belong..if any?
        let l = isFlight(p);
        if (l) 
            return l.layer;
    }

    // For everything else we return the 'stations' layer
    return defaultlayer;
}   



/************
 * create the handler function for use with SSE to listen for gpsstatus events from the backend system
 *
*************/
function createGPSHandler() {

    // GPS handler function
    let gpshandler = function(event) {
        let gpsjson;

        // Parse the incoming json
        try { gpsjson = JSON.parse(event.data);}
        catch (e) {
            console.log({"what": "GPS JSON parse error", "event": event, "error": e.message, "gpsjson": gpsjson});
            return;
        }

        // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
        if (gpsjson && gpsjson.features && gpsjson.features[0].properties && gpsjson.features[0].geometry) {

            // get the fix value from the GPS
            let fix = gpsjson.features[0].properties.gps.mode;
            if (typeof(fix) != "undefined" && gpsstatusbox)
                gpsstatusbox.setGPSStatus(fix * 1.0);

            // we don't add "my location" to the map if the coordinates (lat, lon) are zero
            // ...having a latitude or longitude coordinate by == 0 usually means something was wrong with the GPS receiver.
            let coords = gpsjson.features[0].geometry.coordinates;
            if (coords && coords[0] != 0 && coords[1] != 0) {

                var ts = new Date(gpsjson.features[0].properties.time);
                var tmstring = getISODateTimeString(ts);

                // update the time value to be a nicer string.
                gpsjson.features[0].properties.time = tmstring;

                // update this system's position
                if (mylocation) {

                    // add this geojson to the mylocation layer
                    mylocation.addData(gpsjson);

                }
            }
        }
    };

    return {"eventname": "gpsstatus", "handler": gpshandler};
}

/************
 * create the handler function for use with SSE to listen for backend status events 
 *
*************/
function createStatusHandler() {

    // backend status handler function
    let statushandler = function(event) {
        let json;

        // Parse the incoming json
        try { json = JSON.parse(event.data); }
        catch (e) {
            console.log({"what": "Backend status JSON parse error", "event": event, "error": e.message, "json": json});
            return;
        }

        if (json) 
            processStatus(json);
    };

    return {"eventname": "backendstatus", "handler": statushandler};
}


/************
 * create the handler function for use with SSE to listen for trackers events from the backend system
 *
*************/
function createTrackersHandler() {

    // tracker events handler function
    let trackershandler = function(event) {
        let json;

        // Parse the incoming json
        try { json = JSON.parse(event.data); }
        catch (e) {
            console.log({"what": "Trackers JSON parse error", "event": event, "error": e.message, "json": json});
            return;
        }

        if (json) 
            processTrackers(json);
    };

    return {"eventname": "trackers", "handler": trackershandler};
}

/************
 * create the handler function for use with SSE to listen for packets events from the backend system
 *
*************/
function createPacketsHandler() {

    // packets handler function
    let packetshandler = function(event) {
        let geojson;

        // Parse the incoming json
        try { geojson = JSON.parse(event.data); }
        catch (e) {
            console.log({"what": "Packet JSON parse error", "event": event, "error": e.message, "geojson": geojson});
            return;
        }

        if (geojson) 
            processGeoJSON(geojson);
    };

    return {"eventname": "packets", "handler": packetshandler};
}


/*************
 * processGeoJSON
 *
 * decipher the geojson, unraveling a featurecollection, handling a feature, and looping though other geojson looking for a feature/featurecollection
 *************/
function processGeoJSON(geojson) {
    
    if (!geojson)
        return 0;
    
    // number of features
    let num = 0;

    // loop variable
    let i;

    // is this a featurecollection or a feature?
    let isFeature = geojson.type && geojson.type == "Feature";
    let isFeatureCollection = geojson.type && geojson.type == "FeatureCollection";

    // if this is a feature collection, then call packetRouter for each feature within
    if (isFeatureCollection && geojson.features) {
        for (feature in geojson.features) {

            // Determine which map layer this packet belongs too
            let layer = packetRouter(geojson.features[feature]);

            if (layer)
                // Add this packet to the appropriate map layer
                layer.addData(geojson.features[feature]);
            num++;
        }
    }

    // otherwise, is this just a single geojson feature?
    else if (isFeature) {

        // Determine which map layer this packet belongs too
        let layer = packetRouter(geojson);
        
        if (layer) {
            // Add this packet to the appropriate map layer
            layer.addData(geojson);
        }

        num = 1;
    }

    // otherwise, we just loop though each item in the json looking for a geojson object
    /*else {
        console.log("looping through geojson:  ", geojson);
        // loop through each item returned
        for (i in geojson) {

            // the geojson
            const js = geojson[i];

            // send this to the GeoJSON processor
            num += processGeoJSON(js);
        }
        */
    return num;
}


/************
 * getPacketSource
 *
 * This function will attempt to split apart the "raw" packet text and determine the station that transmitted the packet.
*************/
function getPacketSource(packet) {

    // If this packet doesn't contain the required objects then we pass...
    if (!packet.properties || !packet.properties.raw) {
        return null;
    }

    // the raw APRS packet
    let raw = packet.properties.raw;

    // split the packet into the address and information parts
    let address_part = raw.split(":");

    if (address_part && address_part.length > 1) {

        // split the address portion into the source and VIA path list
        let path = address_part[0].split(">")[1];

        if (path && path.length > 1) {

            // create an array listing each station within the path (minus the first entry).
            let stations = path.replace(/WIDE[0-9]*[-]*[0-9]*|\*/gi, "").replace(/,+$/, "").split(",").slice(1);

            // Return the last entry in our path list.  This should be the last station to transmit this packet (i.e. who we heard the packet from).
            let heardfrom = null;
            if (stations.length == 0)
                heardfrom = "direct";
            else
                heardfrom = stations[stations.length - 1];

            return heardfrom;
        }
    }

    return null;
}


/***********
* setupGeoLocation function
*
* ask the user if we can use their device for location information
***********/
function setupGeoLocation() {

    // location options for using the end user's device as the source for location information
    let position_options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
    };

    // Get the current location of the user's browser so we know where to put the "My Location" icon.
    // The user will have to allow this via their browser permissions (a request will popup).
    if (navigator.geolocation) {

        // Setup the watch function that will receive position updates from the end user's device
        navigator.geolocation.watchPosition(function(position) {

            // Set the global to true
            useGeoLocation = true;

            // this function is called upon every position update from the end user's device
            updateMyLocation(position);

        }, function(err) {

            // unable to get position from user's browser...for some reason...did they say no?
            useGeoLocation = false;

            // Remove the mylocation layer from the map and the layer control widget...as we have no local position to display
            mylocation.remove();
            //layercontrol.remove(mylocation);
        },
        position_options);
    }
}


/***********
* updateMyLocation
*
* This function receives position updates from an end user device, translates that to GeoJSON, then adds the data to the "mylocation" layer for map updates.
***********/
function updateMyLocation(position) {

    // where we'll construct our new GeoJSON object.
    let geojson = {};

    // This is a geojson feature
    geojson.type = "Feature";

    // The geometry of this feature
    geojson.geometry = {};
    geojson.geometry.type = "Point";
    geojson.geometry.coordinates = [ position.coords.longitude, position.coords.latitude ];

    // Properties
    geojson.properties = {};
    geojson.properties.geolocationdata = position.coords;

    // construct time string
    let tm = new Date(Date.now());

    // get the timezone offset in minutes
    let timezonemins = tm.getTimezoneOffset();

    // calcualte the hours in the timezone offset
    let offsetHours = Math.floor(timezonemins / 60);

    // calculate the mins in the timezone mins
    let offsetMins = Math.floor(timezonemins - (offsetHours * 60));

    // Create a time/date string similar to: 2023-03-20T10:33:09-06:00
    let date = tm.getFullYear() + "-" + 
        ('0' + (tm.getMonth() + 1)).slice(-2) + "-" + 
        ('0' + tm.getDate()).slice(-2) + "T" + 
        ('0' + tm.getHours()).slice(-2) + ":" + 
        ('0' + tm.getMinutes()).slice(-2) + ":" + 
        ('0' + tm.getSeconds()).slice(-2) + "-" + 
        ('0' + offsetHours).slice(-2) + ":" + 
        ('0' + offsetMins).slice(-2);

    // create the geojson object
    geojson.properties.tm = date; 
    geojson.properties.callsign = "My Location";
    geojson.properties.symbol = "1x";
    geojson.properties.speed_mph = (position.coords.speed ? Math.floor(position.coords.speed * 3.28084 * 3600 / 5280) : 0);
    geojson.properties.altitude = (position.coords.altitude ? Math.floor(position.coords.altitude * 3.28084) : 0);
    geojson.properties.bearing = (position.coords.heading ? Math.floor(position.coords.heading) : 0);
    geojson.properties.hash = date;

    // add this geojson feature to the mylocation layer for updating the map.
    mylocation.addData(geojson);
}

/***********
* processStatus
*
* This function will process incoming status events for status of the backend system
***********/
function processStatus(json) {

    let statusJson = json.backend;

    // the processes that we're expecting to be reported on.  By default we set them all to in-active.
    let processes = [
        { "process": "direwolf", "active": 0 },
        { "process": "aprsc", "active": 0 },
        { "process": "habtracker", "active": 0 },
        { "process": "gpsd", "active": 0 }
    ];

    // loop through each expected process comparing that to the list of active processes 
    processes.forEach(function(item) {
        for (p in json.processes) {
            if (json.processes[p].process.startsWith(item.process)) {
                item.active = (json.processes[p].active == 1 || json.processes[p].active == "true" || json.processes[p].active == true ? 1 : 0);
                break;
            }
        }
    });

    // status of various processes
    const direwolf = (processes.filter((a) => a.process.startsWith("direwolf")).reduce((a, c) => a + c.active, 0) ? true : false);
    const aprsc = (processes.filter((a) => a.process.startsWith("aprsc")).reduce((a, c) => a + c.active, 0) ? true : false);
    const backend = (processes.filter((a) => a.process.startsWith("habtracker")).reduce((a, c) => a + c.active, 0) ? true : false);
    const gpsd = (processes.filter((a) => a.process.startsWith("gpsd")).reduce((a, c) => a + c.active, 0) ? true : false);

    // is the backend active?
    let isActive = (typeof(statusJson.active) != "undefined" ? (statusJson.active == 1 || statusJson.active == "true" || statusJson.active == true ? true : false) : false);

    // is the backend beaconing?
    let isBeaconing = (typeof(statusJson.beaconing) != "undefined" ? (statusJson.beaconing == 1 || statusJson.beaconing == "true" || statusJson.beaconing == true ? true : false) : false);

    // are we igating?
    let isIgating = (typeof(statusJson.igating) != "undefined" ? (statusJson.igating == 1 || statusJson.igating == "true" || statusJson.igating == true ? true : false) : false);

    // is the backend connected to an SDR dongle?
    let isRFMode = (typeof(statusJson.rf_mode) != "undefined" ? (statusJson.rf_mode == 1 || statusJson.rf_mode == "true" || statusJson.rf_mode == true ? true : false) : false);

    // are we listening for packets from an instance of KA9Q-Radio running on the local network?
    let isKa9qradio = (typeof(statusJson.ka9qradio) != "undefined" ? (statusJson.ka9qradio == 1 || statusJson.ka9qradio == "true" || statusJson.ka9qradio == true ? true : false) : false);

    // determine if the backend is actually running.  
    const numProcessesRunning = (isRFMode ? direwolf + aprsc + backend : aprsc + backend);
    const totalProcessesExpected = (isRFMode ? 3 : 2);
    const isRunning = totalProcessesExpected - numProcessesRunning;

    // update the status box with the status of the backend processes
    if (backendstatusbox) {
        if (isRunning == 0)
            backendstatusbox.setStatus(1);  // we're up and running
        else if (isRunning == totalProcessesExpected)
            backendstatusbox.setStatus(0);  // we're not running 
        else 
            backendstatusbox.setStatus(-1);  // we're somewhere in between up and down.
    }
}


/***********
* processTrackers
*
* This function will process status updates for the trackers and teams lists from the backend
***********/
function processTrackers(json) {

    let js = json.data;
    let key, i;
    let num = (js ? js.length : 0);

    // Loop through each tracker team
    for (key in js) {
        let tactical = js[key].tactical;
        let flightid = js[key].flightid;
        let trks = js[key].trackers;
        if (trks && tactical != 'ZZ-Not Active') {
            let t;

            // Loop through each tracker assigned to this team
            for (t in trks) {

                // Add this tracker to the tracker list
                trackerslist[trks[t].callsign] = trks[t];

                // Add the flightid to this tracker in the list.  That way we know what flightid a tracker is ultimately assigned to (through their tactical team)
                trackerslist[trks[t].callsign]["flightid"] = flightid;

                // The tactical name for this tracker
                trackerslist[trks[t].callsign]["tactical"] = tactical;

                // if this tracker is part of the trackers layer and presumably on the map, then we need to update that station's particulars (i.e. tooltip, popup, etc.)
                if (trks) {
                    let geojson = trackers.getFeature(trks[t].callsign);
                    let layer = trackers.getFeatureLayer(trks[t].callsign);

                    if (layer && geojson) {
                        popup(stationPopup(geojson), layer);
                        tooltip({layer: layer, label: stationTooltip(geojson)});
                    }
                }
            }
        }
    }

    // Now need to prune off any stations that are part of the trackers layer, but are no longer tagged as a tracker (i.e. not in json.trackers)
    const featurelist = trackers.getFeatureList();
    for (let f in featurelist) {
        if (!isTracker(featurelist[f].feature)) {
            trackers.rmFeature(featurelist[f].feature.properties.callsign);
        }
    }

    return num;
}

/***********
* getDefinitions
*
* This will fetch the flight and tracker definitions fromt the backend.
***********/
async function getDefinitions() {

    // get the list of flights
    let response = await fetch("getdefinitions.php");
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
        num += processTrackers(js.trackers);

    // process flight definitions
    if (js && js.flights)
        num += processFlights(js.flights);

    return num;
}


/***********
* processFlights
*
* This function will process the flight definitions from the backend, populating the 'flightlist' global and create map layers for each active flight.
***********/
function processFlights(json) {

    let js = json.data;
    let key, i;
    
    // Loop through each flight, collecting the beacons 
    for (key in js) {
        const flight = js[key].flightid;
        const desc = js[key].description;
        const active = js[key].active;
        const beacon = js[key].callsign;
        const frequency = js[key].frequency;
        const beacon_location = js[key].beacon_location;
        const launchsite = { 
            name: js[key].launchsite, 
            latitude: js[key].launch_latitude, 
            longitude: js[key].launch_longitude, 
            altitude: js[key].launch_altitude
        };

        // if this is an active flight
        if (active) {

            // if this flight doesn't already exist create an object for it
            if (!flightlist[flight])
                flightlist[flight] = {};

            /*if (!flightlist[flight][beacon])
                flightlist[flight][beacon] = {};

            flightlist[flight][beacon].callsign = beacon;
            */

            // add the launchsite information
            flightlist[flight].launchsite = launchsite;

            // create the beacons array key if it doesn't already exist
            if (!flightlist[flight].beacons)
                flightlist[flight].beacons = [];

            // add the beacon to this flight's list of beacons
            flightlist[flight].beacons.push({callsign: beacon, flightid: flight, frequency: frequency, beacon_location: beacon_location});
        }

        // try and remove any inactive flights from the flightlist
        else {

            // if this flight exists, and is now inactive, then we need to remove it from our list, from the map, and from the layer control
            if (flightlist[flight]) {
                let layer = flightlist[flight].layer;

                // remove this flight from the map & layer control
                if (layer) {

                    // remove from the layer control
                    if (layercontrol)
                        layercontrol.removeLayer(layer);

                    // remove from the map
                    if (map)
                        map.removeLayer(layer);
                }

                // now delete the flight from the flightlist global
                delete flightlist[flight];
            }
        }
    }


    // create map layers for each active flight
    let f;
    let b;
    for (f in flightlist) {

        let beaconlist = {};
        // new GeoJSON layer for this flight
        if (!flightlist[f]["layer"]) {

            // the beacons specific for this flight only.
            /*
            for (b in flightlist[f]) {
                if (flightlist[f][b].callsign) {
                    beaconlist[b] = structuredClone(flightlist[f][b]);
                    beaconlist[b]["flightid"] = f;
                }
            }
            */

            flightlist[f]["layer"] = flightLayer(f, {"beacons" : flightlist[f].beacons, "launchsite": flightlist[f].launchsite}).addTo(map);

            // Add this flight to the list of layers that can be toggled on/off the map
            layercontrol.addOverlay(flightlist[f]["layer"], f);
        }
    }

    return flightlist;
}

/***********
* getPackets
*
* This will request all packets from flights and trackers limited by the backend "lookbackperiod"...typically the last 3hrs.
***********/
async function getPackets() {

    // get the prior tracker packets
    let response = await fetch("getpackets2.php");
    let js;

    // Parse the returned json 
    try {
        js = await response.json();
    } catch (e) {
        console.log("getPackets error: ", e, ", json: ", js);
    }

    // send this to the the geojson processor
    return processGeoJSON(js);
}


/***********
* getRFPackets
*
* This will request all packets from the prior lookback period for other stations (non-flight and non-tracker) that the backend system heard over RF.
***********/
async function getRFPackets() {

    // get the list of stations
    let response = await fetch("getrfstations2.php");
    let js;

    // Parse the returned json 
    try{
        js = await response.json();
    } catch (e) {
        console.log("getRFPackets error: ", e, ", json: ", js);
    }

    // send this to the GeoJSON processor
    return processGeoJSON(js);
}


/***********
* reload_on_error
*
* called when the SSE streamer class detect an SSE error and needs to restart SSE operations
***********/
function reload_on_error(options) {
    
    // severity and messages
    let severity = (options && typeof(options.severity) != "undefined" ? options.severity : 0);
    let statusmessage = (options && options.statusmessage ? options.statusmessage : "");

    // report this to the status box
    if (connectionbox && statusmessage) 
        connectionbox.addStatus(statusmessage);

    // reload any initial data
    if (severity >= 1)
        loadInitialData();
}


/***********
* loadInitialData
*
* load any initial data like flight packets, trackers, etc.
***********/
function loadInitialData() {

    // (re)get the current list of flights 
    getDefinitions().then(function(fl) {

        if (connectionbox && fl)
            connectionbox.addStatus("Definitions loaded: " + Object.keys(fl).length);

        // Get prior packets
        return getPackets();

    }).then(function(num) {

        if (connectionbox)
            connectionbox.addStatus("Packets loaded: " + num);

        // get RF stations if we're connected to a local system (i.e. not the kiosk)
        if (!KIOSKMODE)
            return getRFPackets();
        else
            return 0;

    }).then(function(num) {

        if (!KIOSKMODE && connectionbox)
            connectionbox.addStatus("RF station packets loaded: " + num);
    });
}


/***********
* startup function
*
* This function should be called from $(document).ready....
***********/
function startup() {

    // determine if this is an apple device or android or something else.
    isApplePlatform = isApple();

    // create new SSE steam handler.  this is a global object
    ssestream = new SSEStream({callback: reload_on_error}); 

    // listen to events
    ssestream.addHandlers(createPacketsHandler());
    ssestream.addHandlers(createTrackersHandler());

    // setup the map
    setupMap();

    // Check if we're using the EOSS Kiosk system.  If so, then we ask the user if we can use their device's GPS for location info
    if (window.location.host.toLowerCase() == kiosk_hostname.toLowerCase()) {

        // attempt to get position updates from the user's device
        setupGeoLocation();

        // set the global variable that desingates that we're using the kiosk system instead of a local one.
        KIOSKMODE = true;
    }
    else {
        // otherwise...we should be listening for gpsstatus events from the backend system
        ssestream.addHandlers(createGPSHandler());

        // The status box for displaying backend system status
        backendstatusbox = L.control.statusbox().addTo(map);

        // and also listen to events for the status of the backend system itself
        ssestream.addHandlers(createStatusHandler());
    }

    // The connection status box
    connectionbox = L.control.connectionstatus().addTo(map);

    // load initial data
    loadInitialData();

    // start SSE operations
    ssestream.start();
}


// starting point for everything 
document.addEventListener("DOMContentLoaded", startup);
