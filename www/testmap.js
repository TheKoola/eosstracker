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
var map;
var starting_location = { "lat": 39.739, "lon": -104.984, "zoom": 7 };

// The layercontrol object
var layercontrol;

// the status message box
var statusbox;

// The catchall stations layer
var stations;

// The active trackers list
var trackerslist = {};

// The active flight list
var flightlist = {};

// my location layer and position source preference
var mylocation;
var useGeoLocation = false; // we assume false here unless the user is connected to the EOSS kiosk website (e.g. track.eoss.org)

// The hostname of the EOSS kiosk system
var kiosk_hostname = "track.eoss.org";
//var kiosk_hostname = "linux.local";

// event source object for incoming packets
var packetsource;

// The list of packets we've heard from the backend.  This is treated like a FIFO list.
var packetlist = [];

// age limit in seconds for keeping packets in the packetlist.  i.e. when to "shift" out the first element
var agelimit = 3600 * 3;


/***********
* aprsStations class
*
* An extension of the GeoJSON class so we have a way to track which APRS stations are on the map, etc..
*
* By default it only keeps the latest packet heard for each station.
***********/
AprsStations = L.GeoJSON.extend({

    options: {

        // This is called for each feature added 
        onEachFeature:  function (feature, layer) {

            // create this layer's popup content
            updatePopupContent(feature, layer);

            // create this layer's tooltip
            updateTooltipContent(feature, layer);

        }, // onEachFeature
            

        // for every point geometry added, this function is called.
        pointToLayer: function (feature, latlon) {

            // get the filename and rotation for the PNG for this APRS object
            var file_and_rotation = getFilenameAndRotation(feature);
            if (file_and_rotation) {
                    
                // iconsize
                var iconsize = 24;

                // icon center
                var iconsize_center = Math.trunc(iconsize/2);
             
                // move the tooltip anchor location down just a little
                var tipanchor = iconsize_center + 10;

                // new icon for this object
                var myIcon = L.icon({
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
            return L.circleMarker(latlon, { radius: 8, riseOnHover: true, fillColor: "blue", fillOpacity: .9, stroke : false, fill: true });

        }, // pointToLayer
        

        // this is called when we get new data for a feature already in our list
        updateFeature: function(newjson, layer) {

            // Must have properties and callsign objects
            if (!newjson || !layer)
                return null;

            console.log({"w": "updating data", "callsign": newjson.properties.callsign, "tm": newjson.properties.tm, "heardfrom": newjson.properties.heardfrom, "f": newjson});

            // The incoming geometry type
            var type = newjson.geometry.type;

            // The incoming coordinates
            var coordinates = newjson.geometry.coordinates;

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
            updatePopupContent(newjson, layer);

            // Update the tooltip content
            updateTooltipContent(newjson, layer);

            // Update the icon for this object
            updateIcon(newjson, layer);
            
            return layer;
        }, // updateFeature

        // This will filter out geojson objects we don't want added.  It should return true/false.
        // By default, we're only interested in tracker, flight, or "My Location" packets.  All other stations we want to ignore.
        filter:  function(geojson) {

            // Determine what type of station this is
            var t = isTracker(geojson);
            var f = isFlight(geojson);
            var l = (geojson.properties.callsign && geojson.properties.callsign == "My Location" ? true : false);

            // Check this callsign against the flightlist and trackerlist and "My Location"
            if (t || f || l)
                return true;

            // by default return false.
            return false;
        }
    }, // options
    

    // override the parent AddData function so we can check if a feature has already been added to this layer group.
    addData: function(geojson) {

        // normalize the incoming geojson, just in case
        var f = L.GeoJSON.asFeature(geojson);

        // must be properly formed
        if (!f.properties || !f.properties.callsign || !f.geometry || !f.geometry.type)
            return this;


        // check if this incoming geojson passes our filter
        if (this.options.filter && !this.options.filter(geojson)) 
            return this;


        // Try and determine who we heard this packet from
        var heardfrom = getPacketSource(f);
        if (heardfrom) {
            f.properties.heardfrom = heardfrom;
        }

        // check if this feature is already in our list
        var existing_f = this.getFeature(f.properties.callsign);
        var oldlayer = this.getFeatureLayer(f.properties.callsign);

        // determine if this is new data or updates to a station we're already tracking
        if (existing_f) {

            // is this duplicate data? (ex. digipeated packets)
            if (!this.isduplicate(geojson, existing_f)) {

                // not duplicate...so we update the geojson feature for this APRS object
                this._features[existing_f.properties.callsign].feature = geojson;

                // now update this feature's popup, tooltip, etc., etc.
                return this.options.updateFeature(f, oldlayer);
            }
            else 
                return this;
        }
        else {
            console.log({"w": "new data", "callsign": f.properties.callsign, "tm": f.properties.tm, "heardfrom": f.properties.heardfrom, "f": f});

            // this is new data so create a layer from the geojson.  This will automatically call the pointToLayer function within our options.
            layer = L.GeoJSON.geometryToLayer(f, this.options);

            // if unable to create a layer from the geojson, then return.
            if (!layer) {
                return;
            }

            // Add this new feature to our list.
            this.addFeature(f, layer);

            // call the onEachFeature function for styling, etc.
            this.options.onEachFeature(f, layer);

            // add this new layer 
            return this.addLayer(layer);
        }

    }, // addData

    // compare geojson features.  returns true if the newjson represents duplicate data.
    isduplicate: function(newjson, oldjson) {

        // check inputs
        if (!newjson || !oldjson) 
            return false;

        // timestamps from new and old JSON features
        var olddate = new Date(oldjson.properties.tm);
        var newdate = new Date(newjson.properties.tm);
        var timediff_secs = (newdate - olddate);

        // if this new data was heard < 10secs from the prior packet AND the "heardfrom" station was not "direct", and the MD5 hashs between old & new are identical..
        // ...then we assume this is a duplicate packet and return.
        if (timediff_secs < 10000 && newjson.properties.heardfrom != "direct" && newjson.properties.hash == oldjson.properties.hash) {
            console.log({"w": "duplicate", "callsign": newjson.properties.callsign, "delta": timediff_secs, "heardfrom": newjson.properties.heardfrom, "f" : newjson});
            return true;
        }
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



// this will determine the PNG filename that represents this APRS symbol and it's correct rotation (to reflect its current bearing).
function getFilenameAndRotation(geojson) {

    // was a APRS symbol provided?
    if (geojson.properties.symbol) {

        // Determine the file path to the PNG icon that represents this symbol
        var filename = null;

        // by default we don't rotate the icon
        var rotation = 0;

        // check the symbol and determine the correct PNG filename that represents this APRS symbol
        if (geojson.properties.symbol.startsWith('\\') || geojson.properties.symbol.startsWith('\/') || geojson.properties.symbol.startsWith('1x')) 
            filename = "/images/aprs/" + symbols[geojson.properties.symbol].tocall + ".png";                
        else 
            filename = "/images/aprs/" + geojson.properties.symbol.charAt(0) + "-" + symbols["\\" + geojson.properties.symbol.charAt(1)].tocall + ".png";

        // Determine if a bearing was provided ...AND... this symbol is one that we "should" rotate (ex. it's a vehicle, etc.)
        if (typeof(geojson.properties.bearing) != "undefined" && typeof(symbolRotation[geojson.properties.symbol.charAt(1)]) != "undefined") {
            var clear_to_rotate = false;

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
    var callsign = geojson.properties.callsign;

    // An iconsize of 24px is about optimal.
    var iconsize = 24;

    // determine the icon center
    var iconsize_center = Math.trunc(iconsize/2);

    // Place the anchor point for the tooltip just a smidge lower, vertically, than center.  (i.e. the label underneath the icon)
    var tipanchor = iconsize_center + 10;

    // get the appropriate filename for the PNG and any appropriate rotation
    var file_and_rotation = getFilenameAndRotation(geojson);

    // Create a new icon (we do this because the APRS station might have changed it's symbol)
    // ...but only if there is a valid filename/symbol for this station.  Otherwise, we don't create a custom icon for this layer.
    if (file_and_rotation) {
        var myIcon = L.icon({
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



// this will update/create a feature's popup content with the newly supplied geojson
function updatePopupContent(geojson, layer) {

    // sanity check...
    if (!geojson || !layer)
        return null;

    // check objects
    if (!geojson.properties.callsign || !geojson.geometry || !geojson.geometry.type)
        return null;

    // the callsign of the existing feature
    var callsign = geojson.properties.callsign;

    // we only want to update the popup content for POINT objects.
    if (geojson.geometry.type && geojson.geometry.type == "Point") {
        var mapcenter = map.getCenter();
        var mapzoom = map.getZoom();


        //lots to check for a valid speed & bearing figure...we don't report speed for a stationary object.
        // speed_mph is > 0 && < 300
        // bearing is a number and >= 0
        // altitude is not 0
        //
        // by default we assume that the speed value should not be reported.
        var speedValid = false;
        if (geojson.properties.speed_mph && geojson.properties.bearing && geojson.properties.altitude) {
            if (geojson.properties.speed_mph > 0 && geojson.properties.speed_mph < 300 && geojson.properties.bearing >= 0 && geojson.properties.altitude != 0)
                speedValid = true;
        }

        // the frequency / heardfrom string
        var default_heardfrom = (typeof(geojson.properties.frequency) == "undefined" ? "" : (geojson.properties.frequency != "" ? "<br><font class=\"pathstyle\">Heard on: " + (geojson.properties.frequency / 1000000)  + (geojson.properties.frequency == "ext radio" || geojson.properties.frequency == "TCPIP" ? "" : "MHz") + (typeof(geojson.properties.heardfrom) == "undefined" ? "" : (geojson.properties.heardfrom != "" ? " via " + geojson.properties.heardfrom : "" )) + "</font>" : "" )); 
        var heardfrom = default_heardfrom;
        if (typeof(geojson.properties.source) != "undefined") {
            if (geojson.properties.source != "direwolf") 
                heardfrom = "<br><font class=\"pathstyle\">Heard from TCPIP</font>";
        }

        // The followme link
        html = "<font style=\"float:left; margin:0; padding:0;\"><a target=\"_blank\" href=\"testmap.php" +
            "?followfeatureid=" + callsign +
            "&latitude=" + geojson.geometry.coordinates[1] +
            "&longitude=" + geojson.geometry.coordinates[0] +
            "&zoom=" + mapzoom +
            "&showallstations=1\">" +
            "<strong>" + callsign + "</strong></a></font>";
        // The time
        html = html + (typeof(geojson.properties.tm) == "undefined" ? "" : (geojson.properties.tm != "" ? "<font style=\"float:right; margin:0; padding:0;\">" + geojson.properties.tm.split('T')[1].split('.')[0].split("-")[0] + "</font>" : "")) +

        // The comment
        (typeof(geojson.properties.comment) == "undefined" ? "" : (geojson.properties.comment != "" ? "<br><font class=\"commentstyle\">" + geojson.properties.comment + "</font>" : "")) +

        // the speed, bearing, & altitude
        (typeof(geojson.properties.altitude) == "undefined" ? "" : (geojson.properties.altitude != 0 && geojson.properties.altitude != "" ? "<br>Alt: " + (geojson.properties.altitude * 10 / 10).toLocaleString() + "ft" : "")) +
        (speedValid ? " &nbsp; " + (geojson.properties.speed_mph * 10 / 10).toFixed(0) + " MPH &nbsp; @ " + (geojson.properties.bearing * 10 / 10).toFixed(0) + "&deg;" : "") + 

        // the frequency and where packet was heard from
        heardfrom + 

        // The lat, lon coordinates along with cut/paste icon
        (typeof(geojson.geometry.coordinates) == "undefined" ? "" :
        "<br>Coords: <span id=\"" + callsign + "-coords\">"
        + (geojson.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (geojson.geometry.coordinates[0] * 10 / 10).toFixed(4)
        + "</span>"
        + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + callsign + "-coords')\">" );



        // is there already a popup created for this layer?
        var popup = layer.getPopup();
        if (popup) {

            // Update the popup content
            layer.setPopupContent(html, { className: 'myPopupStyle' });
        }
        else {

            // no popup yet exists for this layer so we create one and bind it to the layer. 
            layer.bindPopup(html, {className:  'myPopupStyle'} );
        }

        return layer;
    }
} // updatePopupContent


// This will update/create the tooltip (ex. label underneath the marker on the map) with the supplied geojson
function updateTooltipContent(geojson, layer) {

    // sanity check...
    if (!geojson || !layer)
        return null;

    // the callsign of the existing feature
    var callsign = geojson.properties.callsign;

    // display different content for trackers and flights
    // ...
    // ...

    // if there isn't a callsign we can't add a label under the this object's icon.  If the callsign is "My Location", then we return as 
    // we don't want any sort of label under a user's 'blue dot' that identifies their location.  
    if (!callsign || callsign == "My Location") 
        return null;


    // the tool tip content.  By default it only consists of the station's callsign.
    var content = callsign;

    // is this a tracker?
    var t = isTracker(geojson);
    if (t) 
        content = t.tactical.toUpperCase();

    // is this a flight beacon?
    var f = isFlight(geojson);
    if (f)
        content = callsign + (geojson.properties.altitude && geojson.properties.altitude > 0 ? "<br>" + (geojson.properties.altitude * 1.0).toFixed(0).toLocaleString() + "ft" : "");

    // does a Tooltip for this layer already exist?
    var tooltip = layer.getTooltip();
    if (tooltip) {
        
        // Update the tooltip's content 
        layer.setTooltipContent(content);
    }
    else {

        // a tooltip doesn't exist yet, so create a new tooltip and bind it to this layer.
        layer.bindTooltip(content, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", opacity: .9 }).openTooltip();
    }

    return layer;
} // updateTooltipContent




/***********
* setupMap function
*
* This function creates the map. 
***********/
function setupMap() {

    // create the tile layer referencing the local system as the url (i.e. "/maps/....")
    var osmUrl='/maps/{z}/{x}/{y}.png';
    var osmAttrib='Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
    var tilelayer = L.tileLayer(osmUrl, {minZoom: 3, maxZoom: 19, attribution: osmAttrib});

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

    // Add the map as the default base layer
    tilelayer.addTo(map);


    /**************** zoom level display box ****************/
    // Create a small box in the top right hand corner to display the map zoom level
    var zoomLevelBox = L.control.gpsbox().addTo(map);
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
    stations = new AprsStations().addTo(map);

    // Add a GeoJSON layer for the end user's position
    mylocation = new AprsStations().addTo(map);

    /************************ layer selection control ***********/
    // Add our OSM map as the "base map" layer.
    var baselayer = { "Base Map": tilelayer };

    // Overlay layers
    var overlays = { "My Location": mylocation, "Other Stations": stations };

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
    var zoom = L.control.zoom({ "position": "topright" }).addTo(map);

    // Update status message
    statusbox.show("Map loaded");
}


/***********
* isTracker
*
* This will compare the incoming geojson.properties.callsign against the trackerlist global.
* returns the tracker json if this callsign represents a tracker, otherwise false/null/undefined.
***********/
function isTracker(geojson) {

    // make sure this geojson has a callsign property
    if (!geojson.properties || !geojson.properties.callsign)
        return false;

    // we have to check if the incoming callsign matches the trackerlist callsign with/without an SSID
    var t;
    for (t in trackerslist) {
        
        // split out the trackerlist callsign from its SSID (ex. call-XX)
        var pieces = t.split("-");
        var callsign = pieces[0];
        var ssid = (pieces[1] ? pieces[1] : null);

        // Check if the incoming geojson matches the callsign-ssid or the callsign of the trackerlist entry
        //var match = ssid ? geojson.properties.callsign == t) ? true : (geojson.properties.callsign.startsWith(callsign.toUpperCase()));
        var match = (call, ssid, callssid, incomingcall) => {
            //console.log("call:  " + call + ", ssid: " + ssid + ", callssid: " + callssid + ", incomingcall: " + incomingcall);
            if (ssid) 
                return incomingcall == callssid;
            else 
                return incomingcall.startsWith(call.toUpperCase());
        };

        // If there was a match, then return the trackerlist entry it matches.
        if (match(callsign, ssid, t, geojson.properties.callsign)) {
            //console.log(geojson.properties.callsign + " Matches tracker entry: " + JSON.stringify(trackerslist[t]));
            return trackerslist[t];
        }
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
    if (!geojson.properties || !geojson.properties.callsign)
        return false;

    // cycle through the list of flights to determine if this packet belongs to a flight
    var f;
    for (f in flightlist) {

        // now loop through each callsign (i.e. beacon) assigned to this flight comparing it to our test case
        var c;
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
* This function return the correct GeoJSON layer that a packet should be added too
***********/
function packetRouter(p) {
    var layer = stations;

    // check if this station is in the flight list or is a tracker "assigned" to a flight (i.e. not "At Large")
    if (p.properties.callsign) {

        // cycle through the list of flights to determine if this packet belongs to a flight
        var f;
        for (f in flightlist) {

            // now loop through each callsign (i.e. beacon) assigned to this flight 
            var c;
            for (c in flightlist[f]) {
                if (c == p.properties.callsign) {
                    return flightlist[f]["layer"];
                }
            }

            // if this is not a balloon beacon, then check the tracker list for if this callsign is assigned to this flight.
            var tracker = isTracker(p);

            //console.log("packetRouter[" + f + "]: " + JSON.stringify(tracker));
            if (tracker && tracker.flightid == f) {
                console.log("Matches " + f);
                return flightlist[f]["layer"];
            }
            //if (trackerslist[p.properties.callsign]) {
            //    if (trackerslist[p.properties.callsign].flightid == f) {
            //        return flightlist[f]["layer"];
            //    }
            //}

        }
    }

    return layer;
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
            var geojson = JSON.parse(event.data);

            // Add a function here to determine if the incoming packet belongs to a flight layer (ex. balloon, tracker, etc.),
            // other stations layers, etc..  Perhaps a single function here, will then direct data
            // to the leaflet layer group of choice.

            if (geojson) {

                // Determine which map layer this packet belongs too
                var layer = packetRouter(geojson);
                
                if (layer) {

                    // Add this packet to the appropriate map layer
                    layer.addData(geojson);

                    if (statusbox)
                        statusbox.show("Packet from:  " + (geojson.properties.callsign ? geojson.properties.callsign : "no callsign"));
                }
            }    
        });

        // listen for new gps position alerts
        packetsource.addEventListener("new_position", function(event) {

            // Parse the incoming json
            var gpsjson = JSON.parse(event.data);

            console.log(gpsjson);
            
            // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
            if (gpsjson && gpsjson.properties && !useGeoLocation) {
                gpsjson.properties.callsign = "My Location";
                gpsjson.properties.symbol = "1x";
                gpsjson.properties.hash = gpsjson.properties.tm;
                gpsjson.properties.altitude = gpsjson.properties.altitude_ft;
                gpsjson.properties.speed_mph = (gpsjson.properties.speed_math ? Math.floor(gpsjson.properties.speed_mph) : 0);
                gpsjson.properties.bearing = (gpsjson.properties.bearing ? Math.floor(gpsjson.properties.bearing) : 0 );
                console.log(gpsjson);

                // add this data to the mylocation layer group
                mylocation.addData(gpsjson);

                // Check if the mylocation layer is on the map
                if (!map.hasLayer(mylocation))
                    mylocation.addTo(map);

                // Check if the mylocation layer group is added to the layer control widget
                //layercontrol.hasLayer(mylocation);

            }
        });

        // listen for changes to the tracker definitions
        packetsource.addEventListener("tracker_change", function(event) {

            // Parse the incoming json
            var js = JSON.parse(event.data);

            console.log(js);

            // need to do stuff here to move the tracker to the proper layer.
        });

        // listen for changes to the flight definitions
        packetsource.addEventListener("flight_change", function(event) {

            // Parse the incoming json
            var js = JSON.parse(event.data);

            console.log(js);

            // need to do stuff here to adjust the layer group and move callsigns to/from this layer (and others).
        });


        // if there was an error display an alert.  NEED TO UPDATE THIS TO BE USER FRIENDLY. 
        packetsource.addEventListener("error", function(e) {
            console.log("SSE Error");
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
    var raw = packet.properties.raw;

    // split the packet into the address and information parts
    var address_part = raw.split(":");

    if (address_part && address_part.length > 1) {

        // split the address portion into the source and VIA path list
        var path = address_part[0].split(">")[1];

        if (path && path.length > 1) {

            // create an array listing each stations within the path (minus the first entry).
            var stations = path.replace(/WIDE[0-9]*[-]*[0-9]*|\*/gi, "").replace(/,+$/, "").split(",").slice(1);

            // Return the last entry in our path list.  This should be the last station to transmit this packet (i.e. who we heard the packet from).
            var heardfrom = null;
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
    var currenttime = Date.now() / 1000;

    // Loop through the packetlist array stopping on the first packet that is younger than the agelimit.
    var sliceidx = packetlist.find(function(elem) {

        // the time/date object from the packet
        // time format example:  2023-03-11T14:22:02-07:00
        var elemdate = new Date(elem.properties.tm);

        // the difference in seconds between the current date and the packets date/time
        var delta_secs = Math.floor((currenttime - elemdate) / 1000);
        
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
        var xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {

                // Parse the returned json 
                var js = JSON.parse(this.responseText);

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
    var position_options = {
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
    var geojson = {};

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
    var tm = new Date(Date.now());

    // get the timezone offset in minutes
    var timezonemins = tm.getTimezoneOffset();

    // calcualte the hours in the timezone offset
    var offsetHours = Math.floor(timezonemins / 60);

    // calculate the mins in the timezone mins
    var offsetMins = Math.floor(timezonemins - (offsetHours * 60));

    // Create a time/date string similar to: 2023-03-20T10:33:09-06:00
    var date = tm.getFullYear() + "-" + 
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
function getTrackers() {

    // get the list of trackers
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {

            // Parse the returned json 
            var js = JSON.parse(this.responseText);
            var key, i;
            
            // Loop through each tracker team
            for (key in js) {
                var tactical = js[key].tactical;
                var flightid = js[key].flightid;
                var trackers = js[key].trackers;
                if (trackers && tactical != 'ZZ-Not Active') {
                    var t;

                    // Loop through each tracker assigned to this team
                    for (t in trackers) {

                        // Add this tracker to the tracker list
                        trackerslist[trackers[t].callsign] = trackers[t];

                        // Add the flightid to this tracker in the list.  That way we know what flightid a tracker is ultimately assigned to (through their tactical team)
                        trackerslist[trackers[t].callsign]["flightid"] = flightid;
                    }
                }
            }
        }
    };

    // Connect to the backend server
    xhttp.open("GET", "gettrackers.php", true);

    // Send our request
    xhttp.send();
}

/***********
* getFlights
*
* This function will query the backend for the list of active Flights
***********/
function getFlights() {

    // get the list of flights
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {

            // Parse the returned json 
            var js = JSON.parse(this.responseText);
            var key, i;
            
            // Loop through each flight
            for (key in js) {
                var flight = js[key].flight;
                var desc = js[key].description;
                var active = js[key].active;
                if (active == 't') {
                    var beacons = js[key].beacons;
                    var b;

                    // loop through each beacon listed on this flight.
                    for (b in beacons) {
                        var callsign = beacons[b].callsign;
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
            var f;
            for (f in flightlist) {

                // new GeoJSON layer for this flight
                flightlist[f]["layer"] = new AprsStations().addTo(map);

                // Add this flight to the list of layers that can be toggled on/off the map
                layercontrol.addOverlay(flightlist[f]["layer"], f);

            }

        }
    };

    // Connect to the backend server
    xhttp.open("GET", "getflights.php", true);

    // Send our request
    xhttp.send();
}

/***********
* getFlightPackets
*
* This request all packets from the prior 3hrs for all active flights.  We don't really care about packets from the past for any other station - they
* will come in as the transmit.  For flights, however, we need prior packets in order to plot paths, compute landing predictions, etc..
***********/
function getFlightPackets() {

    // get the list of flights
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {

            // Parse the returned json 
            var js = JSON.parse(this.responseText);
            var key, i;
            var num = Object.keys(js).length;

            if (num > 0)
                statusbox.show("Loading " + num + " flight packets...");
            //statusbox.show("Loading packets...");
            
            // Loop through each geojson packet
            for (key in js) {
                var geojson = js[key];

                if (geojson) {
                    var layer = packetRouter(geojson);
                    
                    if (layer)
                        layer.addData(geojson);
                }
            }

            // If there were packets to load, then report that we're done
            if (num > 0)
                statusbox.show("Finished loading flight packets.");
        }
    };

    // Connect to the backend server
    xhttp.open("GET", "getpackets2.php", true);

    // Send our request
    xhttp.send();
}


/***********
* startup function
*
* This function should be called from $(document).ready....
***********/
function startup() {

    // get the current trackers list
    getTrackers();

    // get the current list of flights 
    getFlights();

    // Get prior packets
    getFlightPackets();

    // setup the map
    setupMap();

    // setup our location source
    setupMyLocation();

    // startup SSE operations.
    setupSSE("ssestream.php");
}


// starting point for everything 
document.addEventListener("DOMContentLoaded", startup);
