/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2023 Jeff Deaton (N6BA)
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

// the status message box
let statusbox;

// The catchall stations layer
let stations;

// The active trackers list
let trackerslist = {};

// The active flight list
let flightlist = {};

// my location layer and position source preference
let mylocation;
let useGeoLocation = false; // we assume false here unless the user is connected to the EOSS kiosk website (e.g. track.eoss.org)

// The hostname of the EOSS kiosk system
let kiosk_hostname = "track.eoss.org";
//let kiosk_hostname = "linux.local";

// event source object for incoming packets
let packetsource;

// The list of packets we've heard from the backend.  This is treated like a FIFO list.
let packetlist = [];

// age limit in seconds for keeping packets in the packetlist.  i.e. when to "shift" out the first element
let agelimit = 3600 * 3;

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

// helper function to determine if the flight is ascending based on a (altitude) and v (velocity)
const isAscending = function(a, v) { return (v >= 5 || (v >= 0 && a > 10000) ? true : false); };

// helper function to determine if the flight is descending based on a (altitude) and v (velocity)
const isDescending = function(a, v) { return (v <= -5 || (v > -5 && v < 0 && a > 10000) ? true : false); };

// helper function to determine if the flight is on the ground based on a (altitude) and v (velocity)
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

// helper function to craft an HTML string with lat/lon coordinates with a "copy to clipboard" clickable icon for a geojson Point object.
function createCoordsHTML(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point")
        return false;

    // construct a random ID the copyToClipboard function can use to identify the coords string.
    let id = (Math.random() + 1).toString(36).split(".")[1].toUpperCase();

    let html = "<br>Coords: <span id=\"" + id + "-coords\">"
        + (geojson.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (geojson.geometry.coordinates[0] * 10 / 10).toFixed(4)
        + "</span>"
        + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">";

    return html;
}

// helper function to create an HTML string for the speed, bearing, and altitude of a geojson Point object.
function createSpeedHTML(geojson) {
    if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point" || !geojson.properties)
        return false;

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

    let html = "<font style=\"text-align: left; clear: right; float: left;\">" + (typeof(geojson.properties.altitude) == "undefined" ? "" : (geojson.properties.altitude != 0 && geojson.properties.altitude != "" ? "<br>Alt: " + (geojson.properties.altitude * 10 / 10).toLocaleString() + "ft" : ""));
    html += (speedValid ? " &nbsp; " + (geojson.properties.speed_mph * 10 / 10).toFixed(0) + " MPH &nbsp; @ " + (geojson.properties.bearing * 10 / 10).toFixed(0) + "&deg;" : "") + "</font>";

    return html;
}

    // the frequency / heardfrom string
// help function to create an HTML string with the "heardfrom" and frequency of where this packet came from (i.e. who transmitted it).
function createHeardfromHTML(geojson) {
    if (!geojson || !geojson.properties)
        return false;

    let heardfrom = (typeof(geojson.properties.frequency) == "undefined" ? "" : (geojson.properties.frequency != "" ? "<br><font class=\"pathstyle\">Heard on: " + (geojson.properties.frequency / 1000000)  + 
        (geojson.properties.frequency == "ext radio" || geojson.properties.frequency == "TCPIP" ? "" : "MHz") 
        + (typeof(geojson.properties.heardfrom) == "undefined" ? "" : (geojson.properties.heardfrom != "" ? " via " + geojson.properties.heardfrom : "" )) + "</font>" : "" )); 

    if (typeof(geojson.properties.source) != "undefined") {
        if (geojson.properties.source != "direwolf" && geojson.properties.source != "ka9q-radio") 
            heardfrom = "<br><font class=\"pathstyle\">Heard from TCPIP</font>";
    }

    return heardfrom;
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
                return L.marker(latlon, { icon: myIcon, riseOnHover: true, rotationAngle: file_and_rotation.rotation, rotationOrigin: "center center" });
            }

            // What to do with a point that doesn't have a symbol?  Just return a dumb circle.
            return L.circleMarker(latlon, { radius: 3, riseOnHover: true, fillColor: "blue", fillOpacity: .9, stroke : false, fill: true });

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
        // By default, we're only interested in tracker, flight, or "My Location" packets.  All other stations we want to ignore.
        filter:  function(geojson) {

            // Determine what type of station this is
            let t = isTracker(geojson);
            let f = isFlight(geojson);
            let l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);

            // Check this callsign against the flightlist and trackerlist and "My Location"
            if (t || f || l)
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
            //console.log(this.name + ": no callsign: ", geojson);
            return this;
        }

        if (!geojson.geometry || !geojson.geometry.type) {
            //console.log(this.name + " [" + geojson.properties.callsign + "]: no geom: " + geojson.properties.raw);
            return this;
        }

        // check if this incoming geojson passes our filter
        if (this.options.filter && !this.options.filter(geojson)) {
            //console.log(this.name + " [" + geojson.properties.callsign + "]: filtered out: " + geojson.properties.raw);
            return this;
        }

        //console.log(this.name + " [" + geojson.properties.callsign + ", " + geojson.properties.tm + "]: adding packet: " + (geojson.properties.raw ? geojson.properties.raw : JSON.stringify(geojson.properties)));

        // Try and determine who we heard this packet from
        let heardfrom = getPacketSource(geojson);
        if (heardfrom) {
            geojson.properties.heardfrom = heardfrom;
        }

        // check if this feature is already in our list
        let existing_f = this.getFeature(geojson.properties.callsign);
        let oldlayer = this.getFeatureLayer(geojson.properties.callsign);

        // determine if this is new data or updates to a station we're already tracking
        if (existing_f) {

            // is this duplicate data? (ex. digipeated packets)
            if (!this.isduplicate(geojson, existing_f)) {

                // not duplicate...so we update the geojson feature for this APRS object
                this._features[existing_f.properties.callsign].feature = structuredClone(geojson);

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

    // The list of features we're maintaining
    _features: {},

    // Return the feature (i.e. geojson) for this callsign
    getFeature: function(callsign) {
        return this._features[callsign] && this._features[callsign].feature;
    },

    // Return the Leaflet layer that represents the feature identified by the supplied callsign.
    getFeatureLayer: function(callsign) {
        return this._features[callsign] && this._features[callsign].layer;
    },

    // Add this feature to our list
    addFeature: function(feature, layer) {
        this._features[feature.properties.callsign] = { "feature": feature, "layer": layer };
    },
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
            let p = isFlightPath(geojson);
            let l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);

            // Check this callsign against the flightlist and trackerlist and "My Location"
            if (t || f || l || b || p)
                return true;

            // by default return false.
            return false;
        },

        // style function 
        style:  function(geojson) {

            if (!geojson || !geojson.properties)
                return {};

            // default style (if all else fails, this is the color of vector layers)
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
                "color": (geojson.properties.ascending ? colormap.ascending.color : (geojson.properties.descending ? colormap.descending.color : default_color)),
                "fillColor": (geojson.properties.ascending ? colormap.ascending.color : (geojson.properties.descending ? colormap.descending.color : default_color)),
                "weight": 2
            };

            return style;
        }
    },

    // for checking duplicate packets for an indivdual beacon
    addToBeaconList: function(geojson) {

        // just in case
        if (!geojson || !geojson.properties || !geojson.properties.callsign)
            return false;

        // which beacon list?
        let beacon = this.options.beacons[geojson.properties.callsign];
        if (!beacon)
            return false;

        // The packetlist for this beacon
        let beaconlist = beacon.packetlist;

        // Get the last 5 packets from this beacon
        let lastfive = beaconlist.slice(Math.max(beaconlist.length - 5, 0)).reverse();

        // check the last several packets in case this is duplicate data
        for (p in lastfive) {
            if (this.isduplicate(lastfive[p], geojson))
                return false;
        }

        // add this geojson (i.e. packet) to the list of position packets for this beacon
        beaconlist.push(geojson);

        return true;
    },

    // used to compute x,y,z physics for a given geojson feature (i.e. an APRS packet from an individual beacon), and add those results to the overall physics array for this flight.
    computePhysics:  function(geojson) {
        
        // just in case
        if (!geojson || !geojson.properties || !geojson.properties.callsign || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point" || !geojson.geometry.coordinates) 
            return false;

        // which beacon list?
        let beacon = this.options.beacons[geojson.properties.callsign];
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

        // default values
        let x=0, xv=0, xa=0;
        let y=0, yv=0, ya=0;
        let z=0, zv=0, za=0;
        let timediff_secs=0;

        // get the last data point from this beacon and the time delta
        let lastpoint = beacon.physics[beacon.physics.length - 1];
        let thedate = gettime(geojson);
        if (lastpoint) {
            let olddate = lastpoint.tm;
            if (thedate) 
                timediff_secs = (thedate - olddate) / 1000;

            // check if we've encountered burst/cutdown
            if (!lastpoint.burst && !this.burst) {
                let burst = (geojson.properties.altitude ? (geojson.properties.altitude * 1.0 < lastpoint.z ? true : false) : false);
                if (burst) {
                    lastpoint.burst = burst;
                    this.burst = lastpoint.z;

                    if (!this.options.descending_linestring)
                        this.options.descending_linestring = [[lastpoint.x, lastpoint.y]];
                    else
                        this.options.descending_linestring.unshift([lastpoint.x, lastpoint.y]);

                }
            }
                

        }
        

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

        let newpoint = {
            "tm" : thedate,
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

            // include these values as it might be useful for presentation purposes
            "speed_mph": geojson.properties.speed_mph,
            "altitude": geojson.properties.altitude,
            "bearing": geojson.properties.bearing
        };

        // If the physics array doesn't exist, then create a blank one.   This is used to hold various physical telemetry from the beacon
        if (!beacon.physics) 
            beacon["physics"] = [];

        // Add this data point to the individual array for this beacon and sort it
        beacon.physics.push(newpoint);
        beacon.physics.sort(function(a, b) { return a.tm - b.tm; });

        // if the overall physics array for the flight doesn't exist, then create it.
        if (!this.options.flightphysics)
            this.options["flightphysics"] = [];

        // save this point to the array of coordinates for the ascending geojson linestring
        if (isAscending(newpoint.z, newpoint.z_velocity)) {
            if (!this.options.ascending_linestring)
                this.options["ascending_linestring"] = [];
            this.options.ascending_linestring.push([newpoint.x, newpoint.y]);
        }

        // save this point to the array of coordinates for the descending geojson linestring
        else if (isDescending(newpoint.z, newpoint.z_velocity)) {
            if (!this.options.descending_linestring) 
                    this.options["descending_linestring"] = [];
            this.options.descending_linestring.push([newpoint.x, newpoint.y]);
        }

        // we're assuming the flight is on the ground.
        //else
        
        // Add this data point to the overall array for this flight and sort it
        this.options.flightphysics.push(newpoint);
        this.options.flightphysics.sort(function(a, b) { return a.tm - b.tm; });

        return newpoint;
    },

    // this will reform some of the elements of this feature to so that a single "flight" feature is tracked (on the map).
    reformGeoJson: function(geojson) {

        // just in case
        if (!geojson || !geojson.properties)
            return false;

        // check if this callsign is in our beacon list.  If it is, then we rename the callsign for this feature to be the flight name.
        let isbeacon = this.options.beacons[geojson.properties.callsign];
        let newjson = structuredClone(geojson);
        if (isbeacon) {
            newjson.properties.callsign = isbeacon.flightid;
            newjson.properties.flightid = isbeacon.flightid;
        }

        return newjson;
    },


    // override the parent AddData function so we can handle packets from beacons on this flight
    addData: function(geojson) {

        // call underlying method to get this feature added to this layer.
        let layer = AprsStations.prototype.addData.call(this, this.reformGeoJson(geojson));

        // add this packet to the list for each beacon.  If successful, then compute the physics for this most recent packet.
        if (layer && this.addToBeaconList(geojson)) {

            // update the physics lists for beacons and the flight overall.  
            let latestpoint = this.computePhysics(geojson); 

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
                    "objecttype": name + "path"
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
                    "point": physicspoint,
                    "callsign":  fid + "_" + physicspoint.id + "_breadcrumb",
                    "ascending": isAscending(physicspoint.z, physicspoint.z_velocity),
                    "descending": isDescending(physicspoint.z, physicspoint.z_velocity),
                    "objecttype": name + "breadcrumb",
                    "speed_mph": physicspoint.speed_mph,
                    "altitude": physicspoint.altitude,
                    "bearing": physicspoint.bearing
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

        let features = [];
        let ascentFeature = createPathFeature(this.name, "ascent", this.options.ascending_linestring);
        let descentFeature = createPathFeature(this.name, "descent", this.options.descending_linestring);
        if (ascentFeature)
            features.push(ascentFeature);
        if (descentFeature)
            features.push(descentFeature);

        // breadcrumbs
        for (i in this.options.flightphysics) {
            let point = this.options.flightphysics[i];
            if (point.burst) {
                // create burst feature
            }
            else
                features.push(createBreadcrumb(this.name, point));
        }

        if (features.length > 0)
            return createFeatureCollection(features);
        else
            return false;
        
    } // updatePaths
});


