/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, Jeff Deaton (N6BA)
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
    var realtimelayers = [];
    var geturls = [];
    var allStationsLayer;
    var rfStationsLayer;
    var weatherStationsLayer;
    var trackersAtLargeLayer;
    var myPositionLayer;
    var lastUpdateTime = 0;
    var flightList = [];

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
    function getISODateTimeString(thedate) {
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
    * This is called from getgps() and updateSideBar() to update the relative position fields and gauges for each flight
    * getgps() is called at every update (every ~5 secs) and updateSideBar() is called whenever new packets from the flight are available.
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
            var iconsize = document.getElementById("iconsize");
            var lookbackperiod = document.getElementById("lookbackperiod");
            //var plottracks = document.getElementById("plottracks").checked;
            var airdensity = document.getElementById("airdensity").checked;
            var form_data = new FormData();

            if (!iconsize.checkValidity()) {
                throw iconsize.validationMessage;
                return false;
            }

            if (!lookbackperiod.checkValidity()) {
                throw lookbackperiod.validationMessage;
                return false;
            }

            form_data.append("iconsize", iconsize.value);
            form_data.append("lookbackperiod", lookbackperiod.value);
            //form_data.append("plottracks", (plottracks == true ? "on" : "off"));
            form_data.append("airdensity", (airdensity == true ? "on" : "off"));
            $.ajax({
                url: "setconfiguration.php",
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
                success: function(data, textStatus, jqXHR) {
		            var jsonData = data;

		            document.getElementById("iconsize").value = jsonData.iconsize;
		            document.getElementById("lookbackperiod").value = jsonData.lookbackperiod;
                    lookbackPeriod = jsonData.lookbackperiod * 1.0;

                    // Update the HUD with the new lookbackperiod
                    if (hud)
                        hud.setCutoff(lookbackPeriod);

		            /*if (jsonData.plottracks == "on")
			            document.getElementById("plottracks").checked = true;
		            else
			            document.getElementById("plottracks").checked = false;
                    */
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
    * getConfiguration function
    *
    * This function will call the backend PHP script to get the configuration for the system
    ***********/
    function getConfiguration() {
	    $.get("readconfiguration.php", function(data) {
		    var jsonData = JSON.parse(data);

		    document.getElementById("iconsize").value = jsonData.iconsize;
		    document.getElementById("lookbackperiod").value = jsonData.lookbackperiod;
            lookbackPeriod = jsonData.lookbackperiod * 1.0;

            if (hud)
                hud.setCutoff(lookbackPeriod);

            if (typeof(jsonData.callsign) != "undefined" && typeof(jsonData.ssid) != "undefined")
                if (jsonData.callsign != "" && jsonData.ssid != "")
                    mycallsign = jsonData.callsign.toUpperCase() + "-" + jsonData.ssid;

		    /*if (jsonData.plottracks == "on")
			    document.getElementById("plottracks").checked = true;
		    else
			    document.getElementById("plottracks").checked = false;
            */
		    if (jsonData.airdensity == "on")
			    document.getElementById("airdensity").checked = true;
		    else
			    document.getElementById("airdensity").checked = false;
            });
    }



    /***********
    * changeAssignedFlight function
    *
    * This function will update the assigned flight for a team (ex. Alpha, Bravo, etc.)
    ***********/
    function changeAssignedFlight(tactical, element) {
        var assignedFlight = element.options[element.selectedIndex].value;


        $.get("changeassignedflight.php?tactical=" + tactical + "&flightid=" + assignedFlight, function(data) {
            document.getElementById("newtrackererror").innerHTML = "";
            getTrackers();
        });
    }

    /***********
    * updateTrackerTeam function
    *
    * This function will update a tracker's team assignment
    ***********/
    function changeTrackerTeam(call, element) {
        var tactical = element.options[element.selectedIndex].value;


        $.get("changetrackerteam.php?callsign=" + call + "&tactical=" + tactical, function(data) {
            document.getElementById("newtrackererror").innerHTML = "";
            getTrackers();
        });
    }


    /***********
    * getTrackers function
    *
    * This function queries the backend for the list of flights, then the list of trackers and their current flight assignments
    * ...then will create the table for displaying the tracking teams
    ***********/
function getTrackers() {
    $.get("gettrackers.php", function(data) {
        //var trackerJson = JSON.parse(data);
        var trackerJson = data;
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
    });
}



    /***********
    * startUpProcesses
    *
    * This function will submit a request to the backend web system to start the various daemons for the system.
    ***********/
    function startUpProcesses() {
        if (!processInTransition) {
            processInTransition = 1;
            var startinghtml = "<mark>Starting...</mark>";
            $("#systemstatus").html(startinghtml);
            $.get("startup.php", function(data) {
                var startedhtml = "<mark>Started.</mark>";
                $("#systemstatus").html(startedhtml)
                getProcessStatus();
                processInTransition = 0;
            });;
        }
    }


    /***********
    * shutDownProcesses
    *
    * This function will submit a request to the backend web system to kill/stop the various daemons for the system.
    ***********/
    function shutDownProcesses() {
        if (!processInTransition) {
            processInTransition = 1;
            var stoppinghtml = "<mark>Shutting down...</mark>";
            $("#systemstatus").html(stoppinghtml);
            $.get("shutdown.php", function(data) { 
                var stoppedhtml = "<mark>Stopped.</mark>";
                $("#systemstatus").html(stoppedhtml)
                getProcessStatus();
                processInTransition = 0;
            });
        }
    }


    /***********
    * updateLivePacketStream function
    *
    * This function queries the lastest packets heard (from anywhere)
    ***********/
    function updateLivePacketStream() {
        if (livePacketStreamState)
            document.dispatchEvent(updateLivePacketStreamEvent); 
    }


    /***********
    * clearLivePacketFilters function
    *
    * This function clears the filter fields on the Live Packet Stream tab 
    ***********/
    function clearLivePacketFilters() {
        document.getElementById("searchfield").value = "";
        document.getElementById("searchfield2").value = "";
        document.getElementById("operation").selectedIndex = 0;
        document.getElementById("packetdata").innerHTML = "";
        document.getElementById("packetcount").innerHTML = "0";
        updateLivePacketStream();
    }


    /***********
    * displayLivePackets function
    *
    * This function updates the Live Packet Stream tab with new packets after applying any user defined filters
    ***********/
    function displayLivePackets() {
        var packets = JSON.parse(packetdata);
        var html = "";
        var keys = Object.keys(packets);
        var key;
        var searchstring = document.getElementById("searchfield").value;
        var searchstring2 = document.getElementById("searchfield2").value;
        var operation = document.getElementById("operation").value;
        var i = 0;
 
        //document.getElementById("debug").innerHTML = operation;
        for (key in keys) {
           if (operation == "and") {
               if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 &&
                   packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) >= 0) {
                   html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                   i += 1;
               }
           }
           else if (operation == "or") {
               if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 || 
                   packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) >= 0) {
                   html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                   i += 1;
               }
           }
           else if (operation == "not") {
               if (searchstring.length > 0 && searchstring2.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 && 
                       packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) < 0) {
                       html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                       i += 1;
                   }
               }
               else if (searchstring.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0) {
                       html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                       i += 1;
                   }
               }
               else if (searchstring2.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) < 0) {
                       html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                       i += 1;
                   }
               }
               else {
                   html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                   i += 1;
               }
               
           }

        }
        document.getElementById("packetdata").innerHTML = html;
        document.getElementById("packetcount").innerHTML = i.toLocaleString();
    }


    /***********
    * getLivePackets function
    *
    * This function gets the most recent live packets for the Live Packet Stream tab
    ***********/
    function getLivePackets() {
      if (livePacketStreamState) {
          var url;

          if (currentflight == "allpackets")
              url = "getallpackets.php";
          else
              url = "getpackets.php?flightid=" + currentflight;
 
          packetdata = {};
          $.get(url, function(data) { 
              packetdata = data;
              updateLivePacketStream(); 
          });
        }
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
    * getProcessStatus function
    *
    * This function queries the status of processes
    ***********/
    function getProcessStatus() {
      $.get("getstatus.php", function(data) {
          var statusJson = data;
          var keys = Object.keys(statusJson.processes);
          var i = 0;
          var k = 0;

          /* Loop through the processes and update their status */
          for (i = 0; i < keys.length; i++) {
              document.getElementById(statusJson.processes[i].process + "-status").innerHTML = "<mark style=\"background-color:  " + (statusJson.processes[i].status > 0 ? "lightgreen;\">[Okay]" : "red;\">[Not okay]") + "</mark>";
              k += statusJson.processes[i].status;
          }

          var donehtml = "<mark>Not running.</mark>";
          if (statusJson.rf_mode == 1 && k >= keys.length)
              donehtml = "<mark style=\"background-color: lightgreen;\">Running.</mark>";
          if (statusJson.rf_mode == 0 && k >= keys.length-1)
              donehtml = "<mark style=\"background-color: lightgreen;\">Running in online mode.</mark>";
          $("#systemstatus").html(donehtml);
      });
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

        // get the current GPS location and update the GPS status box.  Input variable is true so as to update the map with the initial GPS location 
        setTimeout( function() {
            getgps(true);
        }, 10);

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
        speedStatusBox = L.control.box({ callback: centerFollow, position: "centertop" });

        // Add the HUD to the bottom center
        hud = L.control.flighthud({ position: "centerbottom", flights: flightids});

        // startup SSE operations.
        setupSSE("ssestream.php");
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
    ***********/
    function initialize_layers() {
        // Layer groups for all stations and just my station.  This allows toggling the visibility of these two groups of objects.
        var allstations = L.markerClusterGroup();
        //var allstations = L.layerGroup();
        var allrfstations = L.layerGroup();
        //var allrfstations = L.markerClusterGroup();
        var mystation = L.layerGroup();
        //var wxstations = L.layerGroup();
        var wxstations = L.markerClusterGroup();

        // Layer group for trackers that are not assigned to a specific flight
        var trackersatlarge = L.layerGroup();

        allStationsLayer = createRealtimeLayer("", false, allstations, 5 * 1000, mapStyle);
        rfStationsLayer = createRealtimeLayer("", false, allrfstations, 5 * 1000, mapStyle);
        if (showallstations == 1) {
            allStationsLayer.addTo(map); 
            rfStationsLayer.addTo(map); 
        }

        //var b = createRealtimeLayer("getmystation.php", true, mystation, 5 * 1000, mapStyle);
        //var c = createRealtimeLayer("gettrackerstations.php", true, trackersatlarge, 5 * 1000, mapStyle);
        myPositionLayer = createRealtimeLayer("", false, mystation, 5 * 1000, mapStyle);
        trackersAtLargeLayer = createRealtimeLayer("", false, trackersatlarge, 5 * 1000, mapStyle);
        weatherStationsLayer = createRealtimeLayer("", false, wxstations, 5 * 1000, mapStyle);
        myPositionLayer.addTo(map);

        // Add our current position to the map if available, otherwise, it'll get added to the map as position updates come in.
        if (lastposition) 
            myPositionLayer.update(lastposition);

        trackersAtLargeLayer.addTo(map);

        layerControl.addOverlay(trackersatlarge, "Trackers at Large", "Other Stations");
        layerControl.addOverlay(wxstations, "Weather Stations", "Other Stations");
        layerControl.addOverlay(allrfstations, "Other Stations (RF only)", "Other Stations");
        layerControl.addOverlay(allstations, "Other Stations (Inet only)", "Other Stations");
        layerControl.addOverlay(mystation, "My Location", "Other Stations");

        // Get an update from the all, rf, and weather stations
        setTimeout( function() {
            updateOtherStations("full");
        }, 20);


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
            var trackerstationslayer = L.layerGroup();
            var beacons = [];

            for (key2 in flightids[key].callsigns) {
                var activeflightlayer = L.featureGroup();

                /* The active flight layer */
                var r = createActiveFlightsLayer("",
                    activeflightlayer, 
                    5 * 1000, 
                    flightids[key].flightid + flightids[key].callsigns[key2]
                );
                r.addTo(map);
                beacons.push({ 
                    "callsign": flightids[key].callsigns[key2], 
                    "layer": r,
                    "json": []
                });

                /* Add these layers to the map's layer control */
                layerControl.addOverlay(activeflightlayer, flightids[key].callsigns[key2], "Flight:  " + flightids[key].flightid);
            }

            /* The Trackers and Predict File layers */
            var d = createRealtimeLayer("", false, trackerstationslayer, 5 * 1000, function(){ return { color: 'black'}});
            var e = createFlightPredictionLayer("", predictedpathlayer, 5 * 1000);

            /* The landing prediction layer */
            var f = createLandingPredictionsLayer("", landingpredictionlayer, 
                5 * 1000,
                flightids[key].flightid
            );

            /* prediction layer for early cutdown */
            var g = createLandingPredictionsLayer("", cutdownpredictionlayer, 
                5 * 1000,
                flightids[key].flightid,
                landingPredictionStyleCutdown
            );
            d.addTo(map);
            f.addTo(map);
            g.addTo(map);

            /* Add these layers to the map's layer control */
            layerControl.addOverlay(trackerstationslayer, "Trackers", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(predictedpathlayer, "Pre-Flight Predicted Path", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(landingpredictionlayer, "Landing Predictions", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(cutdownpredictionlayer, "Cutdown Predictions", "Flight:  " + flightids[key].flightid);

            flightList.push({
                "flightid": flightids[key].flightid,
                "trackerlayer": d,
                "predictlayer": e,
                "landinglayer": f,
                "cutdownlayer": g,
                "lastupdate": Date.now() / 1000,
                "beacons": beacons
            });
         }

        // Call update flight function to populate data...  
        setTimeout( function() {
            updateFlightData("full");
        }, 20);
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

        setTimeout(function() {
            // Update the flight sidebar content
            var flight;
            var allHtml = "<input type=\"radio\" id=\"allpackets\" name=\"flightLivePacketStream\" value=\"allpackets\" checked > All packets (< 3hrs) &nbsp; &nbsp;";
            //var livePacketStreamHTML = "<form>" + allHtml;
            var i = 0;
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
        },10);

        // The idea is to stagger the loading of these so that the browser isn't bogged down at first load.
        //
        // Build the gauges and charts
        setTimeout(function() { buildGauges(); buildCharts() }, 10);

        // load map layers
        setTimeout(function() { initialize_layers(); }, 15);

        // Read in the configuration
	    setTimeout(function() { getConfiguration(); }, 20);

        // Get the status of running processes
        setTimeout(function() { getProcessStatus(); }, 30);

        // Build the charts
        //setTimeout(function() { buildCharts(); }, 35);

        // build the Trackers table
        setTimeout(function() { getTrackers(); }, 40);

        // Update all things on the map.  Note:  updateAllItems will schedule itself to run every 5 seconds.  No need for a setInterval call.
        if (updateTimeout)
            clearTimeout(updateTimeout);
        updateTimeout = setTimeout(function() {updateAllItems("notfull");}, 5000); 

        // When this map screen loses focus and then the user returns...
        window.onfocus = gainFocus;
        window.onblur = lostFocus;

        //document.getElementById("screenw").innerHTML = window.innerWidth;
        //document.getElementById("screenh").innerHTML = window.innerHeight;
        // Listener so that the charts for flights are resized when the screen changes size.
        window.addEventListener("resize", function() {
            //document.getElementById("screenw").innerHTML = window.innerWidth;
            //document.getElementById("screenh").innerHTML = window.innerHeight;
            resizeCharts();
        });

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

        // listen for new gps position alerts
        packetsource.addEventListener("new_position", function(event) {

            // Parse the incoming json
            var gpsjson = JSON.parse(event.data);

            // if geojson was returned, then we send it to the "mylocation" layer for updating the map.
            if (gpsjson && gpsjson.properties && gpsjson.geometry) {

                var ts = new Date(gpsjson.properties.tm);
                var tmstring = getISODateTimeString(ts);

                // Create a feature collection object out of gpsjson
                // set the lastlocation variable to output
                lastposition = {
                    "type": "FeatureCollection",
                    "properties": {
                      "name": "My station"
                    },
                    "features": [
                      {
                        "type": "Feature",
                        "properties": {
                            "type": "Feature",
                            "speed_mph": (gpsjson.properties.speed_math ? Math.floor(gpsjson.properties.speed_mph) : 0),
                            "altitude": gpsjson.properties.altitude_ft,
                            "bearing": (gpsjson.properties.bearing ? Math.floor(gpsjson.properties.bearing) : 0 ),
                            "time": tmstring,
                            "gps": (gpsjson.properties.gps ? gpsjson.properties.gps : {}),
                            "callsign": "My Location",
                            "tooltip": "",
                            "id": "My Location",
                            "symbol": "1x",
                            "comment": "",
                            "frequency": "",
                            "iconsize": "24"
                        },
                        "geometry": gpsjson.geometry
                      }
                    ]
                };

                var thisfeature = lastposition.features[0];

                // update the position icon on the map
                if (myPositionLayer) 
                    myPositionLayer.update(lastposition);

                // Pan the map to the latest location
                if (followme) {
                    dispatchPanToEvent(thisfeature.geometry.coordinates[1] * 1.0, thisfeature.geometry.coordinates[0] * 1.0);
                }

                // Update the speed status box
                if (speedStatusBox)
                    speedStatusBox.show(Math.round(thisfeature.properties.speed_mph * 1.0).toLocaleString() + "<font style=\"font-size: .2em;\"> mph</font>");

                // Now update the relative position gauges and fields
                updateRelativePosition(thisfeature);

            }
        });
    }
}



    /***********
    * getgps
    *
    * This function will get the current status of the GPS that's connected to the system and populate the web page with its status/state
    ***********/
    function getgps(updatelocation) {

        var p = (updatelocation ? true : false);

        $.get("getgps.php", function(data) {
            var jsonData = JSON.parse(data);
            var gpsfix;
            var gpsMode;
            var updateloc = p;

            gpsMode = jsonData.mode * 10 / 10;

            if (jsonData.status == "no device") {
                gpsStatusBox.show("GPS: <mark class=\"notokay\">[ NO DEVICE ]</mark>");
            }
            else {
                if (gpsMode == 0) {
                    gpsfix = "GPS: <mark class=\"notokay\">[ NO DATA ]</mark>";

                    // Update the speed status box with no speed as we don't have a 3D fix from the GPS
                    if (speedStatusBox)
                        speedStatusBox.show("--<font style=\"font-size: .2em;\"> mph</font>");
                }
                else if (gpsMode == 1) {
                    gpsfix = "GPS: <mark class=\"notokay\">[ NO FIX ]</mark>";

                    // Update the speed status box with no speed as we don't have a 3D fix from the GPS
                    if (speedStatusBox)
                        speedStatusBox.show("--<font style=\"font-size: .2em;\"> mph</font>");
                }
                else if (gpsMode == 2) {
                    gpsfix = "GPS: <mark class=\"marginal\">[ 2D ]</mark>";

                    // Update the speed status box with no speed as we don't have a 3D fix from the GPS
                    if (speedStatusBox)
                        speedStatusBox.show("--<font style=\"font-size: .2em;\"> mph</font>");
                }
                else if (gpsMode == 3) {
                    gpsfix = "GPS: <mark class=\"okay\">[ 3D ]</mark>";
                    
                    // if we're asked to update the "blue dot" location on the map
                    if (updateloc) {

                        // the current date/time
                        var ts = new Date(Date.now());
                        var tmstring = getISODateTimeString(ts);

                        // Create a feature collection object out of gpsjson
                        // set the lastlocation variable to output
                        lastposition = {
                            "type": "FeatureCollection",
                            "properties": {
                              "name": "My station"
                            },
                            "features": [
                              {
                                "type": "Feature",
                                "properties": {
                                    "type": "Feature",
                                    "speed_mph": (jsonData.speed_math ? Math.floor(jsonData.speed_mph) : 0),
                                    "altitude": jsonData.altitude * 1.0,
                                    "bearing": (jsonData.bearing ? Math.floor(jsonData.bearing) : 0 ),
                                    "time": tmstring,
                                    "gps": {},
                                    "callsign": "My Location",
                                    "tooltip": "",
                                    "id": "My Location",
                                    "symbol": "1x",
                                    "comment": "",
                                    "frequency": "",
                                    "iconsize": "24"
                                },
                                "geometry": { 
                                    "coordinates": [ jsonData.lon * 1.0, jsonData.lat * 1.0 ],
                                    "type": "Point"
                                }
                              }
                            ]
                        };

                        var thisfeature = lastposition.features[0];

                        // update the position icon on the map
                        if (myPositionLayer) 
                            myPositionLayer.update(lastposition);

                        if (followme)
                            dispatchPanToEvent(thisfeature.geometry.coordinates[1] * 1.0, thisfeature.geometry.coordinates[0] * 1.0);

                        // Update the speed status box
                        if (speedStatusBox)
                            speedStatusBox.show(Math.round(thisfeature.properties.speed_mph * 1.0).toLocaleString() + "<font style=\"font-size: .2em;\"> mph</font>");

                        // Now update the relative position gauges and fields
                        updateRelativePosition(thisfeature);

                    }
                }
                else
                    gpsfix = "Unable to get GPS status";
                
                // Now update the GPS status box
                if (gpsStatusBox)
                    gpsStatusBox.show(gpsfix);
            }
        });
    }


    /***********
    * centerFollow
    *
    * This function will center the map over the user's current location and initiate followme mode
    ***********/
    function centerFollow(onoff) {
        var feature;

        // If selected, then pan the map to the current user's location and enable followme mode
        if (onoff) {
            followme = true;

            if (lastposition && lastposition.type) {
                if (lastposition.type == "FeatureCollection" && lastposition.features)
                    feature = lastposition.features[0];
                else if (lastposition.type = "Feature")
                    feature = lastposition;

                if (feature)
                    dispatchPanToEvent(feature.geometry.coordinates[1] * 1.0, feature.geometry.coordinates[0] * 1.0);
            }
        }

        // ...otherwise we simply turn off followme mode
        else {
            followme = false;
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


                            if (trackersJSON.features.length > 0) {
                                var x;
                                var f = trackersJSON.features;

                                // Remove this tracker from the Trackers At Large layer...
                                for (x in f) {
                                    var thisone = {"features" : [{"properties" : {"id": f[x].properties.id}}]};
                                    var y;

                                    if (typeof(trackersAtLargeLayer.getFeature(f[x].properties.id)) != "undefined") {
                                        trackersAtLargeLayer.remove(thisone);
                                    }

                                    var z;
                                    // Remove this tracker from a different flight's tracker list...
                                    for (z in flightList) {
                                        if (flightList[z].flightid != fid) {
                                            if (typeof(flightList[z].trackerlayer.getFeature(f[x].properties.id)) != "undefined") {
                                                flightList[z].trackerlayer.remove(thisone);
                                            }
                                        }
                                    }
                                }
                                flight.trackerlayer.update(trackersJSON);
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
                            pruneRealtimeLayer(flight.trackerlayer, cutoff);

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

            if (typeof(data.inetstations) != "undefined") {
                if (data.inetstations.features.length > 0) {
                    if (is_incremental) {
                        var x;
                        var f = data.inetstations.features;

                        // Remove this station from the RF Stations layer as it's now shown up as an Internet-discovered one...
                        for (x in f) {
                            var thisone = {"features" : [{"properties" : {"id": f[x].properties.id}}]};
                            if (typeof(rfStationsLayer.getFeature(f[x].properties.id)) != "undefined") {
                                rfStationsLayer.remove(thisone);
                            }
                        }
                    }
                    allStationsLayer.update(data.inetstations);
                }
            }
            if (typeof(data.rfstations) != "undefined") {
                if (data.rfstations.features.length > 0) {
                    if (is_incremental) {
                        var x;
                        var f = data.rfstations.features;

                        // Remove this station from the Ineternet Stations layer as it's now shown up as an RF-discovered one...
                        for (x in f) {
                            var thisone = {"features" : [{"properties" : {"id": f[x].properties.id}}]};
                            if (typeof(allStationsLayer.getFeature(f[x].properties.id)) != "undefined") {
                                allStationsLayer.remove(thisone);
                            }
                        }
                    }

                    rfStationsLayer.update(data.rfstations);
                }
            }
            if (typeof(data.weatherstations) != "undefined")
                weatherStationsLayer.update(data.weatherstations);
            if (typeof(data.trackerstations) != "undefined") {
                if (data.trackerstations.features.length > 0) {
                    var x;
                    var f = data.trackerstations.features;

                    // Remove this tracker from any flight specific tracker list...
                    for (x in f) {
                        var thisone = {"features" : [{"properties" : {"id": f[x].properties.id}}]};
                        var y;

                        for (y in flightList) {
                            if (typeof(flightList[y].trackerlayer.getFeature(f[x].properties.id)) != "undefined") {
                                flightList[y].trackerlayer.remove(thisone);
                            }
                        }
                    }
                    trackersAtLargeLayer.update(data.trackerstations);
                }

            }

            // We no longer update our location on the map from this periodic poll of the backend.  Position updates are handled through setupSSE now.
            //if (typeof(data.myposition) != "undefined")
            //    myPositionLayer.update(data.myposition);

            // Prune off any RF, inet, or weather stations
            var cutoff = new Date(Date.now() - lookbackPeriod * 60000);
            var layers = [allStationsLayer, rfStationsLayer, weatherStationsLayer, myPositionLayer, trackersAtLargeLayer];

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

            // APRS messages packets
            if (typeof(data.messages) != "undefined") {
                updateMessagesTable(data.messages);
            }

        });
    }



    /************
     * updateMessagesTable
     *
     * With a list of messages as input, create a table within the sidebar for these APRS message packets highlighting any that are addressed to mycallsign.
     *
     * Example:  [{"thetime":"2021-11-12T07:22:52.392","callsign_from":"SP9UOB-12","callsign_to":"EMAIL-2","the_message":"sp9uob@gmail.com tracker boot 2630 144390000 kHz last=50.33168,-125.64470 rtc=396","message_num":"2630"}]
    *************/
    function updateMessagesTable(msgs) {
        var keys = Object.keys(msgs);

        // the element that we'll ultimately load our content into
        var container = document.getElementById("packetdata");

        // the table itself
        var table = document.createElement("table");
        table.setAttribute("class", "packetlist");
        table.setAttribute("width", "100%");

        // the columns
        //var columns = ["Time", "To", "From", "Msg #"];
        var columns = ["Time", "Message"];

        // Add the header row
        var row = table.insertRow(-1);
        columns.forEach(function(l) {
            var headerCell = row.insertCell(-1);
            headerCell.innerHTML = l;
            headerCell.setAttribute("class", "packetlistheader");
        });

        // Now add the messages themselves to the table
        if (keys.length == 0) {
            row = table.insertRow(-1);
            var blankcell1 = row.insertCell(-1);
            var blankcell2 = row.insertCell(-1);
            blankcell1.setAttribute("class", "packetlist");
            blankcell2.setAttribute("class", "packetlist");
            blankcell1.innerHTML = "n/a";
            blankcell2.innerHTML = "No messages available.";
        }
        else {
            msgs.forEach(function(m, i) {

                // Make sure all of the JSON elements are defined
                if (typeof(m.callsign_to) == "undefined" ||
                    typeof(m.callsign_from) == "undefined" ||
                    typeof(m.thetime) == "undefined" || 
                    typeof(m.the_message) == "undefined" ||
                    typeof(m.message_num) == "undefined" ||
                    typeof(m.sat) == "undefined") {
                    return;
                }


                // create a row for this message
                row = table.insertRow(-1);

                // Cells for each data element
                var time = row.insertCell(-1);
                var content = row.insertCell(-1);

                var classlist = "packetlist";

                // change the background color on every other row
                if (i % 2) {
                    classlist = "packetlist highlight";
                }

                // If this message is addressed directly to "mycallsign", then change the highlighting
                if (mycallsign == m.callsign_to.toUpperCase()) {
                    classlist = "packetlist important";
                }

                time.setAttribute("class", classlist + " normal");
                content.setAttribute("class", classlist + " monospace");

                // create a new date object fromt the time
                var thetime = new Date(m.thetime);

                // create a 24hr time string
                var time_string = (thetime.getHours() < 10 ? "0" : "") + thetime.getHours() + ":" 
                    + (thetime.getMinutes() < 10 ? "0" : "") + thetime.getMinutes() + ":" 
                    + (thetime.getSeconds() < 10 ? "0" : "") + thetime.getSeconds();

                // Was this to/from a satellite?
                var sat = "";
                if (m.sat * 1.0 == 1) 
                    sat = "<br><mark class=\"okay\">[ Satellite ]</mark>";

                // Search through the map layers to determine if the sender of this message is on the map
                // First, look through the RF stations layer (as that's likely where the station is...so we search it first).
                var found = rfStationsLayer.getFeature(m.callsign_from.toUpperCase());

                // if not found, then we next check the at large trackers layer
                if (!found) 
                    found = trackersAtLargeLayer.getFeature(m.callsign_from.toUpperCase());

                // if still not found, then we next check the the trackers layers from each active flight
                if (!found) {
                    flightList.forEach(function(f) {
                        var trackers = f.trackerlayer;
                        var id = trackers.getFeature(m.callsign_from.toUpperCase());

                        if (id)
                            found = id;
                    });
                }

                // If we found the sender's station on the map, then grab the lat/lon and create a hyperlink for panning the map.
                var fromStation;
                if (found && found.geometry.coordinates) {
                    var onclick;

                    onclick="(function () { if (!map.hasLayer(rfStationsLayer.options.container)) map.addLayer(rfStationsLayer.options.container); dispatchPanToEvent('" + found.geometry.coordinates[1] + "', '" + found.geometry.coordinates[0] + "'); })();";
                    fromStation = "<a href=\"#\"  onclick=\"" + onclick + "\">" + m.callsign_from.toUpperCase() + "</a>";
                }
                else
                    fromStation = m.callsign_from.toUpperCase();

                var html = "<table cellpadding=0 cellspacing=0 border=0><tr><td><font class=\"normal\">From: </font></td><td>" + fromStation + "</td></tr>"
                    + "<tr><td><font class=\"normal\">To: </font></td><td>" + m.callsign_to.toUpperCase() + "</td></tr>"
                    + "<tr><td><font class=\"normal\">Msg#: </font></td><td>" + (m.message_num ? m.message_num : "--") + "</td></tr></table>"
                    + "<p>" + m.the_message + "</p>";

                // Update content of the cells
                time.innerHTML = time_string + sat;
                content.innerHTML = html;

            });
        }


        // Blank the container to clear out any prior data
        container.innerHTML = "";

        // Now update with our content
        container.appendChild(table);

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
    function syncPackets() {

        // The URL for synchronizing packets with track.eoss.org.
        var url = "syncpackets.php";

        $.get(url, function(data) {
        });
    }


    /************
     * UpdateAllItems
     *
     * This function updates other parts of the instrumentation, charts, and tables.
     * This will update every chart/graph/table globally.
    *************/
    function updateAllItems(fullupdate) {

        // Update process status
        setTimeout(function() { getProcessStatus(); }, 20);

        // Update all, rf, and weather stations
        updateOtherStations(fullupdate);

        // Update all, rf, and weather stations
        updateFlightData(fullupdate);

        // Update the tracker list only if this is a full update
        setTimeout (function() {
            getTrackers();
        }, 10);

        // Update the TTL values
        checkTTL();

        // Update the GPS display for fix status (ex. 2D, 3D, etc)
        getgps();

        // pan the map to the last known position if we're in followme mode.
        var feature;
        if (followme && lastposition && lastposition.type) {
            if (lastposition.type == "FeatureCollection" && lastposition.features)
                feature = lastposition.features[0];
            else if (lastposition.type == "Feature")
                feature = lastposition;

            if (feature)
                dispatchPanToEvent(feature.geometry.coordinates[1] * 1.0, feature.geometry.coordinates[0] * 1.0);
        }

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
                syncPackets();
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
        updateTimeout = setTimeout(updateAllItems, 5000);
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


