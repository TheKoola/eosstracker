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

/* Flight and other APRS object layer creation functions in here for use with Leaflet javascript....
*
* Routines in this file are the primary bulk of display functions that the Mapping screens use.
*
*
* The following external variables (globals) are needed by this JavaScript code.  They are provided by the map.php file.
* ************
*   followfeatureid     // This holds the feature id of an object that we're wanting to "follow" on the map.
*   flightids           // This holds the list of active flights
*   showallstations     // A boolean variable that indicates of all other stations should be visible on the map or not.
*   latitude            // The latitude for the starting center position of the map.
*   longitude           // The longitude for the starting center position of the map.
*   zoom                // The starting zoom level for the map.
* ************
*/

    // Map and display variables
    var map;
    var canvasRender;
    var pathsPane;
    var flightPane;
    var landingPredictionPane;
    var flightTooltipPane;
    var otherTooltipPane;
    var breadcrumbPane;
    var otherStationsPane;
    var lastposition;
    var activeflights = [];
    var globalUpdateCounter = 0;
    var lastsynctime = new Date("1970-01-01T00:00:00");
    var updateTimeout;
    var sidebar;
    var layerControl;
    var osmliberty;
    var osmlibertystyle;
    var osmbright;
    var osmbrightstyle;
    var basic;
    var basicstyle;
    var tilelayer;
    var lookbackPeriod = 180;
    var updateType = "regular";
    var gpsStatusBox;

    // SSE event handler
    let eventsource;

    // these are for the Live Packet Stream tab
    var updateLivePacketStreamEvent;
    var packetdata;
    var currentflight;
    var livePacketStreamState = 0;;
    var processInTransition = 0;

    // callsign 
    var mycallsign;

    // The list of realtime layers 
    var realtimeflightlayers = [];
    var landingpredictionlayers = [];
    var realtimeLayers = [];
    var geturls = [];
    var allStationsLayer;
    var weatherStationsLayer;
    var trackersAtLargeLayer;
    var myPositionLayer;
    var lastUpdateTime = 0;
    var flightList = [];

    // the trackers
    var trackersList = [];

    // flight HUD
    var hud;

    // speed display box
    var speedStatusBox;

    // followme when set to true the map will continuously pan to the user's current location
    var followme = false;

    // is this an apple platform?  So we know to send user's to Google Maps or Apple Maps when clicking coordinate links.
    let isApplePlatform = false;

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


    /***********
    * getChartWidth
    *
    * This function return calculated width of the chart
    ***********/
    function getChartWidth() {
        var w = window.innerWidth;

        if (w < 800) {
            // the screen is small
            w = 280;
        }
        else {
            w = 360; 
        }

        return w;
    }


    /***********
    * getChartHeight
    *
    * This function return calculated height of the chart
    ***********/
    function getChartHeight() {
        var w = window.innerWidth;
        var h;

        if (w < 800) {
            // the screen is small
            h = Math.round(280 / 1.4);
            h = (h < 100 ? 100 : h);
        }
        else {
            h = 250;
        }

        return h;
    }
    
    
    /*********
    * Search for an object within an array of objects
    **********/
    function indexOfObject (the_array, property, value) {
        var i = 0;
        var len = the_array.length;

        for (i = 0; i < len; i++) {
            if (the_array[i][property] === value)
                return i;
        }
        return -1;
    }


    // helper function to craft an HTML string with lat/lon coordinates with a "copy to clipboard" clickable icon for a geojson Point object.
    function createCoordsHTML(geojson) {
        if (!geojson || !geojson.geometry || !geojson.geometry.type || geojson.geometry.type != "Point")
            return false;

        // this stations callsign / name
        let callsign = geojson.properties.callsign;

        // construct a random ID the copyToClipboard function can use to identify the coords string.
        let id = (Math.random() + 1).toString(36).split(".")[1].toUpperCase();

        let lat = (geojson.geometry.coordinates[1] * 10 / 10).toFixed(4);
        let lon = (geojson.geometry.coordinates[0] * 10 / 10).toFixed(4);

        // form up the URL that will take the user to their specific map platform for directions to these coordinates
        let URL;
        if (isApplePlatform)
            URL = "https://maps.apple.com/?q=" + callsign + "&ll=" + lat + "%2C" + lon;
        else
            URL = "https://www.google.com/maps/search/?api=1&query=" + lat + "%2C" + lon;

        let html = "<br>Coords: " + (URL ? "<a target=\"_blank\" href=\"" + URL + "\">" : "") + "<span id=\"" + id + "-coords\">" + lat + ", " + lon + "</span>" + (URL ? "</a>" : "")
            + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">";

        return html;
    }

    /*********
    * Color settings for styling active flights and their paths
    **********/
    var ascendingColorMap = [];
    var descendingColorMap = [];
    var ascending_colorsets = [ 
        { color : 'hotpink', markerColor: 'deeppink'},
        { color : 'green', markerColor: 'darkgreen'},
        { color : 'chocolate', markerColor: 'saddlebrown'},
        { color : 'olivedrab', markerColor: 'darkolivegreen'},
        { color : 'red', markerColor: 'darkred'},
        { color : '#00e600',   markerColor: '#009900'}
    ];
    var descending_colorsets = [ 
        { color : 'cadetblue', markerColor: 'steelblue'},
        { color : 'darkorchid', markerColor : 'purple'},
        { color : 'slateblue', markerColor: 'darkslateblue'},
        { color : 'mediumpurple', markerColor : 'indigo'},
        { color : 'blue',       markerColor: 'darkblue'},
        { color : 'royalblue',   markerColor: 'blue'}
    ];
    var colorIndex = 0;

    /*********
    * This function is for styling the active flight paths/tracks 
    **********/
    function activeFlightStyle (feature) {
        var localstyle;
        var id = feature.properties.id;
        
        var ascending_color = colorIndex;
        var descending_color = colorIndex;

        if (feature.properties) {

            // what sort of object is this?
            if ( ! feature.properties.objecttype)
                return {};

            var objecttype = feature.properties.objecttype;                    

            if (objecttype == "balloonpath" ) {
                var i = 0;
                var fid = (feature.properties.flightid ? feature.properties.flightid : "noflightid");
                var ascendingColorIndex = (ascendingColorMap.length > 0 ? indexOfObject(ascendingColorMap, "flightid", fid) : -1);
                var descendingColorIndex = (descendingColorMap.length > 0 ? indexOfObject(descendingColorMap, "flightid", fid) : -1);

                if (ascendingColorIndex > -1)
                    ascending_color = ascending_colorsets[ascendingColorMap[ascendingColorIndex].coloridx].color;
                else {
                    i = 1;
                    ascendingColorMap.push({ flightid : fid, coloridx : ascending_color});
                    ascending_color = ascending_colorsets[ascending_color].color;
                }
                if (descendingColorIndex > -1)
                    descending_color = descending_colorsets[descendingColorMap[descendingColorIndex].coloridx].color;
                else  {
                    i = 1;
                    descendingColorMap.push({ flightid : fid, coloridx : descending_color });
                    descending_color = descending_colorsets[descending_color].color;
                }


                if (feature.properties.ascending) {
                    if (feature.properties.ascending == "true")
                        localstyle = { color : ascending_color, pane: 'pathsPane', weight: 2 };
                    else if (feature.properties.ascending == "false")
                        localstyle = { color : descending_color, pane: 'pathsPane', weight: 2 };
                }
                colorIndex += i;
                if (colorIndex > (ascending_colorsets.length - 1))
                    colorIndex = 0;
            }
            else
                localstyle = {};
        }
        return localstyle;
    }



    /********
    * createActiveFlightsLayer
    *
    * This function is for creating a new realtime layer object.
    *********/
    function createActiveFlightsLayer(url, container, interval, fid) {
        return L.realtime(url, {
            interval: interval,
            removeMissing: false,
            start: false,
            container: container,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            style:  activeFlightStyle,
            name: fid,
            onEachFeature: function (feature, layer) {
                var html = "";
                var objecttype = "";
                if (typeof(feature.properties.objecttype != "undefined"))
                    objecttype = feature.properties.objecttype;

                if (feature.geometry.type == "Point") {
                    var mapcenter = map.getCenter();
                    var mapzoom = map.getZoom(); 
                    var id = feature.properties.id;
 
                    // If this is a balloon object then we want a hyperlink in the popup and update the gauges.
		            if (objecttype == "balloon") {
        			    html = "<a target=\"_blank\" href=\"map.php" + 
                            "?followfeatureid=" + feature.properties.id + 
	        		        "&latitude=" + feature.geometry.coordinates[1] + 
		        	        "&longitude=" + feature.geometry.coordinates[0] + 
			                "&zoom=" + mapzoom + "\">" +
        			        "<strong>" + feature.properties.callsign + "</strong></a>";

                        // Update the telemetry and other sidebar content for this flight
                        updateSideBar(feature);

                        // Update the HUD with the telemetry from this feature 
                        if (hud)
                            hud.update(feature);
	        	    }
                    // ...if it's NOT a balloon (i.e. a path, or burst, or prior beacon location then we don't want a hyperlink in the popup.
                    else 
		            	html = "<strong>" + feature.properties.callsign + "</strong>";

                    // Update the popup content to include a number of balloon specific items
       		        html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
                        (typeof(feature.properties.temperature) == "undefined" ? "" : (feature.properties.temperature != "" ? "<br><font class=\"commentstyle\">Temperature:  " + (Math.round(feature.properties.temperature * 100) / 100).toFixed(2) + "&deg; F</font>" : "")) + 
                        (typeof(feature.properties.pressure) == "undefined" ? "" : (feature.properties.pressure != "" ? "<br><font class=\"commentstyle\">Pressure:  " + (Math.round(feature.properties.pressure * 10000) / 10000).toFixed(4) + " atm</font>" : "")) + 
		                (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		                (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + 
                            (feature.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +

                        createCoordsHTML(feature) +

		                (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time.split(' ')[1].split('.')[0] : ""));

                    // bind the popup content to a popup object using our predefined CSS style
    		        layer.bindPopup(html, {className:  'myPopupStyle'} );


                    var mappane;
                    var tipclass;

                    if (objecttype == "balloon") {
                        mappane = "flightTooltipPane";
                        tipclass = "flightTooltipLabelStyle";
                    }
                    else if (objecttype == "balloonmarker") {
                        mappane = "flightTooltipPane";
                        tipclass = "flightBreadCrumbStyle";
                    }
                    else {
                        mappane = "otherTooltipPane";
                        tipclass = "myTooltipLabelStyle";
                    }


                    // if this object has a tooltip or label defined...
                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "")
                                layer.bindTooltip(feature.properties.label, { className:  tipclass,  permanent:true, direction: "center",  opacity: .9, pane: mappane }).openTooltip();
                        }    
                        else {
                            if (feature.properties.tooltip != "")
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: mappane }).openTooltip();
                        }
                    }
                    
                }
           },

           // use this function to create the custom icons for the various objects
           pointToLayer:  function (feature, latlon) {
               var filename;
               var id = feature.properties.id;

               // Determine what the APRS symbol is for this object, then determine path to the corresponding icon file.
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";


               
               // For balloon markers (i.e. the breadcrumbs within their path) create a Leaflet marker for each one...
               if (feature.properties.objecttype == "balloonmarker") {
                   // default color for a balloon marker
                   var markercolor = 'black';

                   // if the balloon is ascending or descending use a different color combo (markers + path) for each leg (i.e. up or down) of the flight.
                   if (feature.properties.ascending) {
                       if (feature.properties.ascending == "true") {
                           var idx = indexOfObject(ascendingColorMap, "flightid", feature.properties.flightid);
                           var colorindex = ascendingColorMap[idx].coloridx;
                           markercolor = ascending_colorsets[colorindex].markerColor;
                       }
                       else {
                           var idx = indexOfObject(descendingColorMap, "flightid", feature.properties.flightid);
                           var colorindex = descendingColorMap[idx].coloridx;
                           markercolor = descending_colorsets[colorindex].markerColor;
                       }
                   } 
    
                   if (feature.properties.label)
                       var markercolor = 'black';

		           return L.circleMarker(latlon, { radius: 3, fillColor: markercolor, pane: "breadcrumbPane", fillOpacity: .9, stroke : false, fill: true });
               }

               // ...for everything else, we create the standard APRS icon for this object based on it's advertised "symbol"
               else {
                   var iconsize = Math.trunc(parseInt(typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10)); 
                   var iconsize_center = Math.trunc(iconsize/2);
                   var tipanchor = iconsize_center + 10;
                   if (feature.properties.objecttype == "balloon")
                       tipanchor += 8;

	    	       var myIcon = L.icon({
	    	           iconUrl: filename,
        		       iconSize: [iconsize, iconsize],
        		       iconAnchor: [iconsize_center, iconsize_center], 
        		       popupAnchor: [0, -iconsize_center],
        		       tooltipAnchor: [0, tipanchor]
        		   }); 

                   var mappane = "otherStationsPane";
                   if (feature.properties.objecttype == "balloon")
                       mappane = "flightPane";

		           return L.marker(latlon, { icon: myIcon, pane: mappane, riseOnHover: true });
               } 
           }
        }).on('update', function(ev) { updateActiveFlights(ev, this); });
    }
 


    /************
     * updateActiveFlights
     *
     * This function is called everytime a realtimelayer object is updated.
     ************/
    function updateActiveFlights(ev, realtimelayer) {
        var updatelist = [];
        var mapcenter = map.getCenter();
        var mapzoom = map.getZoom(); 

        //updatelist.push({"existing" : existing_id.properties.callsign, "existing_time": existing_id.properties.time, "new":item.properties.callsign, "new_time": item.properties.time });

        for (var key in ev.update) {
            var item = ev.update[key];
            var id = item.properties.id;
            var layer = realtimelayer.getLayer(id);
            var html = "";


            // if this is a balloon object, then update it's html properties with a hyperlink...
            if (item.properties.objecttype == "balloon") {
                html = "<a target=\"_blank\" href=\"map.php" +
                      "?followfeatureid=" + item.properties.id + 
                      "&latitude=" + item.geometry.coordinates[1] + 
                      "&longitude=" + item.geometry.coordinates[0] + 
                      "&zoom=" + mapzoom + "\">" +
                      "<strong>" + item.properties.callsign + "</strong></a>";

                // Update the telemetry and other sidebar content for this flight
                updateSideBar(item);

                // Update the HUD with the telemetry from this feature 
                if (hud)
                    hud.update(item);
            }
            //...otherwise, we don't want a hyper link because this is a path of some sort.
            else 
                html = "<strong>" + item.properties.callsign + "</strong>";

            // Update the popup content to include a number of balloon specific items
            html = html + (typeof(item.properties.comment) == "undefined" ? "" : (item.properties.comment != "" ? "<br><font class=\"commentstyle\">" + item.properties.comment + "</font>" : "")) + 
                (typeof(item.properties.temperature) == "undefined" ? "" : (item.properties.temperature != "" ? "<br><font class=\"commentstyle\">Temperature:  " + (Math.round(item.properties.temperature * 100) / 100).toFixed(2) + "&deg; F</font>" : "")) + 
                (typeof(item.properties.pressure) == "undefined" ? "" : (item.properties.pressure != "" ? "<br><font class=\"commentstyle\">Pressure:  " + (Math.round(item.properties.pressure * 10000) / 10000).toFixed(4) + " atm</font>" : "")) + 
                (typeof(item.properties.altitude) == "undefined" ? "" : (item.properties.altitude != 0 && item.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (item.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
                (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency +
                            (item.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +
                createCoordsHTML(item) +
                (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time.split(' ')[1].split('.')[0] : ""));

            layer.setPopupContent(html, { className: 'myPopupStyle' });
            //updatelist.push(item.properties.callsign);
 
            // Set the icon for this object.  We do this for two reasons:  1) user might have changed theh iconsize, and 2) the APRS station might have changed it's symbol.
            if (item.properties.objecttype != "balloonmarker" && typeof(item.properties.symbol) != "undefined" && typeof(item.properties.iconsize) != "undefined") {
               var filename;
               if (item.properties.symbol.startsWith('\\') || item.properties.symbol.startsWith('\/') || item.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[item.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + item.properties.symbol.charAt(0) + "-" + symbols["\\" + item.properties.symbol.charAt(1)].tocall + ".png";

               var iconsize = Math.trunc(parseInt(typeof(item.properties.iconsize) == undefined ? 24 : item.properties.iconsize * 10 / 10)); 
               var iconsize_center = Math.trunc(iconsize/2);
               var tipanchor = iconsize_center + 10;
               if (item.properties.objecttype == "balloon")
                   tipanchor += 8;

		       var myIcon = L.icon({
		           iconUrl: filename,
    		       iconSize: [iconsize, iconsize],
    		       iconAnchor: [iconsize_center, iconsize_center], 
    		       popupAnchor: [0, -iconsize_center],
    		       tooltipAnchor: [0, tipanchor]
    		   }); 
               layer.setIcon(myIcon);
            }

            // Check if we should update the tooltip contents...if this object has a tooltip or label defined...
            if (item.properties.tooltip && layer.getTooltip()) {
                if (item.properties.label) {
                    if (item.properties.label != "") {
                        layer.setTooltipContent(item.properties.label);
                    }
                }
                else {
                    if (item.properties.tooltip != "") 
                        layer.setTooltipContent(item.properties.tooltip);
                }
            }


            // If we're following a specific station then pan the map to its location
            if (followfeatureid && followfeatureid != "") {
                if (followfeatureid.localeCompare(item.properties.id) == 0) {
                    map.panTo({ lat: item.geometry.coordinates[1], lng: item.geometry.coordinates[0] });
                }
            }
            
        }

    }


    /************
     * parseDate
     *
     * This function will parse a date string from PostgesQL and return a new Date object
     ************/
    function parseDate(d) {

        var thisdate = null;

        if (typeof(d) != "undefined") {

            // Only process this if the string provided is of proper length
            if (d.length > 18) {

                // Split the datetime on the space.  ex.  2020-05-14 18:57:29.8292
                var datetime = d.split(' ');

                if (datetime.length == 2) {

                    // Split out the date portion
                    var dateparts = datetime[0].split('-');

                    if (dateparts.length == 3) {
                        var year = dateparts[0];
                        var month = dateparts[1] - 1;
                        var day = dateparts[2];

                        // Split out the time portion
                        var timeparts = datetime[1].split(':');

                        if (timeparts.length == 3) {
                            var hour = timeparts[0];
                            var minute = timeparts[1];
                            var second = timeparts[2];
                            var millisecond = 0;

                            // Account for milliseconds if the time value includes it.
                            if (timeparts[2].indexOf(".") !== -1) {
                                millisecond = timeparts[2].split('.')[1];
                                second = timeparts[2].split('.')[0];
                            }

                            // new Date object
                            thisdate = new Date(year, month, day, hour, minute, second, millisecond);
                        }
                    }
                }
            }
        }

        return thisdate;
    }


    /************
     * updateSideBar
     *
     * This function will update the sidebar data, gauges, etc. for a flight
     ************/
    function updateSideBar(feature) {

        // Make sure we've got valid values for this packet before we try to update the gauges and the sidebar data
        if (typeof(feature.properties.altitude)    != "undefined" && 
            typeof(feature.properties.bearing)     != "undefined" &&
            typeof(feature.properties.speed)       != "undefined" &&
            typeof(feature.properties.verticalrate)!= "undefined" &&
            typeof(feature.properties.flightid)    != "undefined" &&
            typeof(feature.properties.callsign)    != "undefined" &&
            typeof(feature.properties.time)        != "undefined" &&
            typeof(feature.properties.source)      != "undefined" &&
            typeof(feature.geometry.coordinates)   != "undefined" &&
            typeof(feature.properties.myheading)   != "undefined" &&
            typeof(feature.properties.rel_angle)   != "undefined" &&
            typeof(feature.properties.rel_bearing) != "undefined" &&
            typeof(feature.properties.rel_distance)!= "undefined") {


            // The flightid
            var flightid = feature.properties.flightid;

            // Get the timestamp for the last packet
            var lastpacket = $("#" + flightid + "_sidebar").data().lastpacket;

            // The time stamp for "this" packet
            var thispacket = parseDate(feature.properties.time);

            // If this is newer info that what's currently displayed on the sidebar, then we update...
            if (thispacket > lastpacket) {

                // Update the lastpacket timestamp with the time from this packet.
                $("#" + flightid + "_sidebar").data("lastpacket", thispacket);

                // Update the feature...we want to save this so other parts of the web app can get to the latest telemetry for a given flight
                $("#" + flightid + "_sidebar").data("feature", feature);

                var myheading = feature.properties.myheading * 1.0;
                var rel_bearing = feature.properties.rel_bearing * 1.0;
                var bearing = feature.properties.bearing * 1.0;
                var angle = feature.properties.rel_angle * 1.0;
                var distance = feature.properties.rel_distance * 1.0;
                var lat = feature.geometry.coordinates[1] * 1.0;
                var lon = feature.geometry.coordinates[0] * 1.0;
                var alt = feature.properties.altitude * 1.0;
                var spd = feature.properties.speed * 1.0;
                var vrate = feature.properties.verticalrate * 1.0;


                //******** start: Update the flight coordinates fields **********
                var celement = "#" + flightid + "_relativeballooncoords";
                $(celement).text(lat.toFixed(4) + ", " + lon.toFixed(4));

                //******** end: Update the flight coordinates fields **********



                //******** start: Update relative position fields and gauges **********
                updateRelativePosition(lastposition, flightid);

                //******** end: Update relative position fields and gauges **********


                //******** start: Update the ttl value **********
                var ttl = "";
                var ttl_string = "n/a";
                if (typeof(feature.properties.ttl) != "undefined") {
                    if (feature.properties.ttl != "") {
                        
                        // Update the lastpacket timestamp with the time from this packet.
                        $("#" + flightid + "_sidebar").data("ttl", feature.properties.ttl * 1.0);

                        // The string used to update the TTL field on the map
                        ttl_string = feature.properties.ttl + " mins";
                    }
                    var elem = "#" + flightid + "_ttl";
                    $(elem).text(ttl_string);
                }
                //******** end: Update the ttl value **********


                //******** start: Update the telemetry gauges for this flight **********
                // The telemetry values
                var thealtitude = Math.round(alt);
                var theheading = Math.round(bearing);
                var thespeed = Math.round(spd);
                var thevertrate = Math.round(vrate);

                // The element names for displaying the telemetry
                var altitudeValue = "#" + flightid + "_altitudevalue";
                var verticalRateValue = "#" + flightid + "_verticalratevalue";
                var balloonHeadingValue = "#" + flightid + "_headingvalue";
                var speedValue = "#" + flightid + "_speedvalue";

                // Update altitude, but only if valid values...
                if (thealtitude > 0) {
                    $(altitudeValue).data("altimeter").setAltitude(thealtitude);
                    $(altitudeValue).text(thealtitude.toLocaleString());
                }
                else
                    $(altitudeValue).text("NaN");

                // Update vertical rate, but only if valid values...
                if (thevertrate < 50000 && thevertrate > -50000) {
                    $(verticalRateValue).data("variometer").setVario(thevertrate/1000);
                    $(verticalRateValue).text(thevertrate.toLocaleString());
                }
                else
                    $(verticalRateValue).text("NaN");

                // Update heading and speed
                $(balloonHeadingValue).data("heading").setHeading(theheading);
                $(speedValue).data("airspeed").setAirSpeed(thespeed);
                $(balloonHeadingValue).text(theheading);
                $(speedValue).text(thespeed);
                //******** end: Update the telemetry gauges for this flight **********
                
            }
        }
    }


    /*********
    * updateRelativePosition
    *
    * This is called from updateMyLocation and updateSideBar() to update the relative position fields and gauges for each flight
    * every update (every ~5 secs) and updateSideBar() is called whenever new packets from the flight are available.
    **********/
    function updateRelativePosition(featurecollection, fid) {

        // by default we'll loop through each flight in the flightList
        var theflightlist = flightList;

        // If the fid parameter is given, then set the flightlist to just that flightid
        if (typeof(fid) != "undefined") 
            if (fid) {
                theflightlist = [{"flightid" : fid}];
            }

        // Determine the geojson feature from the provided arguments
        var positionJSON = null;
        if (featurecollection && featurecollection.type) {
            if (featurecollection.type == "FeatureCollection") {
                if (featurecollection.features)
                    positionJSON = featurecollection.features[0];
            }
            else if (featurecollection.type == "Feature") {
                positionJSON = featurecollection;
            }
        }

        // if there isn't a local position, then we can't calculate relative positions to flights.
        if (!positionJSON) {
            return;
        }

        // Loop through each flight updating relative position stuffs
        theflightlist.forEach(function(f) {

            // the flightid
            var flightid = f.flightid;

            // Get the latest geoJson feature for this flight
            var feature = $("#" + flightid + "_sidebar").data().feature;

            // This is the distance and bearing field
            var delement = "#" + flightid + "_relativepositiondistance";

            // These are the relative position dials
            var eelement = "#" + flightid + "_relativeelevationangle";
            var evelement = "#" + flightid + "_relativeelevationanglevalue";
            var hvelement = "#" + flightid + "_relativebearingvalue";
            var mhvelement = "#" + flightid + "_myheadingvalue";

            // If telemetry exists for the flight and we have a position from the GPS, then try and update the relative position fields/gauges
            if (feature && positionJSON) {

                // the GPS position and heading
                var gps_heading = positionJSON.properties.bearing * 1.0;
                var gps_lat = positionJSON.geometry.coordinates[1] * 1.0;
                var gps_lon = positionJSON.geometry.coordinates[0] * 1.0;
                var gps_alt = positionJSON.properties.altitude * 1.0;

                // The flight's last location
                var flight_lat = feature.geometry.coordinates[1] * 1.0;
                var flight_lon = feature.geometry.coordinates[0] * 1.0;
                var flight_alt = feature.properties.altitude * 1.0;

                // The distance in miles from the GPS location to the flight's last known location
                var dist = distance(gps_lat, gps_lon, flight_lat, flight_lon);

                // Calculate the elevation angle in degrees between the flight and the GPS location
                var ratio = (flight_alt - gps_alt) / (dist * 5280);
                var angle = 0;
                if (ratio != 0) 
                    angle = Math.floor(180 * Math.atan(ratio) / Math.PI);

                // Calculate the azimuth angle in degrees from North between the GPS and the flight's last known location
                var rel_bearing = azimuth(gps_lat, gps_lon, flight_lat, flight_lon);

                // Determine the relative bearing based on GPS heading and the bearing to the flight
                // Note:  the relative bearing assumes the front of vehicle is considered "north"...assuming the GPS is in a mobile unit.
                var relativeBearing = rel_bearing - gps_heading;
                if (relativeBearing < 0)
                    relativeBearing = 360 + relativeBearing;

                // Now update the two relative position gauges
                $(hvelement).data("relativebearing").setRelativeHeading(gps_heading.toFixed(0), rel_bearing.toFixed(0));
                $(evelement).data("relativeangle").setElevationAngle(angle.toFixed(0));

                // Now update the text values
                $(delement).html(dist.toFixed(2) + " mi" + " @ " + rel_bearing.toFixed(0) + "&#176;");
                $(evelement).text(angle.toFixed(0));
                $(hvelement).text(relativeBearing.toFixed(0));
                $(mhvelement).text(gps_heading.toFixed(0));
            }
            else {
                // Without a valid GPS position or a last flight location, then just blank out the "values" fields on the sidebar and set the
                // relative position dials to 0's.
                $(hvelement).data("relativebearing").setRelativeHeading(0, 0);
                $(evelement).data("relativeangle").setElevationAngle(0);
                $(delement).html("n/a");    
                $(evelement).text("--");
                $(hvelement).text("--");
                $(mhvelement).text("--");
            }
        });
    }


    /***********
    * azimuth 
    *
    * This function will return the azimuth bearing in degrees from North between two points
    * Note:  this assumes a flat earth model where the distances between two points is relatively small (ex. a few hundred miles or less).
    ***********/
    function azimuth(lat1, lon1, lat2, lon2) {

        // The difference in latitude and longitude
        var dx = lon2 - lon1;
        var dy = lat2 - lat1;

        // the azimuth angle
        var azimuth;

        if (dx > 0) 
            azimuth = (Math.PI / 2) - Math.atan(dy/dx)
        else if (dx < 0) 
            azimuth = (3 * Math.PI / 2) - Math.atan(dy/dx)
        else if (dy > 0) 
            azimuth = 0
        else if (dy < 0) 
            azimuth = Math.PI
        else
            return null;

        // convert to degrees before returning
        return azimuth * 180 / Math.PI;
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


    /*********
    * this function is for styling the predicted flight paths/tracks 
    **********/
    function predictedFlightPathStyle (feature) {
        var localstyle;
        var id = feature.properties.id;

        if (feature.properties) {

            // what sort of object is this? 
            if ( ! feature.properties.objecttype)
                return {};

            var objecttype = feature.properties.objecttype;                    

            if (objecttype == "flightpredictionpath") 
                localstyle = { dashArray: "2 4", weight: 1, color : 'navy', pane: 'pathsPane' };
            else
                localstyle = {};
        }
        return localstyle;
    }



    /********
    * This function is for creating a new realtime layer object.
    *********/
    function createFlightPredictionLayer(url, container, interval) {
        return L.realtime(url, {
            interval: interval,
            container: container,
            removeMissing: false,
            start: false,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            style:  predictedFlightPathStyle,
            onEachFeature: function (feature, layer) {
                var html = "";
                var objecttype = feature.properties.objecttype;
  

                if (objecttype == "flightprediction" || objecttype == "burstlocation" || objecttype == "balloonmarker") {
                    var id = feature.properties.id;


		            html = "<strong>" + feature.properties.callsign + "</strong>";
        		    html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
	        		      (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		        	      (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + 
                            (feature.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +

                        createCoordsHTML(feature) +

        			      (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time : ""));

	        	    layer.bindPopup(html, {className:  'myPopupStyle'} );

                    // If this object has a tooltip or label defined...
                    // ...if this is a balloonmarker (i.e. the breadcrumbs within the path), then we need to specify an offset for the tooltip.  That's because we'll use a "circleMarker" object 
                    // instead of a bonified marker with custom icon.
                    var theoffset = [0, 0];
                    if (feature.properties.objecttype == "balloonmarker")
                        theoffset = [0, -12];


                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "")
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", offset: theoffset, opacity: .9, pane: "otherTooltipPane"}).openTooltip();
                        }    
                        else {
                            if (feature.properties.tooltip != "")
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: "otherTooltipPane"}).openTooltip();
                        }
                    }
                }
           },
           // use this function to create the custom icons for the various objects
           pointToLayer:  function (feature, latlon) {
               var filename;
               var id = feature.properties.id;
               var markercolor = 'navy';

               // Determine what the APRS symbol is for this object, then determine path to the corresponding icon file.
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x'))
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";
               else
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";


               // For balloon markers (i.e. the breadcrumbs within their path) create a Leaflet marker for each one...
               if (feature.properties.objecttype == "balloonmarker") {
                   var cm = L.circleMarker(latlon, { radius: 3, fillColor: markercolor, pane: "breadcrumbPane", fillOpacity: .9, stroke : false, fill: true });

		           return cm;
               }
               
               // ...for everything else, we create the standard APRS icon for this object based on it's advertised "symbol"
               else {
                   var iconsize = Math.trunc(parseInt(typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10)); 
                   var iconsize_center = Math.trunc(iconsize/2);
                   var tipanchor = iconsize_center + 10;

	    	       var myIcon = L.icon({
	    	           iconUrl: filename,
        		       iconSize: [iconsize, iconsize],
        		       iconAnchor: [iconsize_center, iconsize_center], 
        		       popupAnchor: [0, -iconsize_center],
        		       tooltipAnchor: [0, tipanchor]
        		   }); 
                   return L.marker(latlon, { icon: myIcon, pane: "otherStationsPane", riseOnHover: true });
               } 
           }
        }).on('update', function(ev) { updateFlightPredictions(ev, this); });
    }


    /************
     * updateFlightPredictions
     *
     * This function is called everytime a realtimelayer object is updated.
     ************/
    function updateFlightPredictions(ev, realtimelayer) {
        for (var key in ev.update) {
            var item = ev.update[key];
            var id = item.properties.id;
            var layer = realtimelayer.getLayer(id);
            var html = "";

            html = "<strong>" + item.properties.callsign + "</strong>";
	    html = html + (typeof(item.properties.comment) == "undefined" ? "" : (item.properties.comment != "" ? "<br><font class=\"commentstyle\">" + item.properties.comment + "</font>" : "")) + 
		      (typeof(item.properties.altitude) == "undefined" ? "" : (item.properties.altitude != 0 && item.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (item.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		      (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + 
                            (item.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +

              createCoordsHTML(item) +

		      (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time : ""));

            // Update the popup content
            layer.setPopupContent(html, { className: 'myPopupStyle' });

            // Set the icon for this object.  We do this for two reasons:  1) user might have changed theh iconsize, and 2) the APRS station might have changed it's symbol.
            if (item.properties.objecttype != "balloonmarker" && typeof(item.properties.symbol) != "undefined" && typeof(item.properties.iconsize) != "undefined") {
               var filename;
               if (item.properties.symbol.startsWith('\\') || item.properties.symbol.startsWith('\/') || item.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[item.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + item.properties.symbol.charAt(0) + "-" + symbols["\\" + item.properties.symbol.charAt(1)].tocall + ".png";

               var iconsize = Math.trunc(parseInt(typeof(item.properties.iconsize) == undefined ? 24 : item.properties.iconsize * 10 / 10)); 
               var iconsize_center = Math.trunc(iconsize/2);
               var tipanchor = iconsize_center + 10;

		       var myIcon = L.icon({
		           iconUrl: filename,
    		       iconSize: [iconsize, iconsize],
    		       iconAnchor: [iconsize_center, iconsize_center], 
    		       popupAnchor: [0, -iconsize_center],
    		       tooltipAnchor: [0, tipanchor]
    		   }); 
               layer.setIcon(myIcon);
            }

            // Check if we should update the tooltip contents...if this object has a tooltip or label defined...
            if (item.properties.tooltip && layer.getTooltip()) {
                if (item.properties.label) {
                    if (item.properties.label != "")
                        layer.setTooltipContent(item.properties.label);
                }
                else {
                    if (item.properties.tooltip != "")
                        layer.setTooltipContent(item.properties.tooltip);
                }
            }
        }
    }

    /*********
    * this function is for styling the landing prediction paths/tracks for the pre-cutdown predictions
    **********/

    function landingPredictionStyleCutdown (feature) {
        var localstyle;
        var id = feature.properties.id;

        if (feature.properties) {

            // what sort of object is this?  
            if ( ! feature.properties.objecttype)
                return {};

            var objecttype = feature.properties.objecttype;                    
            if (objecttype == "landingpredictionpath") 
                localstyle = { dashArray: "2 4", weight: 1, color : 'magenta', pane: 'pathsPane' };
            else if (objecttype == "landingpredictionflightpath") 
                localstyle = { dashArray: "3 6", weight: 2, color : 'red', pane: 'pathsPane' };
            else
                localstyle = {};
        }
        return localstyle;
    }
    /*********
    * this function is for styling the landing prediction paths/tracks 
    **********/

    function landingPredictionStyle (feature) {
        var localstyle;
        var id = feature.properties.id;

        if (feature.properties) {

            // what sort of object is this?  
            if ( ! feature.properties.objecttype)
                return {};

            var objecttype = feature.properties.objecttype;                    
            if (objecttype == "landingpredictionpath") 
                localstyle = { dashArray: "2 4", weight: 1, color : 'magenta', pane: 'pathsPane' };
            else if (objecttype == "landingpredictionflightpath") 
                localstyle = { dashArray: "3 6", weight: 2, color : 'darkslategray', pane: 'pathsPane' };
            else
                localstyle = {};
        }
        return localstyle;
    }


    /********
    * createLandingPredictionsLayer
    *
    * This function is for creating a new realtime layer object.
    *********/
    function createLandingPredictionsLayer(url, container, interval, fid, styleFunction) {
        return L.realtime(url, {
            interval: interval,
            container: container,
            removeMissing: false,
            start: false,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            name: fid,
            style:  (typeof(styleFunction) == "undefined" ? landingPredictionStyle : styleFunction),
            onEachFeature: function (feature, layer) {
                var html = "";
                var objecttype = feature.properties.objecttype;

                if (objecttype == "landingprediction" || objecttype == "balloonmarker") {
                    var id = feature.properties.id;
		            html = "<strong>" + feature.properties.callsign + "</strong>";
        		    html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
	  		      (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
			      (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency +
                            (feature.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +

                  createCoordsHTML(feature) +

			      (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time.split(' ')[1].split('.')[0] : ""));


                    // Popup for the landing prediction point
		            layer.bindPopup(html, {className:  'myPopupStyle'} );

                    var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 

                    // If this object has a tooltip or label defined...
                    // ...if this is a balloonmarker (i.e. the breadcrumbs within the path), then we need to specify an offset for the tooltip.  
                    // That's because we'll use a "circleMarker" object instead of a bonified marker with custom icon.
                    var theoffset = [0, 0];
                    var mappane = "otherTooltipPane";
                    if (feature.properties.objecttype == "balloonmarker") {
                        theoffset = [0, -12];
                        mappane = "breadcrumbPane";
                    }
                    else 
                        mappane = "otherTooltipPane";

                    // if this object has a tooltip or label defined...
                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "") {
                                if (feature.properties.label.indexOf("<br>") !== -1)
                                    theoffset = [0, -7];
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", offset: theoffset, opacity: .9, pane: mappane}).openTooltip();
                            }
                        }    
                        else {
                            if (feature.properties.tooltip != "")
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: mappane}).openTooltip();
                        }
                    }
                }
           },
           pointToLayer:  function (feature, latlon) {
               var filename;
               var markercolor = 'gray';
               var id = feature.properties.id;
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";


               // For balloon markers (i.e. the breadcrumbs within their path) create a Leaflet marker for each one...
               if (feature.properties.objecttype == "balloonmarker") {
                   var cm = L.circleMarker(latlon, { radius: 3, fillColor: markercolor, pane: "breadcrumbPane", fillOpacity: .9, stroke : false, fill: true });

		           return cm;
               }

               // ...for everything else, we create the standard APRS icon for this object based on it's advertised "symbol"
               else {
                   var iconsize = Math.trunc(parseInt(typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10)); 
                   var iconsize_center = Math.trunc(iconsize/2);
                   var tipanchor = iconsize_center + 10;

                   var myIcon = L.icon({
                       iconUrl: filename,
                       iconSize: [iconsize, iconsize],
                       iconAnchor: [iconsize_center, iconsize_center], 
                       popupAnchor: [0, -iconsize_center],
                       tooltipAnchor: [0, tipanchor]
                   }); 

                   return L.marker(latlon, { icon: myIcon, pane: "landingPredictionPane" });
               }
           }
        }).on('update', function(ev) { updateLandingPredictions(ev, this); });
    }



    /************
     * updateLandingPredictions
     *
     * This function is called everytime a realtimelayer object is updated.
     ************/
    function updateLandingPredictions(ev, realtimelayer) {
        var updatelist = [];

        for (var key in ev.update) {
            var item = ev.update[key];
            var id = item.properties.id;
            var layer = realtimelayer.getLayer(id);
            var html = "";

            html = "<strong>" + item.properties.callsign + "</strong>";
	    html = html + (typeof(item.properties.comment) == "undefined" ? "" : (item.properties.comment != "" ? "<br><font class=\"commentstyle\">" + item.properties.comment + "</font>" : "")) + 
		      (typeof(item.properties.altitude) == "undefined" ? "" : (item.properties.altitude != 0 && item.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (item.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		      (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + 
                            (item.properties.frequency == "ext radio" ? "" : "MHz") : "" )) +
              createCoordsHTML(item) +
		      (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time.split(' ')[1].split('.')[0] : ""));

            // Update the popup content
            layer.setPopupContent(html, { className: 'myPopupStyle' });
            //updatelist.push(item.properties.callsign);

            // Set the icon for this object.  We do this for two reasons:  1) user might have changed theh iconsize, and 2) the APRS station might have changed it's symbol.
            if (item.properties.objecttype != "balloonmarker" && typeof(item.properties.symbol) != "undefined" && typeof(item.properties.iconsize) != "undefined") {
               var filename;
               if (item.properties.symbol.startsWith('\\') || item.properties.symbol.startsWith('\/') || item.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[item.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + item.properties.symbol.charAt(0) + "-" + symbols["\\" + item.properties.symbol.charAt(1)].tocall + ".png";

               var iconsize = Math.trunc(parseInt(typeof(item.properties.iconsize) == undefined ? 24 : item.properties.iconsize * 10 / 10)); 
               var iconsize_center = Math.trunc(iconsize/2);
               var tipanchor = iconsize_center + 10;

		       var myIcon = L.icon({
		           iconUrl: filename,
    		       iconSize: [iconsize, iconsize],
    		       iconAnchor: [iconsize_center, iconsize_center], 
    		       popupAnchor: [0, -iconsize_center],
    		       tooltipAnchor: [0, tipanchor]
    		   }); 
               layer.setIcon(myIcon);
            }

            // Check if we should update the tooltip contents...if this object has a tooltip or label defined...
            if (item.properties.tooltip && layer.getTooltip()) {
               if (item.properties.label) {
                   if (item.properties.label != "")
                       layer.setTooltipContent(item.properties.label);
               }
               else {
                   if (item.properties.tooltip != "")
                       layer.setTooltipContent(item.properties.tooltip);
               }
            } 
        }
    }


    /********
    * This function is for creating a new realtime layer object.
    *********/
    function createRealtimeLayer(url, startvalue, container, interval, styleFunction) {
        return L.realtime(url, {
            removeMissing: false,
            start: startvalue, 
            interval: interval,
            container: container,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            style:  styleFunction,
            onEachFeature: function (feature, layer) {
                var html = "";

                if (feature.geometry.type == "Point") {
                    var mapcenter = map.getCenter();
                    var mapzoom = map.getZoom(); 
                    var id = feature.properties.id;
    		        html = "<a target=\"_blank\" href=\"map.php" + 
                        "?followfeatureid=" + feature.properties.id + 
                        "&latitude=" + feature.geometry.coordinates[1] + 
                        "&longitude=" + feature.geometry.coordinates[0] + 
                        "&zoom=" + mapzoom + 
                        "&showallstations=1\">" + 
                        "<strong>" + feature.properties.callsign + "</strong></a>";
                        html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
                        (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
                        (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br><font class=\"pathstyle\">Heard on: " + feature.properties.frequency  +
                            (feature.properties.frequency == "ext radio" || feature.properties.frequency == "TCPIP" ? "" : "MHz") +
                        (typeof(feature.properties.heardfrom) == "undefined" ? "" : (feature.properties.heardfrom != "" ? " via: " + feature.properties.heardfrom : "" )) + "</font>" : "" )) +
                        createCoordsHTML(feature) +
                        (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time.split(' ')[1].split('.')[0] : ""));

                    layer.bindPopup(html, {className:  'myPopupStyle'} );

                    var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 

                    // if this object has a tooltip or label defined...
                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "")
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", opacity: .9, pane: "otherTooltipPane" }).openTooltip();
                        }    
                        else {
                            if (feature.properties.tooltip != "")
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: "otherTooltipPane" }).openTooltip();
                        }
                    }
                    
                }
           },
           pointToLayer:  function (feature, latlon) {
               var filename;
               var id = feature.properties.id;
               var rotation = 0;

               // Only try to display an "icon" if there was a symbol provided
               if (typeof(feature.properties.symbol) != "undefined") {

                   // Determine the file path to the PNG icon that represents this symbol
                   if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                       filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
                   else 
                       filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";

                   // Determine if a bearing was provided ...AND... this symbol is one that we "should" rotate (ex. it's a vehicle, etc.)
                   if (typeof(feature.properties.bearing) != "undefined" && typeof(symbolRotation[feature.properties.symbol.charAt(1)]) != "undefined") {
                       var clear_to_rotate = false;

                       // Is this is an alternate symbol?
                       if (feature.properties.symbol.charAt(0) == "\\" || feature.properties.symbol.match(/^[0-9a-zA-Z]/)) {
                           if (symbolRotation[feature.properties.symbol.charAt(1)].alternate == "true")
                               clear_to_rotate = true;
                        }
                        else
                            clear_to_rotate = true;

                        if (clear_to_rotate) {
                            // Calculate the amount of rotation needed given the individual icon's "starting" orientation (ex. most vehicle icons point to 90degs).
                            rotation = (feature.properties.bearing * 10 / 10) - (symbolRotation[feature.properties.symbol.charAt(1)].degrees * 10 / 10);
    
                            // If the rotation is far enough, then we need to flip the symbol so that it appears "right side up".
                            if (symbolRotation[feature.properties.symbol.charAt(1)].flip == "true" && (feature.properties.bearing * 10 / 10) > 180) {
                                filename = filename.split(".")[0] + "-flip.png";
                                rotation = symbolRotation[feature.properties.symbol.charAt(1)].degrees * 10 / 10;
                                rotation = (feature.properties.bearing * 10 / 10) - (rotation > 180 ? rotation - 180 : rotation + 180);
                            }
                        }
                    }
               }
               else
                   // What to do with a point that doesn't have a symbol?
		           return L.circleMarker(latlon, { radius: 8, pane: "breadcrumbPane", riseOnHover: true, fillColor: "blue", fillOpacity: .9, stroke : false, fill: true });


               var iconsize = Math.trunc(parseInt(typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10)); 
               var iconsize_center = Math.trunc(iconsize/2);
               var tipanchor = iconsize_center + 10;

               var myIcon = L.icon({
                   iconUrl: filename,
                   iconSize: [iconsize, iconsize],
                   iconAnchor: [iconsize_center, iconsize_center], 
                   popupAnchor: [0, -iconsize_center],
                   tooltipAnchor: [0, tipanchor]
               }); 



    		   return L.marker(latlon, { icon: myIcon, pane: "otherStationsPane", riseOnHover: true, rotationAngle: rotation, rotationOrigin: "center center" });
            } 
        }).on('update', function(ev) { updatemap(ev, this); });
    }
 


    /************
     * updatemap
     *
     * This function is called everytime a realtimelayer object is updated.
     ************/
    function updatemap(ev, realtimelayer) {
        var mapcenter = map.getCenter();
        var mapzoom = map.getZoom(); 
        var myiconsize;

        for (var key in ev.update) {
            var item = ev.update[key];
            var id = item.properties.id;
            var layer = realtimelayer.getLayer(id);
            var html = "";

            html = "<a target=\"_blank\" href=\"map.php" +
                      "?followfeatureid=" + item.properties.id + 
                      "&latitude=" + item.geometry.coordinates[1] + 
                      "&longitude=" + item.geometry.coordinates[0] + 
                      "&zoom=" + mapzoom + 
		              "&showallstations=1\">" + 
                      "<strong>" + item.properties.callsign + "</strong></a>";

	        html = html + (typeof(item.properties.comment) == "undefined" ? "" : (item.properties.comment != "" ? "<br><font class=\"commentstyle\">" + item.properties.comment + "</font>" : "")) + 
		          (typeof(item.properties.altitude) == "undefined" ? "" : (item.properties.altitude != 0 && item.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (item.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		          (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br><font class=\"pathstyle\">Heard on: " + item.properties.frequency + 
                            (item.properties.frequency == "ext radio" || item.properties.frequency == "TCPIP" ? "" : "MHz") +
                      (typeof(item.properties.heardfrom) == "undefined" ? "" : (item.properties.heardfrom != "" ? " via " + item.properties.heardfrom : "" )) + "</font>" : "" )) +
                  createCoordsHTML(item) +
		      (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time.split(' ')[1].split('.')[0] : ""));

            // Update the popup content
            layer.setPopupContent(html, { className: 'myPopupStyle' });
   

            // Set the icon for this object.  We do this for two reasons:  1) user might have changed theh iconsize, and 2) the APRS station might have changed it's symbol.
            if (item.properties.objecttype != "balloonmarker" && typeof(item.properties.symbol) != "undefined" && typeof(item.properties.iconsize) != "undefined") {
                var filename;
                var rotation = 0;


                // Determine the file path to the PNG icon that represents this symbol
                if (item.properties.symbol.startsWith('\\') || item.properties.symbol.startsWith('\/') || item.properties.symbol.startsWith('1x')) 
                    filename = "/images/aprs/" + symbols[item.properties.symbol].tocall + ".png";                
                else 
                    filename = "/images/aprs/" + item.properties.symbol.charAt(0) + "-" + symbols["\\" + item.properties.symbol.charAt(1)].tocall + ".png";

                // Determine if a bearing was provided ...AND... this symbol is one that we "should" rotate (ex. it's a vehicle, etc.)
                if (typeof(item.properties.bearing) != "undefined" && typeof(symbolRotation[item.properties.symbol.charAt(1)]) != "undefined") {
                    var clear_to_rotate = false;

                    // Is this is an alternate symbol?
                    if (item.properties.symbol.charAt(0) == "\\" || item.properties.symbol.match(/^[0-9a-zA-Z]/)) {
                        if (symbolRotation[item.properties.symbol.charAt(1)].alternate == "true")
                            clear_to_rotate = true;
                     }
                     else
                         clear_to_rotate = true;

                     if (clear_to_rotate) {
                         // Calculate the amount of rotation needed given the individual icon's "starting" orientation (ex. most vehicle icons point to 90degs).
                         rotation = (item.properties.bearing * 10 / 10) - (symbolRotation[item.properties.symbol.charAt(1)].degrees * 10 / 10);
 
                         // If the rotation is far enough, then we need to flip the symbol so that it appears "right side up".
                         if (symbolRotation[item.properties.symbol.charAt(1)].flip == "true" && (item.properties.bearing * 10 / 10) > 180) {
                             filename = filename.split(".")[0] + "-flip.png";
                             rotation = symbolRotation[item.properties.symbol.charAt(1)].degrees * 10 / 10;
                             rotation = (item.properties.bearing * 10 / 10) - (rotation > 180 ? rotation - 180 : rotation + 180);
                         }
                     }
                 }

                 var iconsize = Math.trunc(parseInt(typeof(item.properties.iconsize) == undefined ? 24 : item.properties.iconsize * 10 / 10)); 
                 var iconsize_center = Math.trunc(iconsize/2);
                 var tipanchor = iconsize_center + 10;

                 var myIcon = L.icon({
                     iconUrl: filename,
                     iconSize: [iconsize, iconsize],
                     iconAnchor: [iconsize_center, iconsize_center], 
                     popupAnchor: [0, -iconsize_center],
                     tooltipAnchor: [0, tipanchor]
                 }); 
                 layer.setIcon(myIcon);
                 layer.setRotationAngle(rotation);
                 layer.setRotationOrigin("center center");
            }

            // Check if we should update the tooltip contents...if this object has a tooltip or label defined...
            if (item.properties.tooltip && layer.getTooltip()) {
                if (item.properties.label) {
                    if (item.properties.label != "")
                        layer.setTooltipContent(item.properties.label);
                }
                else {
                    if (item.properties.tooltip != "")
                        layer.setTooltipContent(item.properties.tooltip);
                }
            }

            // If we're following a specific station then pan the map to its location
            if (followfeatureid != "") {
                if (followfeatureid.localeCompare(item.properties.id) == 0) {
                    map.panTo({ lat: item.geometry.coordinates[1], lng: item.geometry.coordinates[0] });
                }
            }
        }
    }



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
    * setConfiguration function
    *
    * This function will call the backend PHP script to set a SESSION variable to the timezone selected
    ***********/
    function setConfiguration() {
            var lookbackperiod = document.getElementById("lookbackperiod");
            var airdensity = document.getElementById("airdensity").checked;
            var form_data = new FormData();

            if (!lookbackperiod.checkValidity()) {
                throw lookbackperiod.validationMessage;
                return false;
            }

            form_data.append("lookbackperiod", lookbackperiod.value);
            form_data.append("airdensity", (airdensity == true ? "on" : "off"));
            $.ajax({
                url: "setconfiguration-memcache.php",
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
                success: function(data, textStatus, jqXHR) {
		            var jsonData = data;

		            document.getElementById("lookbackperiod").value = jsonData.lookbackperiod;
                    lookbackPeriod = jsonData.lookbackperiod * 1.0;

                    // Update the HUD with the new lookbackperiod
                    if (hud)
                        hud.setCutoff(lookbackPeriod);

		            if (jsonData.airdensity == "on")
			            document.getElementById("airdensity").checked = true;
		            else
			            document.getElementById("airdensity").checked = false;
                    document.getElementById("systemsettings_error").innerHTML = "Settings saved.";
                    
                    // set the next update to be a full one for inet, rf, and weather stations
                    updateType = "full";

                    setTimeout(function() {
                        document.getElementById("systemsettings_error").innerHTML = "";
                    }, 3000);
                },
                error: function (jqXHR, textStatus, errorThrown) {
	                alert("error: " + textStatus);
                }
            });
	    return false;
    }

    /***********
    * processConfiguration function
    *
    * process JSON that represents the configuration settings from the backend
    ***********/
    function processConfiguration(jsonData) {

        //document.getElementById("lookbackperiod").value = jsonData.lookbackperiod;
        //lookbackPeriod = jsonData.lookbackperiod * 1.0;

        if (hud)
            hud.setCutoff(lookbackPeriod);

        if (typeof(jsonData.callsign) != "undefined" && typeof(jsonData.ssid) != "undefined")
            if (jsonData.callsign != "" && jsonData.ssid != "")
                mycallsign = jsonData.callsign.toUpperCase() + "-" + jsonData.ssid;

        if (jsonData.airdensity == "on")
            document.getElementById("airdensity").checked = true;
        else
            document.getElementById("airdensity").checked = false;
    }


    /***********
    * processTrackers 
    *
    * Update the trackers display area within the sidebar with updated JSON from the backend
    ***********/
    function processTrackers(data) {
        var trackerJson = data.trackers;
        trackersList = data.trackers;
        var keys = Object.keys(trackerJson);
        var i; 
        var j;
        var k;
        var teamhtml;

        //Create a HTML Table element.
        var table = document.createElement("DIV");
        var tablediv = document.getElementById("trackers");
        table.setAttribute("class", "div-table");

        //The columns
        var columns = ["Team and Flight Assignment", "Team Members"];

        //Add the header row.
        var row = document.createElement("DIV");
        row.setAttribute("class", "table-row");
        table.appendChild(row);
        for (i = 0; i < columns.length; i++) {
            var headerCell = document.createElement("DIV");
            headerCell.innerHTML = columns[i];
            headerCell.setAttribute("class", "table-cell header toprow");
            row.appendChild(headerCell);
        }


        //Add the data rows.
        for (i = 0; i < keys.length; i++) {
            var trackers = trackerJson[i].trackers;
            var trackerkeys = Object.keys(trackers);
            var flight;
            var html = "";
            var checked;
            var foundmatch = 0;

            if (trackerJson[i].tactical != "ZZ-Not Active") {
                row = document.createElement("DIV");
                row.setAttribute("class", "table-row");
                table.appendChild(row);

                var teamcell = document.createElement("DIV");
                row.appendChild(teamcell);
                teamcell.setAttribute("class", "table-cell");

                var cellCallsign = document.createElement("DIV");
                row.appendChild(cellCallsign);
                cellCallsign.setAttribute("class", "table-cell");

                if (i % 2) {
                    teamcell.setAttribute("style", "background-color: lightsteelblue;");
                    cellCallsign.setAttribute("style", "background-color: lightsteelblue;"); 
                }

                teamcell.innerHTML = "<span style=\"font-size: 1.4em;\"><strong>" + trackerJson[i].tactical + "</strong></span><br>" 
                    + "<span class=\"lorem\">" + trackerJson[i].flightid + "</span>";

                for (j = 0; j < trackerkeys.length; j++) {
                    html = html + "<span style=\"font-size: 1.1em;font-weight: bold;\">" 
                        + trackers[j].callsign + "</span><br><span class=\"lorem\">" 
                        + trackers[j].notes + "<br>";
                }
                cellCallsign.innerHTML = html;
            }
        }
        tablediv.innerHTML = "";
        tablediv.appendChild(table);
    }


    /***********
    * selectedflight function
    *
    * This function gets the currently selected flight for the Live Packet Stream tab
    ***********/
    function selectedflight() {
        var radios = document.getElementsByName("flightLivePacketStream");
        var selectedValue;

        for(var i = 0; i < radios.length; i++) {
            if(radios[i].checked) selectedValue = radios[i].value;   
        }
        return selectedValue;
    }

    /***********
    * processStatus
    *
    * This function will fetch current status of processes, system status, etc. and populate the web page as needed.
    ***********/
    function processStatus(json) {

        let statusJson = json.backend;
        let antennas = statusJson.antennas

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

        // Loop through the processes, updating the browser page to reflect status (running or not).
        processes.forEach(function(proc) {
            let element = document.getElementById(proc.process + "-status");

            // the element already exists on the web page, so just update that section with this process's status
            if (element) {
                element.innerHTML = (proc.active > 0 ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
            }

            // otherwise we need to add an entry to the <div> table for this process
            else {
                /**** example HTML for the process table row *****
                    <div class="table-row">
                        <div class="table-cell">direwolf</div>
                        <div class="table-cell" style="text-align: right;"><span id="direwolf-status"><mark class="notokay">Not okay</mark></span><span id="direwolf-error"></span></div>
                    </div>
                ***************************************************/

                // if the process table exists...then add a row for this process
                let table = document.getElementById("processtable");
                if (table) {
                    let rowdiv = document.createElement("div");      // for the entire row itself
                    let leftcell = document.createElement("div");    // the leftmost cell of the row
                    let rightcell = document.createElement("div");   // the rightmost cell of the row
                    let statusspan = document.createElement("span"); // location where we stuff the status of the process
                    let errspan = document.createElement("span");    // location where we can post a short error message for the individual process if need be

                    rowdiv.className = "table-row";  
                    leftcell.className = "table-cell";  
                    rightcell.className = "table-cell";
                    rightcell.setAttribute("style", "text-align: right;");
                    statusspan.id = proc.process + "-status";
                    errspan.id = proc.process + "-error";

                    leftcell.innerHTML = proc.process.toLowerCase();
                    statusspan.innerHTML = (proc.active > 0 ? "<mark class=\"okay\">[Okay]</mark>" : "<mark class=\"notokay\">[Not okay]</mark>");
                    rightcell.appendChild(statusspan);
                    rightcell.appendChild(errspan);
                    rowdiv.appendChild(leftcell);
                    rowdiv.appendChild(rightcell);
                    table.appendChild(rowdiv);
                }
            }
        });

        // by default set the status to not running.
        let donehtml = "<mark>Not running.</mark>";

        // backend is "active", we've found an SDR dongle attached
        if (isActive && isRFMode) {
            // ...then we'd expect to find direwolf, aprsc, and the backend running...at least.
            if (direwolf && aprsc && backend)
                donehtml = "<mark style=\"background-color: lightgreen;\">Running.</mark>";
        }
        // backend is "active", but there wasn't an SDR dongle attached...so we're presumably running in "online" mode
        else if (isActive && !isRFMode) {

            // ...then we'd expect to find just aprsc and the backend running.  Although direwolf might be running, but just for beaconing via an external radio, so we don't count that.
            if (aprsc && backend)
                donehtml = "<mark style=\"background-color: lightgreen;\">Running.</mark>";
        }

        // update the overall backend status.
        document.getElementById("systemstatus").innerHTML = donehtml;

    }


    /***********
    * addControlPlaceholders
    *
    * Create additional Control element placeholders (i.e. locations where one can place Controls on the map)
    ***********/
    function addControlPlaceholders(m) {
        var corners = m._controlCorners,
            l = 'leaflet-',
            container = m._controlContainer;

        function createCorner(vSide, hSide) {
            var className = l + vSide + ' ' + l + hSide;

            corners[vSide + hSide] = L.DomUtil.create('div', className, container);
        }

        createCorner('center', 'top');
        createCorner('center', 'bottom');
    }


    /***********
    * toggleSpeed
    *
    * This function will toggle visibility for the speed display box on the map
    ***********/
    function toggleSpeed() {
        if (speedStatusBox && map) {

            // if the speed box is on the map already, then remove it
            if (speedStatusBox.onMap()) 
                speedStatusBox.remove();
            else 
                // Add the speed box to the map
                speedStatusBox.addTo(map);
       }
    }

    /***********
    * toggleHUD
    *
    * This function will toggle visibility for the HUD on the map
    ***********/
    function toggleHUD() {
        if (hud && map) {

            // if the HUD is on the map already, then remove it
            if (hud.onMap()) 
                hud.remove();
            else {
                // if the sidebar is open, close it before adding the HUD to the map
                sidebar.close();

                // Add the HUD to the map
                hud.addTo(map);
            }
       }
    }


    /***********
    * initialize_map function
    *
    * This function creates the map.  It should be called first.
    ***********/
    function initialize_map() {
        var baselayer;
        var overlays;


        // create the tile layer referencing the local system as the url (i.e. "/maps/....")
        var osmUrl='/maps/{z}/{x}/{y}.png';
        var osmAttrib='Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
        tilelayer = L.tileLayer(osmUrl, {minZoom: 4, maxZoom: 19, attribution: osmAttrib});


        // Create a map object. 
	    map = new L.Map('map', {
            //renderer : canvasRenderer,
            preferCanvas:  true,
            zoomControloption: false,
            minZoom: 4,
            maxZoom: 19
        });

        // Add additional locations (ex. center-top and center-bottom) for control elements 
        addControlPlaceholders(map);

        // Set default map location and zoom
        if (latitude != 0 && longitude != 0 && zoom != 0)
            map.setView(new L.latLng(latitude, longitude), zoom);
        else
            // This is Denver, CO: 39.739, -104.985
    	    map.setView(new L.latLng(39.739, -104.985), 10);

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

        // Setup the listener for map panTo events
        createTheListener();

        // Add the GPS status box to the top right
        gpsStatusBox = L.control.gpsbox().addTo(map);

        // use the grouped layers plugin so the layer selection widget shows layers categorized
        layerControl = L.control.groupedLayers({}, {}, { groupCheckboxes: true}).addTo(map);

        // Add OSM-Liberty to the map
        $.get("/tileserver/osm-liberty/style.json", function(d) {
            let stylejson = d;
            let myhostname = window.location.hostname;

            // update the hostname within the URL of for the map styling
            if (d.sources) 
                if (d.sources.openmaptiles) 
                    if (d.sources.openmaptiles.url) {
                        let url = new URL(d.sources.openmaptiles.url);
                        d.sources.openmaptiles.url = d.sources.openmaptiles.url.replace(url.hostname, myhostname);
                    }
            if (d.sprite) {
                let url = new URL(d.sprite);
                d.sprite = d.sprite.replace(url.hostname, myhostname);
            }

            if (d.glyphs) {
                let url = new URL(d.glyphs);
                d.glyphs = d.glyphs.replace(url.hostname, myhostname);
            }

            osmlibertystyle = d;
            osmliberty = L.maplibreGL({
                style: osmlibertystyle,
                attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
            });

            layerControl.addBaseLayer(osmliberty, "Base Map");
            osmliberty.addTo(map);
        });


        // This fixes the layer control such that when used on a touchable device (phone/tablet) that it will scroll if there are a lot of layers.
        if (!L.Browser.touch) {
            L.DomEvent
            .disableClickPropagation(layerControl._container)
            .disableScrollPropagation(layerControl._container);
         } 
         else {
             L.DomEvent.disableClickPropagation(layerControl._container);
         }

        // add a sidebar pane for navigation and instrumentation
        sidebar = L.control.sidebar('sidebar').addTo(map);
        var zoomcontrol = L.control.zoom({ position: 'topright' }).addTo(map);

        // add a scale widget in the lower left hand corner for miles / kilometers.
        var scale = L.control.scale({position: 'bottomright', maxWidth: 400, metric: false}).addTo(map);

	    // add a widget in the upper right hand corner for adding waypoints
	    var marker_control = new L.Control.SimpleMarkers({marker_draggable: true});
	    map.addControl(marker_control);

        // Add the speed box
        speedStatusBox = L.control.box({ 
            callback: function(onoff) { followme = onoff; },
            position: "centertop" 
        });

        // Add the HUD to the bottom center
        hud = L.control.flighthud({ position: "centerbottom", flights: flightids});

        // startup SSE operations.
        initializeSSE();
    }

    /*********
    * this function is for styling the non-flight, other generic stations on the map
    **********/
    function mapStyle(feature) {
        var localstyle = {};
        var pane;

        if (feature.geometry) {
            if (feature.geometry.type == 'Point')
                pane = 'otherStationsPane';
            else
                pane = 'pathsPane';
            localstyle = { weight: 1, color : 'black', pane: pane };
        }
        return localstyle;
    }

    /***********
    * initialize_other function
    *
    * This function performs all of the heavy lifting to init the data sources displayed on the map for non-flight sources.
    *
    * returns an array of the realtime layers created
    ***********/
    function initialize_layers() {

        // the list of realtime layers 
        let rtlayers = [];

        // Layer groups for all stations and just my station.  This allows toggling the visibility of these two groups of objects.
        //var allstations = L.markerClusterGroup();
        var allstations = L.layerGroup();
        var mystation = L.layerGroup();
        //var wxstations = L.markerClusterGroup();
        //var wxstations = L.layerGroup();

        // Layer group for trackers that are not assigned to a specific flight
        var trackersatlarge = L.layerGroup();

        // where all other stations land
        allStationsLayer = createRealtimeLayer("", false, allstations, 5 * 1000, mapStyle);
        rtlayers.push(allStationsLayer);
        if (showallstations == 1) {
            allStationsLayer.addTo(map); 
        }

        // realtime layers
        myPositionLayer = createRealtimeLayer("", false, mystation, 5 * 1000, mapStyle);
        trackersAtLargeLayer = createRealtimeLayer("", false, trackersatlarge, 5 * 1000, mapStyle);
        //weatherStationsLayer = createRealtimeLayer("", false, wxstations, 5 * 1000, mapStyle);

        rtlayers.push(myPositionLayer);
        rtlayers.push(trackersAtLargeLayer);
        //rtlayers.push(weatherStationsLayer);

        // add the location system's positon to the map
        myPositionLayer.addTo(map);

        // Add the trackers layer to the map
        trackersAtLargeLayer.addTo(map);

        // Add these layers to the map layer selector
        layerControl.addOverlay(trackersatlarge, "Trackers", "Other Stations");
        //layerControl.addOverlay(wxstations, "Weather Stations", "Other Stations");
        layerControl.addOverlay(allstations, "Other Stations", "Other Stations");
        layerControl.addOverlay(mystation, "My Location", "Other Stations");


        /*
        * This sets up all the flight layers.
        *   ...includes the active, predicted, and landing layers
        */
        var key;
        var key2;
            
        for (key in flightids) {
            var predictedpathlayer = L.layerGroup();
            var landingpredictionlayer = L.layerGroup();
            var cutdownpredictionlayer = L.layerGroup();
            var beacons = [];

            for (key2 in flightids[key].callsigns) {
                var activeflightlayer = L.featureGroup();

                /* The active flight layer */
                var r = createActiveFlightsLayer("",
                    activeflightlayer, 
                    5 * 1000, 
                    flightids[key].flightid + flightids[key].callsigns[key2]
                );

                // Add this flight layer to our list of realtime layers
                rtlayers.push(r);

                // Add this flight layer to the map
                r.addTo(map);

                // update the beacons global
                beacons.push({ 
                    "callsign": flightids[key].callsigns[key2], 
                    "layer": r,
                    "json": []
                });

                /* Add these layers to the map's layer control */
                layerControl.addOverlay(activeflightlayer, flightids[key].callsigns[key2], "Flight:  " + flightids[key].flightid);
            }

            /* Predict File layers */
            var e = createFlightPredictionLayer("", predictedpathlayer, 5 * 1000);
            rtlayers.push(e);

            /* The landing prediction layer */
            var f = createLandingPredictionsLayer("", landingpredictionlayer, 
                5 * 1000,
                flightids[key].flightid
            );
            rtlayers.push(f);

            /* prediction layer for early cutdown */
            var g = createLandingPredictionsLayer("", cutdownpredictionlayer, 
                5 * 1000,
                flightids[key].flightid,
                landingPredictionStyleCutdown
            );
            rtlayers.push(g);

            // add the landing prediction and early cutdown prediction layers to the map
            f.addTo(map);
            g.addTo(map);

            /* Add these layers to the map's layer control */
            layerControl.addOverlay(predictedpathlayer, "Pre-Flight Predicted Path", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(landingpredictionlayer, "Landing Predictions", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(cutdownpredictionlayer, "Cutdown Predictions", "Flight:  " + flightids[key].flightid);

            // update the flightList global with all flight layers
            flightList.push({
                "flightid": flightids[key].flightid,
                "predictlayer": e,
                "landinglayer": f,
                "cutdownlayer": g,
                "lastupdate": Date.now() / 1000,
                "beacons": beacons
            });
         }


        return rtlayers;
    }


    /************
     * startup
     *
     * This function performs some startup actions and calls "initialize", the primary function for starting the map stuff
    *************/
    function startup() {

        // determine if this is an apple platform or not
        isApplePlatform = isApple();

        // initialize the map and its layers
        initialize_map();

        // Update the flight sidebar content
        let flight;
        let allHtml = "<input type=\"radio\" id=\"allpackets\" name=\"flightLivePacketStream\" value=\"allpackets\" checked > All packets (< 3hrs) &nbsp; &nbsp;";
        //var livePacketStreamHTML = "<form>" + allHtml;
        let i = 0;
        for (flight in flightids) {
            var pos_a = "#" + flightids[flight].flightid + "_positionpacketlistlink";
            var pos_l = "#" + flightids[flight].flightid + "_positionpacketlistsign";
            var pos_e = "#" + flightids[flight].flightid + "_positionpacketlist";

            var stat_a = "#" + flightids[flight].flightid + "_statuspacketlistlink";
            var stat_l = "#" + flightids[flight].flightid + "_statuspacketlistsign";
            var stat_e = "#" + flightids[flight].flightid + "_statuspacketlist";

            var inst_a = "#" + flightids[flight].flightid + "_instrumentpanellink";
            var inst_l = "#" + flightids[flight].flightid + "_instrumentpanelsign";
            var inst_e = "#" + flightids[flight].flightid + "_instrumentpanel";

            var alt_a = "#" + flightids[flight].flightid + "_altitudechartlink";
            var alt_l = "#" + flightids[flight].flightid + "_altitudechartsign";
            var alt_e = "#" + flightids[flight].flightid + "_altitudechart";

            var vert_a = "#" + flightids[flight].flightid + "_verticalchartlink";
            var vert_l = "#" + flightids[flight].flightid + "_verticalchartsign";
            var vert_e = "#" + flightids[flight].flightid + "_verticalchart";

            var rel_a = "#" + flightids[flight].flightid + "_relativepositionlink";
            var rel_l = "#" + flightids[flight].flightid + "_relativepositionsign";
            var rel_e = "#" + flightids[flight].flightid + "_relativeposition";

            var lpp_a = "#" + flightids[flight].flightid + "_lastpacketpathlink";
            var lpp_l = "#" + flightids[flight].flightid + "_lastpacketpathsign";
            var lpp_e = "#" + flightids[flight].flightid + "_lastpacketpath";

            $(pos_a).click({element: pos_e, link: pos_l }, toggle);
            $(stat_a).click({element: stat_e, link: stat_l }, toggle);
            $(inst_a).click({element: inst_e, link: inst_l }, toggle);
            $(alt_a).click({element: alt_e, link: alt_l }, toggle);
            $(vert_a).click({element: vert_e, link: vert_l }, toggle);
            $(rel_a).click({element: rel_e, link: rel_l }, toggle);
            $(lpp_a).click({element: lpp_e, link: lpp_l }, toggle);

            // We use this to determine when the last packet came in for a given flight.
            $("#" + flightids[flight].flightid + "_sidebar").data("lastpacket", new Date("1970-01-01T00:00:00"));
            $("#" + flightids[flight].flightid + "_sidebar").data("feature", "");
            var d = $("#" + flightids[flight].flightid + "_sidebar").data().lastpacket;
            
            i += 1;
        }

        // Build the gauges and charts
        buildGauges(); 
        buildCharts();

        // create map layers
        realtimeLayers = initialize_layers();

        // Get an update from the all, rf, and weather stations
        updateOtherStations("full");

        // Call update flight function to populate data...  
        updateFlightData("full");

        // prune off older objecs from the map every minute
        setInterval(function() {
            pruneMap(realtimeLayers, 60 * 1000);
        });

        // Update all things on the map.  Note:  updateAllItems will schedule itself to run every 5 seconds.  No need for a setInterval call.
        //if (updateTimeout)
        //    clearTimeout(updateTimeout);
        //updateTimeout = setTimeout(function() {updateAllItems("notfull");}, 5000); 

        // When this map screen loses focus and then the user returns...
        window.onfocus = gainFocus;
        window.onblur = lostFocus;

        // Listener so that the charts for flights are resized when the screen changes size.
        window.addEventListener("resize", function() {
            resizeCharts();
        });
    }

    /********* 
     * pruneMap
     *
     * Will loop through all of the layers on the map, pruning off those objects that are older
     *********/
    function pruneMap(realtime_layers) {
        if (!realtime_layers)
            return 0;

        // number of objects pruned
        let num = 0;

        // the cutoff period, measured from right now.
        let cutoff = new Date(Date.now() - lookbackPeriod * 60000);

        if (Array.isArray(realtime_layers)) {
            // list of layers to prune
            realtime_layers.forEach( function(l) {
                num += pruneRealtimeLayer(l, cutoff);
            });
        }
        else {
            // just a single layer to prune
            num += pruneRealtimeLayer(realtime_layers, cutoff);
        }

        return num;
    }


    /***********
    * setupSSE function
    *
    * This function will setup an SSE connection to the backend packet source (backendurl) 
    ***********/
    function setupSSE(backendurl) {
        if(typeof(EventSource) !== "undefined") {

            // Create new SSE source
            eventsource = new EventSource(backendurl);

            // listen for new gps position alerts
            eventsource.addEventListener("gpsstatus", function(event) {

                let gpsjson;
                
                // Parse the incoming json
                try { gpsjson = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "GPS JSON parse error", "event": event, "error": e.message, "gpsjson": gpsjson});
                }

                // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
                if (gpsjson && gpsjson.features && gpsjson.features[0].properties && gpsjson.features[0].geometry) {

                    var ts = new Date(gpsjson.features[0].properties.time);
                    var tmstring = getISODateTimeString(ts);
                    
                    // update the time value to be a nicer string.
                    gpsjson.features[0].properties.time = tmstring;

                    // update our position
                    updateMyLocation(gpsjson);
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
                    /*else if (json.type == "trackers")
                        processTrackers(json.trackers);
                    else if (json.type == "flights")
                        processFlights(json.flights);
                        */
                }

            });

            /*
            eventsource.addEventListener("configuration", function(event) {
                let configjson;

                // Parse the incoming json
                try { configjson = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "Configuration JSON parse error", "event": event, "error": e.message, "configjson": configjson});
                }

                // process the incoming JSON
                if (configjson) 
                    processConfiguration(configjson);
            });
            */

            eventsource.addEventListener("backendstatus", function(event) {

                let json;
                
                // Parse the incoming json
                try { json = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "backend status JSON parse error", "event": event, "error": e.message, "backendstatusjson": json});
                }

                if (json)
                    processStatus(json);
            });

            eventsource.addEventListener("packets", function(event) {

                let json;
                
                // Parse the incoming json
                try { json = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "new packet JSON parse error", "event": event, "error": e.message, "packetsjson": json});
                }

                if (json)
                    packethandler(json);
            });

            eventsource.addEventListener("trackers", function(event) {

                let json;
                
                // Parse the incoming json
                try { json = JSON.parse(event.data);}
                catch (e) { 
                    console.log({"what": "trackers JSON parse error", "event": event, "error": e.message, "trackersjson": json});
                }

                if (json)
                    processTrackers(json);
            });


            // listen for any errors, try and restart the connection if there were any
            eventsource.addEventListener("error", function(event) {

                //console.log({"function": "event source error", "error": event});

                // close the event source
                eventsource.close();

                // wait for one second then restart SSE 
                setTimeout(initializeSSE, 1000);
            });
        }
    }


    /***********
    * initializeSSE
    *
    * restart the SSE stream
    ***********/
    function initializeSSE() {
        //setupSSE("ssestream.php?gpsstatus=true&configuration=true&backendstatus=true&packets=true&trackers=true");
        setupSSE("/sse");
    }


    /***********
    * updateMyLocation
    *
    * accepts a geojson FeatureCollection object and updates the global, lastposition, and finally updates the various elements on the map (the myPositionLayer, relative position dials, the speedometer box, etc.)
    ***********/
    function updateMyLocation(geojson) {

        // Determine the geojson feature from the provided arguments
        let feature = null;
        let featurecollection = null;
        if (geojson && geojson.type) {
            if (geojson.type == "FeatureCollection") {
                featurecollection = geojson;
                if (geojson.features)
                    feature = geojson.features[0];
            }
            else if (geojson.type == "Feature") {
                feature = {
                    "type": "FeatureCollection",
                    "properties": {
                      "name": "My station"
                    },
                    "features": [geojson]
                };
            }
        }

        // if there isn't any geojson to process then we return
        if (!feature || !featurecollection) {
            return;
        }

        // the current GPS fix mode
        let gpsMode = feature.properties.gps.mode * 1.0;

        // update the lastposition global variable
        lastposition = feature;

        // only update those items that depend on location data IF the location data provided is considered valid
        if (gpsMode > 2) {

            // update the position icon on the map
            if (myPositionLayer)
                myPositionLayer.update(featurecollection);

            // Pan the map to the latest GPS location
            if (followme) {
                dispatchPanToEvent(feature.geometry.coordinates[1] * 1.0, feature.geometry.coordinates[0] * 1.0);
            }

            // Update the speed status box
            if (speedStatusBox)
                speedStatusBox.show(Math.round(feature.properties.speed_mph * 1.0).toLocaleString() + "<font style=\"font-size: .2em;\"> mph</font>");

            // Now update the relative position gauges and fields
            updateRelativePosition(feature);
        }

        // Update the GPS status box
        if (gpsStatusBox) {

            // string where we'll hold the HTML used to update the GPS status box.
            let gpsfix;

            if (feature.properties.gps.status == "no device") {
                gpsStatusBox.show("GPS: <mark class=\"notokay\">[ NO DEVICE ]</mark>");
            }
            else {
                if (gpsMode == 0) 
                    gpsfix = "GPS: <mark class=\"notokay\">[ NO DATA ]</mark>";
                else if (gpsMode == 1) 
                    gpsfix = "GPS: <mark class=\"notokay\">[ NO FIX ]</mark>";
                else if (gpsMode == 2) 
                    gpsfix = "GPS: <mark class=\"marginal\">[ 2D ]</mark>";
                else if (gpsMode == 3) 
                    gpsfix = "GPS: <mark class=\"okay\">[ 3D ]</mark>";
                else
                    gpsfix = "Unable to get GPS status";

                gpsStatusBox.show(gpsfix);
            }
        }
    }


    /************
     * toggle
     *
     * This function will toggle the visiblity of elements.
    *************/
    function toggle(event) {
        var ele = $(event.data.element);
        var signEle = $(event.data.link);
        ele.slideToggle('fast', function() {
            if (ele.is(':visible')) {
                signEle.text('-');
             }
             else  {
                signEle.text('+');
             }
        });
    }

    /************
     * buildCharts
     *
     * This function creates the charts for the individual flight tabs.
    *************/
    function buildCharts () {
        var flight;
        var achart;
        var vchart;

        // build empty charts for each active flight
        var i = 0;
        for (flight in flightids) {
            var data = {};
            var cols = {};
            var altElement = "#" + flightids[flight].flightid + "_altitudechart";
            var vertElement = "#" + flightids[flight].flightid + "_verticalchart";
            
            // This is the altitude vs. time chart
            achart = c3.generate({
                bindto: altElement,
                size: { width: getChartWidth(), height: getChartHeight() },
                padding: {right: 10 },
                data: { empty : { label: { text: "No Data Available" } }, type: 'area', json: data, xs: cols, xFormat: '%Y-%m-%d %H:%M:%S'  },
                axis: { x: { label: { text: 'Time', position: 'outer-center' }, 
                    type: 'timeseries', tick: { count: 6, format: '%H:%M' }  }, 
                    y: { label: { text: 'Altitude (ft)', position: 'outer-middle' }, tick: {format: function(d) { return Math.round(d / 1000) + "k"; } } } },
                //grid: { x: { show: true }, y: { show: true, lines: [{ value: lastposition.properties.altitude, class: 'groundlevel', text: 'Ground Level'}] } }
                grid: { x: { show: true }, y: { show: true } },
                line: { connectNull: true },
                point: { show: false }
            });

            // This is the vertical rate vs. time chart
            vchart = c3.generate({
                bindto: vertElement,
                size: { width: getChartWidth(), height: getChartHeight() },
                padding: {right: 10 },
                data: { empty : { label: { text: "No Data Available" } }, type: 'area', json: data, xs: cols, xFormat: '%Y-%m-%d %H:%M:%S'  },
                axis: { x: { label: { text: 'Time', position: 'outer-center' }, 
                    type: 'timeseries', tick: { count: 6, format: '%H:%M' }  }, 
                    y: { label: { text: 'Vertical Rate (ft/min)', position: 'outer-middle' }, tick: { format: d3.format(",d") }  } },
                //grid: { x: { show: true }, y: { show: true, lines: [{ value: lastposition.properties.altitude, class: 'groundlevel', text: 'Ground Level'}] } }
                grid: { x: { show: true }, y: { show: true } },
                line: { connectNull: true },
                point: { show: false }
            });


            $(altElement).data('altitudeChart', achart);
            $(vertElement).data('verticalChart', vchart);
        }
    }

    /************
     * opensidebar
     *
     * This function opens the specified tab on the sidebar
    *************/
    function opensidebar(id) {
        if (sidebar) {
            sidebar.open(id + "_sidebar")
        }

        return false;
    }

    /************
     * resizeCharts
     *
     * This function loops through the current flights, adjusting their chart sizes to fit the screen
    *************/
    function resizeCharts() {
        var w = getChartWidth();
        var h = getChartHeight();


        // Loop through each flight's sidebar tab, resizing the charts.
        for (flight in flightids) {
            var altElement = "#" + flightids[flight].flightid + "_altitudechart";
            var vertElement = "#" + flightids[flight].flightid + "_verticalchart";

            var vchart = $(vertElement).data('verticalChart');
            var achart = $(altElement).data('altitudeChart');

            vchart.resize({
                height: h,
                width: w
            });

            achart.resize({
                height: h,
                width: w
            });
        }
    }

    /************
     * buildGauges
     *
     * This function creates the gauges/instrumentation for the individual flight tabs.
    *************/
    function buildGauges () {
    var altimeter;
    var variometer;
    var heading;
    var airspeed;
        var relativebearing;
        var relativeangle;
        var flights = [];
        var flight;

        for (flight in flightids) {
            var altitudeInstrument = "#" + flightids[flight].flightid + "_altimeter";
            var verticalRateInstrument = "#" + flightids[flight].flightid + "_variometer";
            var balloonHeadingInstrument = "#" + flightids[flight].flightid + "_heading";
            var speedInstrument = "#" + flightids[flight].flightid + "_airspeed";
            var relativeBearingInstrument = "#" + flightids[flight].flightid + "_relativebearing";
            var relativeElevationInstrument = "#" + flightids[flight].flightid + "_relativeelevationangle";

            var altitudeValue = "#" + flightids[flight].flightid + "_altitudevalue";
            var verticalRateValue = "#" + flightids[flight].flightid + "_verticalratevalue";
            var balloonHeadingValue = "#" + flightids[flight].flightid + "_headingvalue";
            var speedValue = "#" + flightids[flight].flightid + "_speedvalue";
            var relativeBearingValue = "#" + flightids[flight].flightid + "_relativebearingvalue";
            var relativeElevationValue = "#" + flightids[flight].flightid + "_relativeelevationanglevalue";

            altimeter = $.flightIndicator(altitudeInstrument, 'altimeter', { showBox: true });
            variometer = $.flightIndicator(verticalRateInstrument, 'variometer', { showBox: true});
            heading = $.flightIndicator(balloonHeadingInstrument, 'heading', { showBox: true});
            airspeed = $.flightIndicator(speedInstrument, 'airspeed', { showBox: true});
            relativebearing = $.flightIndicator(relativeBearingInstrument, 'relativeHeading', { showBox: true});
            relativeangle = $.flightIndicator(relativeElevationInstrument, 'elevationAngle', { showBox: true});

            $(altitudeValue).data('altimeter', altimeter);
            $(verticalRateValue).data('variometer', variometer);
            $(balloonHeadingValue).data('heading', heading);
            $(speedValue).data('airspeed', airspeed);
            $(relativeBearingValue).data('relativebearing', relativebearing);
            $(relativeElevationValue).data('relativeangle', relativeangle);
        }
    }


    /************
     * dispatchPanToEvent
     *
     * This function will emit 
    *************/
    function dispatchPanToEvent(lat, lon) {
        var panToEvent = new CustomEvent("MapPanTo", { detail: { lat: lat, lon: lon } });
        document.dispatchEvent(panToEvent);
        return false;
    }


    /************
     * createTheListener
     *
     * This function creates the primary Listener handler for when to update the gauges and other instruments/indicators
    *************/
    function createTheListener() {

        // This the listener for a MapPanTo event.
        var thePanToListener = document.addEventListener("MapPanTo", function(event) {
            if (map) {
                map.panTo(L.latLng(event.detail.lat,event.detail.lon));
            }
        });

    }


    /************
     * updateFlightLayer
     *
     * This function provides for an easy way to update a flight layer based on its name.
     * Flight layer names are the concatenated string consisting of the flightid and the callsign.
     * For example:  EOSS-289KC0D-1
     *
    *************/
    function updateFlightLayer(name) {
        var rfl;

        for (rfl in realtimeflightlayers) {
            if (realtimeflightlayers[rfl].options.name == name)  {
                realtimeflightlayers[rfl].update();
            }
        }
    }


    /************
     * updateLandingPredictionLayer
     *
     * This function provides for an easy way to update a landing prediction layer based on its name.
     * Flight layer names are the concatenated string consisting of the flightid and the callsign.
     * For example:  EOSS-289KC0D-1
     *
    *************/
    function updateLandingPredictionLayer(name) {
        var rfl;

        for (rfl in landingpredictionlayers) {
            if (landingpredictionlayers[rfl].options.name == name)   {
                landingpredictionlayers[rfl].update();
            }
        }
    }



    /************
     * resetSideBar
     *
     * This function removes any values from the sidebar and resets things
    *************/
    function resetSideBar(flightid) {

        /* Reset the TTL message */
        var elem = "#" + flightid + "_ttl";
        $(elem).text("n/a");

        /* reset the last packet time */
        $("#" + flightid + "_sidebar").data("lastpacket", new Date("1970-01-01T00:00:00"));

        //******** start: Update the relative position dials for this flight *******
        // These are the values that are stuck in the table
        var delement = "#" + flightid + "_relativepositiondistance";
        var celement = "#" + flightid + "_relativeballooncoords";

        // These are the dials
        var eelement = "#" + flightid + "_relativeelevationangle";
        var evelement = "#" + flightid + "_relativeelevationanglevalue";
        var hvelement = "#" + flightid + "_relativebearingvalue";
        var mhvelement = "#" + flightid + "_myheadingvalue";

        $(hvelement).data("relativebearing").setRelativeHeading(0, 0);
        $(evelement).data("relativeangle").setElevationAngle(0);
        if ($(delement).length)
            $(delement).html("n/a");
        if ($(celement).length)
            $(celement).html("n/a");
        $(evelement).text("--");
        $(hvelement).text("--");
        $(mhvelement).text("--");
        //******** end: Update the relative position dials for this flight *******


        //******** start: Update the telemetry gauges for this flight **********
        // The element names for displaying the telemetry
        var altitudeValue = "#" + flightid + "_altitudevalue";
        var verticalRateValue = "#" + flightid + "_verticalratevalue";
        var balloonHeadingValue = "#" + flightid + "_headingvalue";
        var speedValue = "#" + flightid + "_speedvalue";

        $(altitudeValue).data("altimeter").setAltitude(0);
        $(altitudeValue).text("");

        $(verticalRateValue).data("variometer").setVario(0);
        $(verticalRateValue).text("");

        // Update heading and speed
        $(balloonHeadingValue).data("heading").setHeading(0);
        $(speedValue).data("airspeed").setAirSpeed(0);
        $(balloonHeadingValue).text("--");
        $(speedValue).text("");
        //******** end: Update the telemetry gauges for this flight **********
        //


        // Clear the lastpacket path section
        var lastpacketpath = "#" + flightid + "_lastpacketpathdata";
        if ($(lastpacketpath).length)
            $(lastpacketpath).html("No data available.");

        // clear the Altitude chart
        var a_element = "#" + flightid + "_altitudechart";
        if ($(a_element).length) {
            var achart = $(a_element).data('altitudeChart');
            achart.unload();
        }

        // clear the vertical chart
        var v_element = "#" + flightid + "_verticalchart";
        if ($(v_element).length) {
            var vchart = $(v_element).data('verticalChart');
            vchart.unload();
        }


        // Loop through each packet section
        var i = 0;
        var elem;
        for (i = 0; i < 5; i++) {
            var e1 = "#" + flightid + "_lasttime_" + i;
            var e2 = "#" + flightid + "_lastcallsign_" + i;
            var e3 = "#" + flightid + "_lastspeed_" + i;
            var e4 = "#" + flightid + "_lastvertrate_" + i;
            var e5 = "#" + flightid + "_lastaltitude_" + i;
            var e6 = "#" + flightid + "_statustime_" + i;
            var e7 = "#" + flightid + "_statuscallsign_" + i;
            var e8 = "#" + flightid + "_statuspacket_" + i;
            var elements = [e1, e2, e3, e4, e5, e6, e7, e8];
            for (elem in elements) {
                if ($(elements[elem]).length)
                    $(elements[elem]).text("");
            }
        }
    }

    /************
     * clearRealtimeLayer
     *
     * This function will remove all features from a Realtime layer.
     *
    *************/
    function clearRealtimeLayer(rl) {

        // This is the LeafletJS layer group 
        var group = rl.options.container;
        var features = [];

        // for each feature/item within that layer group, execute this function...
        group.eachLayer(function(l) {
            features.push({ "properties": { "id": l.feature.properties.id}});
        });

        if (features.length > 0) {
            rl.remove({"features": features});
        }
    }


    /************
     * pruneRealtimeLayer
     *
     * This function will remove those features from a realtime layer that are older than the cutoff timestamp
     *
    *************/
    function pruneRealtimeLayer(rl, cutoff) {

        // This is the LeafletJS layer group 
        var group = rl.options.container;
        var features = [];

        // for each feature/item within that layer group, execute this function...
        group.eachLayer(function(l) {

            // Only look at those items that have a "time" property set
            if (typeof(l.feature.properties.time) != "undefined") {

                // The timestamp of the item
                var layer_ts = parseDate(l.feature.properties.time);

                // Check how old this feature is...and add it to the list for removal
                if (layer_ts && layer_ts < cutoff) {
                    features.push({ "properties": { "id": l.feature.properties.id}});
                }
            }
        });

        if (features.length > 0) {
            rl.remove({"features": features});
        }

        return features.length;
    }


    /************
     * removeBalloonMarkers
     *
     * This function removes all balloonmarker objects from a Realtime layer
    *************/
    function removeBalloonMarkers(rl) {
        // This is the LeafletJS layer group
        var group = rl.options.container;

        // where we collect objects to remove
        var delthese = [];

        // for each feature/item within the layer group, execute this function...
        group.eachLayer(function(l) {

            // If a layer is a balloonmarker object add it to our list for deletion
            if (l.feature.properties.objecttype == "balloonmarker")
                delthese.push({ "properties": { "id": l.feature.properties.id}});
        });

        // If we collected objects to delete, them remove them from the Realtime layer
        if (delthese.length > 0) {
            rl.remove({"features": delthese});
        }
    }

    /************
     * updateLastestPackets
     *
     * This function updates sidebar latest packets list
    *************/
    function updateLatestPackets(json) {

        var positionpackets = json;
        var i = 0;
        var keys = Object.keys(positionpackets);

        // We only do this 5 times
        var max = (keys.length < 5 ? keys.length : 5);

        // Loop through each packet
        for (i = 0; i < max; i++) {
            var p = positionpackets[i];
            var time_string = p.time.split(" ")[1];

            if (time_string.indexOf(".") !== -1)
                time_string = time_string.split(".")[0];


            $("#" + p.flightid + "_lasttime_" + i).text(time_string);
            $("#" + p.flightid + "_lastcallsign_" + i).html(
                "<a href=\"#\"  onclick=\"dispatchPanToEvent('" + p.latitude + "', '" + p.longitude + "');\">" +  p.callsign + "</a>"
            );
            $("#" + p.flightid + "_lastspeed_" + i).text(Math.round(p.speed * 1.0) + " mph");
            $("#" + p.flightid + "_lastvertrate_" + i).text(Math.round(p.verticalrate * 1.0).toLocaleString() + " ft/min");
            $("#" + p.flightid  + "_lastaltitude_" + i).text(Math.round(p.altitude * 1.0).toLocaleString() + " ft");
        }
    }

    /************
     * updateStatusPackets
     *
     * This function updates sidebar latest status packets list
    *************/
    function updateStatusPackets(json) {

        var statuspackets = json;
        var i = 0;
        var keys = Object.keys(statuspackets);

        // We only do this 5 times
        var max = (keys.length < 5 ? keys.length : 5);

        // Loop through each packet
        for (i = 0; i < max; i++) {
            var p = statuspackets[i];
            var time_string = p.time.split(" ")[1];

            if (time_string.indexOf(".") !== -1)
                time_string = time_string.split(".")[0];

            $("#" + p.flightid + "_statustime_" + i).text(time_string);
            $("#" + p.flightid + "_statuscallsign_" + i).text(p.callsign);
            $("#" + p.flightid + "_statuspacket_" + i).text(p.packet);
        }

    }


    /************
     * packethandler
     *
     * handle the individual packets coming from the SSE stream
    *************/
    function packethandler(json) {

        let callsign;
        let coordinates;

        /******* Example JSON *******
        {
            "type": "Feature", 
            "geometry": {
                "type": "Point", 
                "coordinates": [-104.902884025, 39.271953083]
            }, 
            "properties": {
                "tm": "2025-03-14T13:01:41.362621-06:00", 
                "raw": "KJ7NCH-11>APLRG1,TCPIP*,qAC,T2EDM:!L:[MX3z69a  GLoRa APRS TTGO", 
                "hash": "88495d5c6185f64dfbb865b8f4f654be", 
                "ptype": "!", 
                "source": "127.0.0.1", 
                "symbol": "La", 
                "bearing": 0, 
                "channel": 0, 
                "comment": "LoRa APRS TTGO", 
                "altitude": 0, 
                "callsign": "KJ7NCH-11", 
                "frequency": null, 
                "speed_mph": 0, 
                "location3d": {
                    "crs": {
                        "type": "name", 
                        "properties": {
                            "name": "EPSG:4326"
                        }
                    }, 
                    "type": "Point", 
                    "coordinates": [-104.90288402471872, 39.27195308275098, 0]
                }
            }
        }

        {
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [
      -108.045360806,
      38.350239927
    ]
  },
  "properties": {
    "tm": "2025-03-15T18:54:01.005575-06:00",
    "raw": "N2XGL-6>APRARX,TCPIP*,qAC,T2SJC:;RSONDE-CO*005358h3821.01N/10802.72WO241/017/A=073052 DFM-24061930 Clb=-30.9m/s t=-52.5C 404.410 MHz Type=DFM09 Radiosonde !wI0!",
    "hash": "87ff82fb0e47ca1b7bff7ad5b2f48e41",
    "ptype": ";",
    "source": "127.0.0.1",
    "symbol": "/O",
    "bearing": 241,
    "channel": 0,
    "comment": "DFM-24061930 Clb=-30.9m/s t=-52.5C 404.410 MHz Type=DFM09 Radiosonde",
    "altitude": 73052,
    "callsign": "RSONDE-CO",
    "frequency": null,
    "speed_mph": 20,
    "location3d": {
      "crs": {
        "type": "name",
        "properties": {
          "name": "EPSG:4326"
        }
      },
      "type": "Point",
      "coordinates": [
        -108.04536080586081,
        38.350239926739924,
        22266.249600000003
      ]
    },
    "tooltip": "RSONDE-CO",
    "label": "RSONDE-CO",
    "id": "RSONDE-CO",
    "iconsize": 24
  }
}

        **************************/

        if (json.properties && json.properties.callsign) {
            callsign = json.properties.callsign;
        }

        // without a callsign we can't proceed
        if (!callsign)
            return null;

        // without position information we can't add/update this station's location on the map
        if (json.geometry && json.geometry.type && json.geometry.coordinates) {
            coordinates = json.geometry.coordinates;
        }
        if (!coordinates)
            return null;

        // the leaflet group to add this geojson feature too
        let layer = null;
        let flightid = null;

        // set the ID for the geojson feature
        json.properties.id = json.properties.callsign;

        // iconsize...hard setting this for the moment.
        json.properties.iconsize = 24;

        // fix the time
        let dateobj = new Date(Date.parse(json.properties.tm));
        json.properties.time = getISODateTimeString(dateobj, true);

        // frequency being null
        json.properties.frequency = (json.properties.source.startsWith("direwolf") || json.properties.source.startsWith("ka9q") ?  json.properties.frequency : "TCPIP");

        // label, tooltip
        json.properties.label = callsign;
        json.properties.tooltip = callsign;

        // determine if this station is part of an existing layer group already on the map
        // loop through each flight, to check if this incoming json is a beacon on one of those flights
        flightList.forEach(function(f) {
            
            // list of beacons on this flight
            let beacons = f.beacons;

            beacons.forEach(function(b) {
                if (b.callsign.toUpperCase() == callsign.toUpperCase()) {
                    layer = b.layer;

                    // set flightid
                    json.properties.flightid = b.flightid;

                    // set object type
                    if (json.properties.symbol && json.properties.symbol == "/O")
                        json.properties.objecttype == "balloon";

                    // set label
                    let altstring = (json.properties.altitude * 1.0).toLocaleString() + "ft";
                    json.properties.label == callsign + "<br>" + altstring;

                    // tooltip
                    json.properties.tooltip = callsign;
                }
            });
        });

        // didn't find a match within the flight beacon layers, so now search through the list of trackers.
        if (!layer) {
            trackersList.forEach(function(team) {
                trackers = team.trackers;
                trackers.forEach(function(t) {
                    if (t.callsign.toUpperCase() == callsign.toUpperCase()) {
                        layer = trackersAtLargeLayer;

                        // adjust for the tactical team name
                        json.properties.tooltip = t.tactical;
                        json.properties.label = t.tactical;
                        json.properties.comment = "Tactical: " + t.tactical + "<br>" + json.properties.comment;
                    }
                });
            });
        }

        // Add this new data to the layer group
        if (layer) {
            //console.log("adding packet to layer.  ", json);
            layer.update(json);

        }
        else {
            //console.log("placing packet in allStationsLayer:  ", json);

            // if not a flight beacon and not a tracker the dump this packet into the "everything else" layer
            allStationsLayer.update(json);

        }

    }


    /************
     * updateFlightData
     *
     * This function updates the map and sidebar with all data surrounding a flight.  
    *************/
    function updateFlightData(fullupdate) {

        flightList.forEach(function(f) {
            var url = "getflightdata.php?flightid=" + f.flightid;

            /*if (fullupdate != "full" && updateType != "full") {
                url = url + "&starttime=" + f.lastupdate;
            }
            */

            // Update the last update time just before getting the data update
            f.lastupdate = Math.floor(Date.now() / 1000.0);

            $.get(url, function(data) {
                var incoming_json = (Array.isArray(data) ? data : [data]);

                incoming_json.forEach(function(x) {

                    // The incoming JSON elements
                    var fid = x.flightid;
                    var landingJSON = x.landing;
                    var cutdownJSON = x.cutdownlanding;
                    var predictJSON = x.predict;
                    var trackersJSON = x.trackers;
                    var packetlist = x.packetlist;
                    var altchart = x.altitudechart;
                    var vertchart = x.verticalchart;
                    var b = x.beacons;
                    var b_keys = Object.keys(b);

                    var j = 0;
                    var fl_keys = Object.keys(flightList);
                    var cutoff = new Date(Date.now() - lookbackPeriod * 60000);

                    // loop through each flightList record finding the match for this flight.
                    for (j = 0; j < fl_keys.length; j++) {
                        var flight = flightList[j];
                        var fl_beacon_keys = Object.keys(flight.beacons);

                        // Found a match for this flight...now process JSON updates.
                        if (flight.flightid == fid) {
                            var total_length = 0;

                            // Landing predictions...
                            if (landingJSON.features.length > 0) {
                                var x;
                                var f = flight.landinglayer;
                                var group = f.options.container;

                                // Loop through each feature within the existing landing layer looking for the breadcrumbs
                                group.eachLayer(function(l) {
                                    var id = l.feature.properties.id;

                                    // is this a breadcrumb?
                                    if (l.feature.properties.id.indexOf("_predictionpoint_") !== -1) {
                                        var y; 
                                        var incoming = landingJSON.features;

                                        // determine if this breadcrumb also appears within the incoming JSON
                                        var foundit = false;
                                        for (y in incoming) {
                                            if (incoming[y].properties.id == id) {
                                                foundit = true;
                                                break;
                                            }
                                        }

                                        // if the existing breadcrumb is not within the incoming JSON, then remove it from the map
                                        if (!foundit && f.getFeature(id)) {
                                            f.remove({"features": [{"properties": {"id": id}}]});
                                        }
                                    }
                                });

                                // Now add in all the incoming JSON
                                flight.landinglayer.update(landingJSON);
                            }
                            else
                                clearRealtimeLayer(flight.landinglayer);


                            // Early Cutdown Landing predictions...
                            if (cutdownJSON.features.length > 0) {
                                var x;
                                var f = flight.cutdownlayer;
                                var group = f.options.container;

                                // Loop through each feature within the existing landing layer looking for the breadcrumbs
                                group.eachLayer(function(l) {
                                    var id = l.feature.properties.id;

                                    // is this a breadcrumb?
                                    if (l.feature.properties.id.indexOf("_cutdownpredictionpoint_") !== -1) {
                                        var y; 
                                        var incoming = landingJSON.features;

                                        // determine if this breadcrumb also appears within the incoming JSON
                                        var foundit = false;
                                        for (y in incoming) {
                                            if (incoming[y].properties.id == id) {
                                                foundit = true;
                                                break;
                                            }
                                        }

                                        // if the existing breadcrumb is not within the incoming JSON, then remove it from the map
                                        if (!foundit && f.getFeature(id)) {
                                            f.remove({"features": [{"properties": {"id": id}}]});
                                        }
                                    }
                                });

                                // Now add in all the incoming JSON
                                flight.cutdownlayer.update(cutdownJSON);
                            }
                            else
                                clearRealtimeLayer(flight.cutdownlayer);


                            // The pre-flight predict file...
                            if (predictJSON.features.length > 0) {
                                var x;
                                var f = flight.predictlayer;
                                var group = f.options.container;

                                // Loop through each feature within the existing landing layer looking for the breadcrumbs
                                group.eachLayer(function(l) {
                                    var id = l.feature.properties.id;

                                    // is this a breadcrumb?
                                    if (l.feature.properties.id.indexOf("_predictionpoint_") !== -1) {
                                        var y; 
                                        var incoming = predictJSON.features;

                                        // determine if this breadcrumb also appears within the incoming JSON
                                        var foundit = false;
                                        for (y in incoming) {
                                            if (incoming[y].properties.id == id) {
                                                foundit = true;
                                                break;
                                            }
                                        }

                                        // if the existing breadcrumb is not within the incoming JSON, then remove it from the map
                                        if (!foundit && f.getFeature(id)) {
                                            f.remove({"features": [{"properties": {"id": id}}]});
                                        }
                                    }
                                });

                                flight.predictlayer.update(predictJSON);
                            }
                            else {
                                // if a predict file is "not" provided in this JSON, then we need to remove any legacy predict file from the map.
                                clearRealtimeLayer(flight.predictlayer);
                            }

                            if (packetlist.positionpackets.length > 0) {
                                updateLatestPackets(packetlist.positionpackets);
                            }
                            
                            if (packetlist.statuspackets.length > 0) {
                                total_length += packetlist.statuspackets.length;
                                updateStatusPackets(packetlist.statuspackets);
                            }

                            if (packetlist.lastpacketpath) {
                                updateReceivePath(fid, packetlist.lastpacketpath);
                            }

                            if (altchart.chartdata) {
                                updateAltitudeChart(altchart);
                            }

                            if (vertchart.chartdata) {
                                updateVerticalChart(vertchart);
                            }

                            // Loop through each incoming beacon
                            var i = 0;
                            for (i = 0; i < b_keys.length; i++) {
                                var beacon_json = b[i].json;
                                var incoming_callsign = b[i].callsign;
                                
                                total_length += beacon_json.features.length;

                                if (beacon_json.features.length > 0) {
                                    // Loop through each existing beacon for this flight and update the packets for this beacon
                                    var h = 0;
                                    for (h = 0; h < fl_beacon_keys.length; h++) {
                                        if (flight.beacons[h].callsign == incoming_callsign) {
                                            var f = flight.beacons[h].layer;
                                            var group = f.options.container;

                                            // Loop through each feature within the existing landing layer looking for those features that are not present within the incoming json
                                            group.eachLayer(function(l) {
                                                var id = l.feature.properties.id;
                                                var foundit = false;
                                                var incoming = beacon_json.features;
                                                var y;

                                                // Loop through the incoming beacon's json, looking for a match with the existing features.
                                                for (y in incoming) {
                                                    if (incoming[y].properties.id == id) {
                                                        foundit = true;
                                                        break;
                                                    }
                                                }

                                                // if the feature is not within the incoming JSON, then remove it from the map
                                                if (!foundit && f.getFeature(id)) {
                                                    f.remove({"features": [{"properties": {"id": id}}]});
                                                }
                                            });

                                            // replace the existing JSON for this beacon
                                            flight.beacons[h].json = beacon_json;

                                            // now update the realtime layer with this incoming json
                                            f.update(beacon_json);
                                            
                                            // prune off any layers that are older than the cutoff.
                                            pruneRealtimeLayer(f, cutoff);
                                        }
                                    }
                                }
                            }

                            if (total_length == 0) {
                                resetSideBar(flight.flightid);
                                var u;

                                for (u in flight.beacons) {
                                    clearRealtimeLayer(flight.beacons[u].layer)
                                }
                            }

                            pruneRealtimeLayer(flight.landinglayer, cutoff);
                            pruneRealtimeLayer(flight.predictlayer, cutoff);

                            var b;
                            for (b in flight.beacons) {
                                pruneRealtimeLayer(flight.beacons[b].layer, cutoff);
                            }

                        } // if (x.flightid == fid)

                    } 

                }); // json.forEach(...




            }); // $.get(url...

        }); // flightList.forEach...

    } // updateFlightData(....



    /************
     * updateOtherStations
     *
     * This function updates RF, inet, and weather stations
    *************/
    function updateOtherStations(fullupdate) {

        // The URL for getting all, RF, and weather station data
        var url = "getotherdata.php";

        // Check when the last time we got an update and append the URL to account for that.
        if (lastUpdateTime > 0 && updateType == "regular" && fullupdate != "full") 
            url = url + "?starttime=" + lastUpdateTime;

        // Update the last update time just before getting the data update
        lastUpdateTime = Math.floor(Date.now() / 1000.0);

        // Update the all stations, rf stations, and weather station layers
        updateType = "regular";
        $.get(url, function(data) {
            var is_incremental = (this.url.indexOf("starttime") !== -1);


            allStationsLayer.update(data.rfstations);
            allStationsLayer.update(data.inetstations);

            if (typeof(data.weatherstations) != "undefined")
                //weatherStationsLayer.update(data.weatherstations);
                allStationsLayer.update(data.weatherstations);

            // Prune off any RF, inet, or weather stations
            var cutoff = new Date(Date.now() - lookbackPeriod * 60000);
            var layers = [allStationsLayer, trackersAtLargeLayer];

            layers.forEach( function(l) {
                pruneRealtimeLayer(l, cutoff);

                // If we're following a specific station then pan the map to its location
                if (followfeatureid && followfeatureid != "") {
                    var feat = l.getFeature(followfeatureid);
                    if (feat && feat.geometry.coordinates) {
                        map.panTo({ lat: feat.geometry.coordinates[1], lng: feat.geometry.coordinates[0] });
                    }
                }
            });

        });
    }


    /************
     * updateReceivePath
     *
     * This function updates last packet receive path section on the sidebar
    *************/
    function updateReceivePath(fid, json) {
        var lastPacketPath = json;
        var i = 0;
        var keys = Object.keys(lastPacketPath);


        // Create the last packet source table and populate.
        //
        //
        // Create a HTML Table element.
        var container = document.getElementById(fid + "_lastpacketpathdata");
        var table = document.createElement("DIV");
        table.setAttribute("class", "div-table");

        // The columns
        var columns = ["Callsign", "Receive Time", "Last 10 Packets"];

        // Add the header row.
        var row = document.createElement("DIV");
        row.setAttribute("class", "table-row");
        table.appendChild(row);
        for (i = 0; i < columns.length; i++) {
            var headerCell = document.createElement("DIV");
            headerCell.innerHTML = columns[i];
            headerCell.setAttribute("class", "table-cell header toprow");
            row.appendChild(headerCell);
        }

        // Now add the data rows
        if (keys.length == 0) {
            row = document.createElement("DIV");
            row.setAttribute("class", "table-row");
            table.appendChild(row);
            var blankcell1 = document.createElement("DIV");
            var blankcell2 = document.createElement("DIV");
            var blankcell3 = document.createElement("DIV");
            blankcell1.setAttribute("class", "table-cell");
            blankcell2.setAttribute("class", "table-cell");
            blankcell3.setAttribute("class", "table-cell");
            blankcell1.innerHTML = "n/a";
            row.appendChild(blankcell1);
            row.appendChild(blankcell2);
            row.appendChild(blankcell3);
        }
        else {
            for (i = 0; i < keys.length; i++) {
                row = document.createElement("DIV");
                row.setAttribute("class", "table-row");
                table.appendChild(row);
                var beacon = lastPacketPath[i].callsign;
                var packetsource = lastPacketPath[i].lastpath;
                var beaconcell = document.createElement("DIV");
                var timecell = document.createElement("DIV");
                var packetcell = document.createElement("DIV");
                var time_string = lastPacketPath[i].time.split(" ")[1];

                if (time_string.indexOf(".") !== -1)
                    time_string = time_string.split(".")[0];

                beaconcell.setAttribute("class", "table-cell");
                timecell.setAttribute("class", "table-cell");
                packetcell.setAttribute("class", "table-cell");
                row.appendChild(beaconcell);
                row.appendChild(timecell);
                row.appendChild(packetcell);

                beaconcell.innerHTML = beacon;
                timecell.innerHTML = time_string;
                packetcell.setAttribute("style", "text-align: left; white-space: nowrap;");
                var j = 0;
                var html = "";
                var bgcolor;
                for (j = 0; j < packetsource.length; j++) {
                    if (packetsource[j] == "R")
                        bgcolor = "lightgreen";
                    else
                        bgcolor = "yellow";
                    html = html + "<mark style=\"background-color: " + bgcolor + ";\">" + packetsource[j] + "</mark>";
                }
                if (packetsource.length > 0)
                    packetcell.innerHTML = "<pre class=\"packetdata\">" + html + "</pre>";
                else
                    packetcell.innerHTML = "n/a";
            }
        }

        container.innerHTML = "";
        container.appendChild(table);
    }


    /************
     * updateAltitudeChart
     *
     * This function will update the altitude chart on the sidebar
    *************/
    function updateAltitudeChart(json) {
        var fid = json.flightid;
        var thekeys = Object.keys(json.chartdata);

        var k = 0;
        var chartkeys = Object.keys(json.chartdata);
        var cols = {};
        var element = "#" + fid + "_altitudechart";

        for (k = 0; k < chartkeys.length; k++) {  
            if (! chartkeys[k].startsWith("tm-")) {
                cols[chartkeys[k]] = "tm-" + chartkeys[k];
            }
        }

        // Load data into each Altitude chart
        var achart = $(element).data('altitudeChart');
        achart.load({ json: json.chartdata, xs: cols }); 
    }


    /************
     * updateVertChart
     *
     * This function will update the vertical chart on the sidebar
    *************/
    function updateVerticalChart(json) {
        var fid = json.flightid;
        var thekeys = Object.keys(json.chartdata);

        var k = 0;
        var chartkeys = Object.keys(json.chartdata);
        var cols = {};
        var element = "#" + fid + "_verticalchart";

        for (k = 0; k < chartkeys.length; k++) {  
            if (! chartkeys[k].startsWith("tm-")) {
                cols[chartkeys[k]] = "tm-" + chartkeys[k];
            }
        }

        // Load data into each Altitude chart
        var achart = $(element).data('verticalChart');
        achart.load({ json: json.chartdata, xs: cols }); 
    }
        

    /************
     * syncPackets
     *
     * This function will call the "syncpackets.php" file on the local system in an attempt
     * to download any missing packets.
    *************/
    async function syncPackets() {

        // The URL for synchronizing packets with track.eoss.org.
        var url = "syncpackets.php";

        // Call the url
        let response = await fetch(url);
        let result;

        // get the json from containing the results
        try{
            result = await response.json();
        } catch (e) {
            console.log("Error in getting results from sync packets url: ", url);
        }

        return result;
    }


    /************
     * UpdateAllItems
     *
     * This function updates other parts of the instrumentation, charts, and tables.
     * This will update every chart/graph/table globally.
    *************/
    function updateAllItems(fullupdate) {

        // Update all, rf, and weather stations
        updateOtherStations(fullupdate);

        // Update all, rf, and weather stations
        updateFlightData(fullupdate);

        // Update the TTL values
        checkTTL();

        // ...the idea being that ever so often, we should try a special update
        if (globalUpdateCounter > 20) {
            // Set updateAllItems to run again in 5 seconds, but as a full.
            if (updateTimeout)
                clearTimeout(updateTimeout);
            updateTimeout = setTimeout(function() {updateAllItems("full")}, 5000);
            globalUpdateCounter = 0;

        }
        else {
            // Set updateAllItems to run again in 5 seconds.
            if (updateTimeout)
                clearTimeout(updateTimeout);
            updateTimeout = setTimeout(updateAllItems, 5000);
        }
        globalUpdateCounter += 1;



        // if it's been longer than ~5mins, then try to sync packets with track.eoss.org
        // Get the current time
        var ts = new Date(Date.now());
        if (lastsynctime) {

            // compare with the last time a syncpackets was called
            if ((ts - lastsynctime) / 1000 > 300) {

                // sync up packets and set the last sync time
                syncPackets().then(function(json) {

                    // check the sync result
                    if (json) {

                        // if packets were added to the database, then we should reload data from the backend
                        if (json.result === true && json.packets > 0) {
                            updateFlightData();
                            updateOtherStations();
                            checkTTL();
                        }
                    }
                });
                lastsynctime = new Date(Date.now());
            }
        }
    }



/***********
* checkTTL
*
* This checks the TTL values displayed on the map for each flight.  This provides a means to 
* update that Time To Live value even if the backend hasn't heard from the flight for some time.
***********/
function checkTTL() {

    flightList.forEach(function(f) {
        // The flight ID
        var fid = f.flightid;

        // The HTML element where the TTL value is displayed
        var ttl_elem = $("#" + fid + "_ttl");
        var ttl_string = "";

        // Get the timestamp for the last packet for this flight
        var lastpacket = $("#" + fid + "_sidebar").data().lastpacket.getTime();

        // Get the current time
        var current_time = Date.now();

        // How many mins have elapsed since we last heard a packet from this flight?
        var delta_mins = Math.floor((current_time - lastpacket) / 1000 / 60);

        // Get the last ttl value for the last packet for this flight
        var ttl = "";
        if (typeof($("#" + fid + "_sidebar").data().ttl) != "undefined")
            ttl = $("#" + fid + "_sidebar").data().ttl;

        // If there's a delta (in mins) then see about adjusting what's displayed for the TTL value within the sidebar
        if (delta_mins > 0) {

            // Get the flight status
            var ret = flightStatus(delta_mins, ttl, 2);

            //    flightStatus return values:
            //    -4 = ttl was null or none
            //    -3 = invalid condition, not tracking flight
            //    -2 = loss of signal, > 20mins since we last heard from the flight
            //    -1 = the flight is on the ground
            //     n = adjusted TTL
            switch(ret) {

                //  -4 = ttl was null or none, but delta_mins is still <= lookback period
                case -4:
                    ttl_string = "Loss of Signal";
                    break;

                //  -3 = invalid condition, not tracking flight
                case -3:
                    ttl_string = "n/a";
                    break;

                //  -2 = loss of signal, > 20mins since we last heard from the flight
                case -2:
                    ttl_string = "Loss of Signal";
                    break;

                //  -1 = the flight is on the ground
                case -1:
                    ttl_string = "On The Ground";
                    break;

                //  n = adjusted TTL
                default:
                    ttl_string = (ret == 1 ? ret + " min" : ret + " mins");
            }
        }

        // Otherwise, it's been < 1min since we last heard from the flight and we have a valid TTL (i.e. the flight is descending) then we update the sidebar with that TTL value.
        else if (ttl != "" && ttl >= 0) {
            ttl_string = (ttl == 1 ? ttl + " min" : ttl + " mins");
        }

        // Finally, it's been, < 1min since we last heard from the flight and the flight is not descending, so we just update with status.
        else {
            ttl_string = "n/a";
        }

        // update the display
        ttl_elem.text(ttl_string);
    });
}


/***************************************
 * flightStatus
 *
 * Function to determine the status of a flight is when descending.
 *
 *    Return values:
 *    -4 = ttl was null or none
 *    -3 = invalid condition, not tracking flight
 *    -2 = loss of signal, > 20mins since we last heard from the flight
 *    -1 = the flight is on the ground
 *     n = adjusted TTL
 *    
 *    Inputs:
 *     delta_mins = number of minutes since we last heard from the the flight
 *            ttl = number of minutes remaining before the flight touches down as calculated by the landing predictor backend.
 *    buffer_mins = number of minutes we add to the ttl before declaring the flight is "on the ground".
 *
***************************************/
function flightStatus(delta_mins, ttl, buffer_mins) {

    // if ttl is None, then we just return as we're only interested in determining flight status during the descent.
    if (!ttl && delta_mins <= lookbackPeriod)
        return -4;

    // if delta_mins > lookback period, we ignore as we're not longer interested in the flight
    if (delta_mins > lookbackPeriod)
        return -3;

    // if delta_mins > 20mins && <= lookback period, then we declare LOS
    else if (delta_mins > 20 && delta_mins <= lookbackPeriod)
        return -2;

    // If delta_mins <= 20mins, then we we're working the TTL adjustment logic to determine:
    //     - adjust the TTL
    //     - or declare that the flight is "on the ground" if delta_mins > ttl
    else {

        // if the elapsed mins since the last packet is greater than the TTL + a buffer, then we declare the flight to be on the ground.
        if (delta_mins > ttl + buffer_mins) 
            return -1;

        // Otherwise we return a new TTL value by subtracting the delta_mins from the ttl
        return Math.floor(ttl - delta_mins <= 0 ? 0 : ttl - delta_mins);
    }
}


/***********
* lostFocus
*
* This function is called when the browser tab loses focus
***********/
function lostFocus() {
    var isiPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) || navigator.platform === 'iPad';
    var isMobile = 'ontouchstart' in document.documentElement ||  navigator.maxTouchPoints > 1;

    // If this is a mobile device then stop periodic updates...at least until the browser tab is in focus again.
    if ((isiPad || isMobile) && updateTimeout) {
        clearTimeout(updateTimeout);
    }

    return 0;
}


/***********
* gainFocus
*
* This function is called when the browser tab regains focus
***********/
function gainFocus() {

    // if we're regaining focus, then restart periodic page updates.
    if (updateTimeout) {
        var priorTimeout = updateTimeout;
        clearTimeout(updateTimeout);
        //updateTimeout = setTimeout(updateAllItems, 5000);
    }
    return 0;
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