// This runs immediately after the base class initialize function.
FlightLayer.addInitHook(function() {

    // setup packet buckets for each beacon on this flight
    let beacons = this.options.beacons;
    let b;
    for (b in beacons) {
        beacons[b]["packetlist"] = [];

        // store individual beacon telemetry here (ex. timestamp, altitude, velocity, acceleration, etc.)
        beacons[b]["physics"] = [];
    }

    // store overall flight telemetry data here (ex. timestamp, altitude, velocity, acceleration, etc.)
    this.options["flightphysics"] = [];

    // set this flight's color set for ascent, descent, etc. paths and breadcrumbs
    initializeColorSet(this.name);

    // burst has yet to be encountered.
    this.burst;

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

    return layer;

} // updateIcon


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

        // helper function to update an existing or bind a new popup to this layer
        const popup = function(content, l) {
            let existing = l.getPopup();
            if (existing)
                l.setPopupContent(content, { className: 'myPopupStyle' });
            else 
                l.bindPopup(content, {className:  'myPopupStyle'} );
            return l;
        };

        // helper function to update an existing or create a new tooltip for this layer (i.e. label underneath object)
        const tooltip = function(label, l) {
            let tooltip = l.getTooltip();
            if (tooltip) 
                l.setTooltipContent(label);
            else
                l.bindTooltip(label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", opacity: .9 }).openTooltip();
            return l;
        }



        // check what sort of object this is and call the appropriate content generator
        if (isFlight(geojson)) {
            popup(stationPopup(geojson), layer);
            tooltip(stationTooltip(geojson), layer);
        }
        else if (isTracker(geojson)) {
            popup(stationPopup(geojson), layer);
            tooltip(stationTooltip(geojson), layer);
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
            tooltip(stationTooltip(geojson), layer);
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
    let html = "<font style=\"float:left; margin:0; padding:0;\"><strong>" + fid + "</strong></font>";

    // build the rest of the HTML string
    html += (timestring ? "<font style=\"float:right; margin:0; padding:0;\">" + timestring + "</font>" : "");

    // the speed, bearing, altitude
    html += createSpeedHTML(geojson);

    // vertical rate (ft/min)
    let vrate = Math.round(geojson.properties.point.z_velocity * 60);
    html += "<br>Vert Rate: " + vrate.toLocaleString() + " ft/min";

    // the lat/lon HTML string
    html += createCoordsHTML(geojson);

    return html;

}


// this is a helper function to create the html for the popup content for an individual feature based on its geojson.properties.xxx values.  This should be called
// for "regular" APRS stations (ex. vehicles, objects, etc.).  
function stationPopup(geojson) {

    if (!geojson || !geojson.properties)
        return false;

    // the callsign of the existing feature
    let callsign = geojson.properties.callsign;

    // The followme link
    let html = "<font style=\"float:left; margin:0; padding:0;\"><a target=\"_blank\" href=\"testmap.php" +
        "?followfeatureid=" + callsign +
        "&latitude=" + geojson.geometry.coordinates[1] +
        "&longitude=" + geojson.geometry.coordinates[0] +
        "&zoom=" + map.getZoom() +
        "&showallstations=1\">" +
        "<strong>" + callsign + "</strong></a></font>";

    // The time
    let thetime = new Date(geojson.properties.tm);
    let timestring;
    if (thetime) 
        // if we're able to decode the time string into an actual Date object then construct a 24hr time representation.
        timestring = thetime.toLocaleTimeString("en-us", {hour12: false});

    // build the rest of the HTML string
    html = html + (timestring ? "<font style=\"float:right; margin:0; padding:0;\">" + timestring + "</font>" : "") +

    // The comment
    (typeof(geojson.properties.comment) == "undefined" ? "" : (geojson.properties.comment != "" ? "<br><font class=\"commentstyle\">" + geojson.properties.comment + "</font>" : "")) +

    // the speed, bearing, altitude
    createSpeedHTML(geojson) +

    // the frequency and where packet was heard from
    createHeardfromHTML(geojson) + 

    // the lat/lon HTML string
    createCoordsHTML(geojson);

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
        content = callsign + (geojson.properties.altitude && geojson.properties.altitude > 0 ? "<br>" + (geojson.properties.altitude * 1.0).toFixed(0).toLocaleString() + "ft" : "");

    return content;
} // updateTooltipContent




/***********
* setupMap function
*
* This function creates the map. 
***********/
function setupMap() {

    osmbright = L.maplibreGL({
        style: '/tileserver/osm-bright/style.json',
        attribution: 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    });

    basic = L.maplibreGL({
        style: '/tileserver/basic/style.json',
        attribution: 'Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
    });

    // Create a map object. 
    map = new L.Map('map', {
        //renderer : canvasRenderer,
        preferCanvas:  true,
        zoomControl: false,
        minZoom: 1,
        maxZoom: 20
    });

    // Set the center of the map and starting zoom level
    map.setView(new L.latLng(starting_location.lat, starting_location.lon), starting_location.zoom);


    /**************** zoom level display box ****************/
    // Create a small box in the top right hand corner to display the map zoom level
    let zoomLevelBox = L.control.gpsbox().addTo(map);
    zoomLevelBox.show("Zoom Level: " + map.getZoom());

    // change the text within the top lefthand box with the zoom level everytime it changes
    map.on('zoomend', function(ev) {
        if (zoomLevelBox) {
            zoomLevelBox.show("Zoom Level: " + map.getZoom());
        }
    });
    /********************************************************/

    // The status message box
    statusbox = L.control.gpsbox({"position": "topleft"}).addTo(map);
    statusbox.show("Loading map...");

    // Add a GeoJSON layer to hold heard stations (this is the catchall)
    stations = aprsStations("stations").addTo(map);

    // Add a GeoJSON layer for the end user's position
    mylocation = aprsStations("mylocation").addTo(map);

    /************************ layer selection control ***********/
    // Add our OSM map as the "base map" layer.
    let baselayer = { "Basic": basic, "OSM Bright": osmbright };
    basic.addTo(map);

    // Overlay layers
    let overlays = { "My Location": mylocation, "Other Stations": stations };

    // Add the layer control to the map
    layercontrol = L.control.layers(baselayer, overlays).addTo(map);
    /********************************************************/


    // This fixes the layer control such that when used on a touchable device (phone/tablet) that it will scroll if there are a lot of layers.
    if (!L.Browser.touch) {
        L.DomEvent
        .disableClickPropagation(layercontrol._container)
        .disableScrollPropagation(layercontrol._container);
    } 
    else {
        L.DomEvent.disableClickPropagation(layercontrol._container);
    }

    // Add a zoom control to the map.  We do this last so that it's below the other controls in the top righthand corner of the map.:w
    let zoom = L.control.zoom({ "position": "topright" }).addTo(map);

    // Update status message
    statusbox.show("Map loaded");

    return map;
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
* isFlightPath
*
* This will check the incoming geojson.properties.callsign for a substring, '_path'.
* returns the tracker json if this callsign represents a tracker, otherwise false/null/undefined.
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

    let result = (trackerslist[geojson.properties.callsign] ? trackerslist[geojson.properties.callsign]  : (trackerslist[callsign] ? trackerslist[callsign] : null));
    return result;
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
        for (c in flightlist[f]) {
            if (c == geojson.properties.callsign) {
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

    // check if this station is in the flight list or is a tracker "assigned" to a flight (i.e. not "At Large")
    if (p.properties.callsign) {

        // if this is a tracker station then return the 'stations' layer
        if (isTracker(p))
            return defaultlayer;

        let l = isFlight(p);
        if (l)
            return l.layer;
    }

    // For everything else we return the 'stations' layer
    return defaultlayer;
}   


/***********
* setupSSE function
*
* This function will setup an SSE connection to the backend packet source (backendurl) and use the handler as the callback function.
***********/
function setupSSE(backendurl) {
    if(typeof(EventSource) !== "undefined") {
        
        // Create new SSE source
        packetsource = new EventSource(backendurl);

        // listen for new packets
        packetsource.addEventListener("new_packet", function(event) {

            // Parse the incoming json
            let geojson = JSON.parse(event.data);

            // Add a function here to determine if the incoming packet belongs to a flight layer (ex. balloon, tracker, etc.),
            // other stations layers, etc..  Perhaps a single function here, will then direct data
            // to the leaflet layer group of choice.

            if (geojson) {

                // Determine which map layer this packet belongs too
                let layer = packetRouter(geojson);
                
                if (layer) {

                    // Add this packet to the appropriate map layer
                    layer.addData(geojson);

                    if (statusbox)
                        statusbox.show("Packet from:  <pre style=\"font-size: .9em;\">" + (geojson.properties.callsign ? geojson.properties.callsign : "no callsign") + ":  " + geojson.properties.raw + "</pre>");
                }
            }    
        });

        // listen for new gps position alerts
        packetsource.addEventListener("new_position", function(event) {

            // Parse the incoming json
            let gpsjson = JSON.parse(event.data);

            //console.log(gpsjson);
            
            // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
            if (gpsjson && gpsjson.properties && !useGeoLocation) {
                gpsjson.properties.callsign = "My Location";
                gpsjson.properties.symbol = "1x";
                gpsjson.properties.hash = gpsjson.properties.tm;
                gpsjson.properties.altitude = gpsjson.properties.altitude_ft;
                gpsjson.properties.speed_mph = (gpsjson.properties.speed_math ? Math.floor(gpsjson.properties.speed_mph) : 0);
                gpsjson.properties.bearing = (gpsjson.properties.bearing ? Math.floor(gpsjson.properties.bearing) : 0 );
                //console.log(gpsjson);

                // add this data to the mylocation layer group
                mylocation.addData(gpsjson);
            }
        });

        // listen for changes to the tracker definitions
        packetsource.addEventListener("tracker_change", function(event) {

            // Parse the incoming json
            let js = JSON.parse(event.data);

            console.log(js);

            // need to do stuff here to move the tracker to the proper layer.
        });

        // listen for changes to the flight definitions
        packetsource.addEventListener("flight_change", function(event) {

            // Parse the incoming json
            let js = JSON.parse(event.data);

            console.log(js);

            // need to do stuff here to adjust the layer group and move callsigns to/from this layer (and others).
        });


        // if there was an error display an alert.  NEED TO UPDATE THIS TO BE USER FRIENDLY. 
        packetsource.addEventListener("error", function(e) {
            console.log("SSE Error");
            setupSSE(backendurl);
        });

        return true;
    } 

    return false;
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

            // create an array listing each stations within the path (minus the first entry).
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
* NEED TO UPDATE THIS.  DON'T USE YET.
*
* trim_packetlist function
*
* This function will look through the packetlist array 'shifting' off those packets that are older than the agelimit.
***********/
function trim_packetlist() {

    // The current date/time
    let currenttime = Date.now() / 1000;

    // Loop through the packetlist array stopping on the first packet that is younger than the agelimit.
    let sliceidx = packetlist.find(function(elem) {

        // the time/date object from the packet
        // time format example:  2023-03-11T14:22:02-07:00
        let elemdate = new Date(elem.properties.tm);

        // the difference in seconds between the current date and the packets date/time
        let delta_secs = Math.floor((currenttime - elemdate) / 1000);
        
        // if the packet is < the agelimit then return true.
        return delta_secs < agelimit; 
    });

    // if the 'array.find' operation returned something a value that was > 0, then slice off that part of the packetlist as 
    // those packets are older than the agelimit.
    if (sliceidx) {
        if (sliceidx > 0) {

            // slice off the first portion of the packetlist array as those packets are older than the agelimit.
            packetlist = packetlist.slice(sliceidx);
        }
    }
}

/***********
* setupMyLocation function
*
* For determining the source of the user's location (ex. their device or the backend's GPS) and setup.
***********/
function setupMyLocation() {

    // Check if we're using the EOSS Kiosk system or the local "brick". 
    if (window.location.host.toLowerCase() != kiosk_hostname) {

        // We're not going to use the user's device for location information as we're connected to a backend system
        useGeoLocation = false;

        // get backend position from gpslocation.php.
        let xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {

                // Parse the returned json 
                let js = JSON.parse(this.responseText);

                // Send this geojson object to the "mylocation" layer for display on the map.  Ongoing position updates will come from the backend as part of the SSE connection.
                // so we don't need to do anything here except to get the initial position.
                mylocation.addData(js);
            }
        };

        // Connect to the backend server
        xhttp.open("GET", "getlocation.php", true);

        // Send our request
        xhttp.send();

        return;
    }


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

            // unable to get position from user's browser...for some reason.
            useGeoLocation = false;

            // Remove the mylocation layer from the map and the layer control widget
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
* getTrackers
*
* This function will query the backend for the list of trackers
***********/
async function getTrackers() {

    console.log("in getTrackers");
    // get the list of trackers
    let response = await fetch("gettrackers.php");


    // Parse the returned json 
    let js = await response.json();
    let key, i;
    
    console.log("in getTrackers, got response");
    // Loop through each tracker team
    for (key in js) {
        let tactical = js[key].tactical;
        let flightid = js[key].flightid;
        let trackers = js[key].trackers;
        if (trackers && tactical != 'ZZ-Not Active') {
            let t;

            // Loop through each tracker assigned to this team
            for (t in trackers) {

                // Add this tracker to the tracker list
                trackerslist[trackers[t].callsign] = trackers[t];

                // Add the flightid to this tracker in the list.  That way we know what flightid a tracker is ultimately assigned to (through their tactical team)
                trackerslist[trackers[t].callsign]["flightid"] = flightid;
            }
        }
    }
    return true;
}

/***********
* getFlights
*
* This function will query the backend for the list of active Flights
***********/
async function getFlights() {

    console.log("in getFlights");

    // get the list of flights
    let response = await fetch("getflights.php");

    // Parse the returned json 
    let js = await response.json();
    let key, i;
    console.log("in getFlights, got response");
    
    // Loop through each flight
    for (key in js) {
        let flight = js[key].flight;
        let desc = js[key].description;
        let active = js[key].active;
        if (active == 't') {
            let beacons = js[key].beacons;
            let b;

            // loop through each beacon listed on this flight.
            for (b in beacons) {
                let callsign = beacons[b].callsign;
                if (flightlist[flight])
                    flightlist[flight][callsign] = beacons[b];
                else {
                    flightlist[flight] = {};
                    flightlist[flight][callsign] = beacons[b];
                }
            }
        }
    }

    // now create map layers for each flight
    let f;
    let b;
    let beaconlist = {};
    for (f in flightlist) {

        // the beacons specific for this flight only.
        for (b in flightlist[f]) {
            if (flightlist[f][b].callsign) {
                beaconlist[b] = structuredClone(flightlist[f][b]);
                beaconlist[b]["flightid"] = f;
            }
        }

        // new GeoJSON layer for this flight
        flightlist[f]["layer"] = flightLayer(f, {"beacons" : beaconlist}).addTo(map);
        //flightlist[f]["layer"] = new AprsStations().addTo(map);

        // Add this flight to the list of layers that can be toggled on/off the map
        layercontrol.addOverlay(flightlist[f]["layer"], f);
    }

    return true;
}

/***********
* getFlightPackets
*
* This will request all packets from the prior 3hrs for all active flights.  We don't really care about packets from the past for any other station - they
* will come in as they transmit.  For flights, however, we need prior packets in order to plot paths, compute landing predictions, etc..
***********/
async function getFlightPackets() {
    console.log("in getFlightPackets");

    // get the list of flights
    let response = await fetch("getpackets2.php");

    // Parse the returned json 
    let js = await response.json();
    let key, i;
    let num = Object.keys(js).length;
    console.log("in getFlightPackets, got response");

    if (num > 0)
        statusbox.show("Loading " + num + " flight packets...");
    //statusbox.show("Loading packets...");
    
    // Loop through each geojson packet
    for (key in js) {
        let geojson = js[key];

        if (geojson) {
            let layer = packetRouter(geojson);
            
            if (layer) 
                layer.addData(geojson);
        }
    }

    // If there were packets to load, then report that we're done
    if (num > 0)
        statusbox.show("Finished loading flight packets.");

    return js.length;
}


/***********
* startup function
*
* This function should be called from $(document).ready....
***********/
function startup() {

    // *********** THIS IS A MESS...NEED TO FIX *************
    
    // setup the map
    setupMap();

    // setup our location source
    setupMyLocation();

    // get the current trackers list
    getTrackers().then(function() {
        // get the current list of flights 
        getFlights();
    }).then(function() {
        // Get prior packets
        getFlightPackets();
    }).finally( function() {
        // startup SSE operations.
        setupSSE("ssestream.php");
    });
}


// starting point for everything 
document.addEventListener("DOMContentLoaded", startup);
