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
    var updateTimeout;
    var sidebar;
    var layerControl;
    var tilelayer;
    var osmbright;
    var basic;
    var lookbackPeriod = 180;
    var updateType = "regular";

    // The user's location
    var mylocation_marker;
    var mystation;
    var locationSetup = false;
    var useGeoLocation = false;

    // these are for the Live Packet Stream tab
    var updateLivePacketStreamEvent;
    var packetdata;
    var currentflight;
    var livePacketStreamState = 0;;
    var processInTransition = 0;

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
                        (typeof(feature.geometry.coordinates) == "undefined" ? "" : 
                        "<br>Coords: <span id=\"" + id + "-coords\">"
                        + (feature.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                        + "</span>"
                        + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
			      (typeof(item.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (item.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
            typeof(feature.geometry.coordinates)   != "undefined") {


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
                $("#" + flightid + "_sidebar").data("lastfeature", feature);

                var bearing = feature.properties.bearing * 1.0;
                var lat = feature.geometry.coordinates[1] * 1.0;
                var lon = feature.geometry.coordinates[0] * 1.0;
                var alt = feature.properties.altitude * 1.0;
                var spd = feature.properties.speed * 1.0;
                var vrate = feature.properties.verticalrate * 1.0;



                //******** start: Update the ttl value **********
                var ttl = "";
                var ttl_string = "n/a";
                if (typeof(feature.properties.ttl) != "undefined") {
                    if (feature.properties.ttl != "") 
                        ttl_string = feature.properties.ttl + " mins";
                    var elem = "#" + flightid + "_ttl";
                    $(elem).text(ttl_string);
                }
                //******** end: Update the ttl value **********



                //******** start: Update the relative position table for this flight *******
                // These are the values that are stuck in the table
                var celement = "#" + flightid + "_relativeballooncoords";

                // Determine the relative bearing based on GPS heading and the 
                $(celement).text(lat.toFixed(4) + ", " + lon.toFixed(4));
                //******** end: Update the relative position dials for this flight *******


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
                
                
                //******** start: Update the packet receive path for this flight **********
                //
                //
                //******** end: Update the packet receive path for this flight **********
            }
        }
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
			      (typeof(feature.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (feature.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
			      (typeof(item.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (item.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
    function createLandingPredictionsLayer(url, container, interval, fid) {
        return L.realtime(url, {
            interval: interval,
            container: container,
            removeMissing: false,
            start: false,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            name: fid,
            style:  landingPredictionStyle,
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

			      (typeof(feature.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (feature.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">") +
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
			      (typeof(item.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (item.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
                        (typeof(feature.geometry.coordinates) == "undefined" ? "" : 
                        "<br>Coords: <span id=\"" + id + "-coords\">"
                        + (feature.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                        + "</span>"
                        + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
			      (typeof(item.geometry.coordinates) == "undefined" ? "" : 
                  "<br>Coords: <span id=\"" + id + "-coords\">"
                  + (item.geometry.coordinates[1] * 10 / 10).toFixed(4) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(4) 
                  + "</span>"
                  + " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">" ) +
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
        var trackerJson = JSON.parse(data);
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
          /* Loop through the processes and update their status */
          for (i = 0; i < keys.length; i++) {
              if (statusJson.processes[i].process == "habtracker-d") {
                  k += statusJson.processes[i].status;
              }
          }

          var donehtml = "<mark>Not running.</mark>";
          if (statusJson.rf_mode == 0 && k >= 1)
              donehtml = "<mark style=\"background-color: lightgreen;\">Running in online mode.</mark>";
          $("#systemstatus").html(donehtml);
      });
    }


    /***********
    * initialize_map function
    *
    * This function creates the map.  It should be called first.
    ***********/
    function initialize_map() {
        var baselayer;
        var overlays;

        osmbright = L.mapboxGL({
            style: '/tileserver/styles/osm-bright/style.json',
            attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
        });

        basic = L.mapboxGL({
            style: '/tileserver/styles/klokantech-basic/style.json',
            attribution: '<a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/">© OpenStreetMap</a> contributors'
        });


        // Create a map object. 
	    map = new L.Map('map', {
            //renderer : canvasRenderer,
            preferCanvas:  true,
            zoomControloption: false,
            layers : [ basic ],
            minZoom: 4,
            maxZoom: 20
        });

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

        baselayer = { "Basic Map" : basic, "Bright Map" : osmbright };
 
        // use the grouped layers plugin so the layer selection widget shows layers categorized
        layerControl = L.control.groupedLayers(baselayer, {}, { groupCheckboxes: true}).addTo(map); 

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
        var scale = L.control.scale({position: 'bottomright', maxWidth: 200}).addTo(map);

	    // add a widget in the upper right hand corner for adding waypoints
	    var marker_control = new L.Control.SimpleMarkers({marker_draggable: true});
	    map.addControl(marker_control);

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
    * Set map center
    *
    * This function will set the map center based on the current latitude, longitude, and zoom level in the global variables:
    *     latitude
    *     longitude
    *     zoom
    * 
    * It will also be the intial query (to the user) for getting the browser's location.  The results of query are saved so we no longer ask the user for permission, etc..
    ***********/
    function set_map_center() {

        if (latitude != 0 && longitude != 0 && zoom != 0) {
            // if the latitude, longitude, and zoom global variables are set, then set the map center to those coords
            map.setView(new L.latLng(latitude, longitude), zoom);
            setGeoWatch();
        }
        else {
            // Otherwise, get the starting map position from the gpsposition table on the server
            $.get("getposition.php", function(data) {
                var lastposition = JSON.parse(data);
                var lat = lastposition.geometry.coordinates[1];
                var lon = lastposition.geometry.coordinates[0];

                map.setView(new L.latLng(lat, lon), 10);
                setGeoWatch();
            });
        }
    }


    /***********
    * setGeoWatch
    *
    * This function starts the watch function for the browser's location
    ***********/
    function setGeoWatch() {
        var options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        };

        // Get the current location of the user's browser so we know where to put the "My Location" icon.  
        // The user will have to allow this via their browser permissions.
        if (navigator.geolocation) {
            navigator.geolocation.watchPosition(function(position) {
                useGeoLocation = true;
                setMyLocation(position);
            }, function(err) {
                // unable to get position from user's browser...for some reason.
                useGeoLocation = false;
            },
            options);
        }
    }


   /***********
    * setMyLocation
    *
    * This function is the callback function that the geolocation API, watchPosition, will call when the user's location has changed
    ***********/
    function setMyLocation(position) {
        var lat = Number(position.coords.latitude);
        var lon = Number(position.coords.longitude);
        var heading = (typeof(position.coords.heading) == "undefined" ? 0 : Number(position.coords.heading));
        var elevation = (typeof(position.coords.altitude) == "undefined" ? 0 : Number(position.coords.altitude * 3.2808));

        // call to update the location marker on the map
        // the date/time for right now
        var d = new Date();

        //Construct strings with the date and time
        var thetime = d.toLocaleTimeString();

        // The HTML that will be inserted into the marker's popup box
        var html = "<a target=\"_blank\" href=\"index.php?followme=true" +
            "&latitude=" + lat +
            "&longitude=" + lon +
            "&zoom=" +
            map.getZoom() +
            "&showallstations=0\"><strong>My Location</strong></a>" +
            (typeof(position.coords.altitude) != "undefined" ? "<br>Altitude: <font class=\"altitudestyle\">" + Math.round(position.coords.altitude * 3.2808).toLocaleString() + "ft</font>" : "") +
            (typeof(position.coords.heading) != "undefined" ?  "<br>Heading: " + Math.round(position.coords.heading * 1.0).toLocaleString() + "&deg;" : "") +
            (typeof(position.coords.speed) != "undefined" ?    "<br>Speed: " + Math.round(position.coords.speed * 2.236936).toLocaleString() + "mph" : "") +
            "<br>Coords: <span id=\"mylocation-coords\">" +
            lat.toFixed(4) + ", " + lon.toFixed(4) +
            "</span>" +
            " &nbsp; <img src=\"/images/graphics/clipboard.png\" style=\"vertical-align: bottom; height: 15px; width: 15px;\" onclick=\"copyToClipboard('mylocation-coords')\">" +
            "<br>Time: " +
            thetime;

        // if this is the first time through, then we need to create the My Location layer, the marker, and finally add that to the map.  In addition to create the relative position instruments.
        if (locationSetup == false) {

            // For the first time through, create the relative gauges within the sidebar for each flight.
            buildRelativeGauges();

            mystation = L.layerGroup();
            layerControl.addOverlay(mystation, "My Location", "Other Stations");

            var myIcon = L.icon({
                iconUrl: "/images/aprs/1x.png",
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -12],
                tooltipAnchor: [0, 22]
            });

            // The marker for My Location
            mylocation_marker = L.marker(new L.latLng(lat, lon), { icon: myIcon, pane: "otherStationsPane", riseOnHover: true });

            // Add a popup
            mylocation_marker.bindPopup(html);

            // Add this marker to the mystation layer group
            mystation.addLayer(mylocation_marker);

            // Add the mystation layer to the map
            mystation.addTo(map);

            // Pan the map to this location if it wasn't in followfeatureid mode
            if (latitude == 0 || longitude == 0 || zoom == 0) {
                map.panTo(new L.latLng(lat,lon));
            }

            // Set our flag variable to true so we don't get here a 2nd time.
            locationSetup = true;
        }
        else {
            mylocation_marker.setLatLng(new L.latLng(lat, lon));
            mylocation_marker.setPopupContent(html);
        }

        // Update the relative position instrumentation
        updateRelativeGauges(lat, lon, heading, elevation);

        // If we're following our own location, then pan the map to this new location
        if (followme == true) {
            map.panTo(new L.latLng(lat,lon));
        }
    }

    /***********
    * distance
    *
    * This function will calculate the distance in miles between two sets of coordinates
    ***********/
    function distance(lat1, lon1, lat2, lon2) {
        // Convert to Radians
        var rlon1 = lon1 * (Math.PI / 180);
        var rlon2 = lon2 * (Math.PI / 180);
        var rlat1 = lat1 * (Math.PI / 180);
        var rlat2 = lat2 * (Math.PI / 180);

        // Haversine formula
        var dlon = rlon2 - rlon1;
        var dlat = rlat2 - rlat1;
        var a = Math.pow(Math.sin(dlat/2), 2) + Math.cos(rlat1) * Math.cos(rlat2) * Math.pow(Math.sin(dlon/2), 2);
        var c = 2 * Math.asin(Math.sqrt(a));

        //#var r = 6371 // Radius of earth in kilometers. Use 3956 for miles
        var r = 3956 // Radius of earth in kilometers. Use 3956 for miles

        return c * r;
    }


    /***********
    * updateRelativeGauges
    *
    * This function will accept coordinates with the user's current position and upate the relative position gauges appropriately.
    ***********/
    function updateRelativeGauges(lat, lon, myheading, myelevation) {
        var flight;


        // Loop through each flight updating our relative position
        for (flight in flightids) {
            var data = $("#" + flightids[flight].flightid + "_sidebar").data();
            if (typeof(data.lastfeature) != "undefined") {

                // The last position JSON
                var lastposition = { "alt": data.lastfeature.properties.altitude * 1.0, "lat" : data.lastfeature.geometry.coordinates[1], "lon": data.lastfeature.geometry.coordinates[0] };

                // The distance between the user's position and the last position heard from the flight
                var dist = distance(lat, lon, lastposition.lat, lastposition.lon);

                // The value DOM elements
                var delement = "#" + flightids[flight].flightid + "_relativepositiondistance";

                // These are the gauges and their headers
                var eelement = "#" + flightids[flight].flightid + "_relativeelevationangle";
                var evelement = "#" + flightids[flight].flightid + "_relativeelevationanglevalue";
                var hvelement = "#" + flightids[flight].flightid + "_relativebearingvalue";
                var mhvelement = "#" + flightids[flight].flightid + "_myheadingvalue";

                // Compute the angles
                var azimuth = Math.floor(Math.atan2(lastposition.lon  - lon, lastposition.lat - lat) * 180.0 / Math.PI);
                var elevation_angle = Math.floor(Math.atan((lastposition.alt - myelevation) / (dist * 5280)) * 180.0 / Math.PI);
                myheading = Math.floor(myheading);
                var relativeBearing = azimuth - myheading;

                // If less than 0, we need to add (2 * Pi) aka 360deg. 
                if (relativeBearing < 0)
                    relativeBearing = 360 + relativeBearing;

                // Update the distance and balloon coords text fields
                $(delement).html(Math.floor(dist * 100) / 100 + " mi" + " @ " + azimuth + "&#176;");

                // Update the gauges
                $(hvelement).data("relativebearing").setRelativeHeading(myheading, azimuth);
                $(evelement).data("relativeangle").setElevationAngle(elevation_angle);

                // Update the headers for the gauges
                $(evelement).text(elevation_angle);
                $(hvelement).text(relativeBearing);
                $(mhvelement).text(myheading);
            }
        }

    }


 
    /***********
    * buildRelativeGauges
    *
    * This function will build out the relative gauges on the sidebar 
    ***********/
    function buildRelativeGauges() {

        var relativebearing;
        var relativeangle;
        var flight;

        // Loop through each flight building the HTML and the instrumentation within the appropriate location within the sidebar
        for (flight in flightids) {

            // Build the HTML for the gauges
            buildHTMLforGauges(flightids[flight].flightid);

            // The relative position instruments DOM elements
            var relativeBearingInstrument = "#" + flightids[flight].flightid + "_relativebearing";
            var relativeElevationInstrument = "#" + flightids[flight].flightid + "_relativeelevationangle";
            var relativeBearingValue = "#" + flightids[flight].flightid + "_relativebearingvalue";
            var relativeElevationValue = "#" + flightids[flight].flightid + "_relativeelevationanglevalue";

            // Create the indivudual gauges themselves
            relativebearing = $.flightIndicator(relativeBearingInstrument, 'relativeHeading', { showBox: true});
            relativeangle = $.flightIndicator(relativeElevationInstrument, 'elevationAngle', { showBox: true});
            $(relativeBearingValue).data('relativebearing', relativebearing);
            $(relativeElevationValue).data('relativeangle', relativeangle);
        }

    }



    /***********
    * initialize_other function
    *
    * This function performs all of the heavy lifting to init the data sources displayed on the map for non-flight sources.
    ***********/
    function initialize_layers() {
        // Layer groups for all stations and just my station.  This allows toggling the visibility of these two groups of objects.
        var allstations = L.markerClusterGroup();
        var wxstations = L.markerClusterGroup();
        //var allstations = L.layerGroup();
        //var wxstations = L.layerGroup();

        // Layer group for trackers that are not assigned to a specific flight
        var trackersatlarge = L.layerGroup();

        allStationsLayer = createRealtimeLayer("", false, allstations, 5 * 1000, mapStyle);
        if (showallstations == 1) {
            allStationsLayer.addTo(map); 
        }

        //var b = createRealtimeLayer("getmystation.php", true, mystation, 5 * 1000, mapStyle);
        //var c = createRealtimeLayer("gettrackerstations.php", true, trackersatlarge, 5 * 1000, mapStyle);
        trackersAtLargeLayer = createRealtimeLayer("", false, trackersatlarge, 5 * 1000, mapStyle);
        weatherStationsLayer = createRealtimeLayer("", false, wxstations, 5 * 1000, mapStyle);
        trackersAtLargeLayer.addTo(map);

        layerControl.addOverlay(trackersatlarge, "Trackers at Large", "Other Stations");
        layerControl.addOverlay(wxstations, "Weather Stations", "Other Stations");
        layerControl.addOverlay(allstations, "All Other Stations", "Other Stations");

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
            var trackerstationslayer = L.layerGroup();
            var beacons = [];

            for (key2 in flightids[key].callsigns) {
                var activeflightlayer = L.featureGroup();

                /* The active flight layer */
                //var r = createActiveFlightsLayer("getactiveflights.php?flightid=" + flightids[key].flightid + "&callsign=" + flightids[key].callsigns[key2],
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
            //var d = createRealtimeLayer("gettrackerstations.php?flightid=" + flightids[key].flightid, true, trackerstationslayer, 5 * 1000, function(){ return { color: 'black'}});
            //var e = createFlightPredictionLayer("getpredictionpaths.php?flightid=" + flightids[key].flightid, predictedpathlayer, 5 * 1000);
            var d = createRealtimeLayer("", false, trackerstationslayer, 5 * 1000, function(){ return { color: 'black'}});
            var e = createFlightPredictionLayer("", predictedpathlayer, 5 * 1000);

            /* The landing prediction layer */
            //var f = createLandingPredictionsLayer("getlandingpredictions.php?flightid=" + flightids[key].flightid, landingpredictionlayer, 
            var f = createLandingPredictionsLayer("", landingpredictionlayer, 
                5 * 1000,
                flightids[key].flightid
            );
            d.addTo(map);
            f.addTo(map);

            /* Add these layers to the map's layer control */
            layerControl.addOverlay(trackerstationslayer, "Trackers", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(predictedpathlayer, "Pre-Flight Predicted Path", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(landingpredictionlayer, "Landing Predictions", "Flight:  " + flightids[key].flightid);

            flightList.push({
                "flightid": flightids[key].flightid,
                "trackerlayer": d,
                "predictlayer": e,
                "landinglayer": f,
                "lastupdate": Date.now() / 1000,
                "beacons": beacons
            });
         }

        // Call update flight function to populate data...  
        setTimeout( function() {
            updateFlightData("full");
        }, 20);

        // Set up the map and get the My Location position
        set_map_center();
    }


    /************
     * startup
     *
     * This function performs some startup actions and calls "initialize", the primary function for starting the map stuff
    *************/
    function startup() {
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

                /*var rel_a = "#" + flightids[flight].flightid + "_relativepositionlink";
                var rel_l = "#" + flightids[flight].flightid + "_relativepositionsign";
                var rel_e = "#" + flightids[flight].flightid + "_relativeposition";
                */

                /*var lpp_a = "#" + flightids[flight].flightid + "_lastpacketpathlink";
                var lpp_l = "#" + flightids[flight].flightid + "_lastpacketpathsign";
                var lpp_e = "#" + flightids[flight].flightid + "_lastpacketpath";
                */

                $(pos_a).click({element: pos_e, link: pos_l }, toggle);
                $(stat_a).click({element: stat_e, link: stat_l }, toggle);
                $(inst_a).click({element: inst_e, link: inst_l }, toggle);
                $(alt_a).click({element: alt_e, link: alt_l }, toggle);
                $(vert_a).click({element: vert_e, link: vert_l }, toggle);
                /*$(rel_a).click({element: rel_e, link: rel_l }, toggle);
                $(lpp_a).click({element: lpp_e, link: lpp_l }, toggle);
                */

                // We use this to determine when the last packet came in for a given flight.
                $("#" + flightids[flight].flightid + "_sidebar").data("lastpacket", new Date("1970-01-01T00:00:00"));
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
	    //setTimeout(function() { getConfiguration(); }, 20);

        // Setup the listener
        setTimeout(function() { createTheListener(); }, 25);

        // Get the status of running processes
        setTimeout(function() { getProcessStatus(); }, 30);

        // Build the charts
        //setTimeout(function() { buildCharts(); }, 35);

        // build the Trackers table
        setTimeout(function() { getTrackers(); }, 40);

        // Update all things on the map.  Note:  updateAllItems will schedule itself to run every 5 seconds.  No need for a setInterval call.
        // We delay a couple of seconds before updating the full map/gauges/tables if the number of flights/beacons we're tracking is > 8 in an attempt
        // to not swamp the user's browser with updates upon first load.
        setTimeout(function() {updateAllItems("notfull");}, 5000); 

        // Listener so that the charts for flights are resized when the screen changes size.
        window.addEventListener("resize", function() {
            resizeCharts();
        });

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
            //var relativeBearingInstrument = "#" + flightids[flight].flightid + "_relativebearing";
            //var relativeElevationInstrument = "#" + flightids[flight].flightid + "_relativeelevationangle";

            var altitudeValue = "#" + flightids[flight].flightid + "_altitudevalue";
            var verticalRateValue = "#" + flightids[flight].flightid + "_verticalratevalue";
            var balloonHeadingValue = "#" + flightids[flight].flightid + "_headingvalue";
            var speedValue = "#" + flightids[flight].flightid + "_speedvalue";
            //var relativeBearingValue = "#" + flightids[flight].flightid + "_relativebearingvalue";
            //var relativeElevationValue = "#" + flightids[flight].flightid + "_relativeelevationanglevalue";

            altimeter = $.flightIndicator(altitudeInstrument, 'altimeter', { showBox: true });
            variometer = $.flightIndicator(verticalRateInstrument, 'variometer', { showBox: true});
            heading = $.flightIndicator(balloonHeadingInstrument, 'heading', { showBox: true});
            airspeed = $.flightIndicator(speedInstrument, 'airspeed', { showBox: true});
            //relativebearing = $.flightIndicator(relativeBearingInstrument, 'relativeHeading', { showBox: true});
            //relativeangle = $.flightIndicator(relativeElevationInstrument, 'elevationAngle', { showBox: true});

            $(altitudeValue).data('altimeter', altimeter);
            $(verticalRateValue).data('variometer', variometer);
            $(balloonHeadingValue).data('heading', heading);
            $(speedValue).data('airspeed', airspeed);
            //$(relativeBearingValue).data('relativebearing', relativebearing);
            //$(relativeElevationValue).data('relativeangle', relativeangle);
	    }
    }


    /************
     * buildHTMLforGauges
     *
     * This function builds the HTML part of the relative location gauges
    *************/
    function buildHTMLforGauges(theFlight) {
        var masterdiv = document.getElementById(theFlight + "_sidebar");
        var insertBeforeElem = document.getElementById(theFlight + "_positionpacketssection");

        // The overall DIV element that contains all of the relative gauge elements
        var newDIV = document.createElement("DIV");

        // The section header for the relative gauges
        var newP = document.createElement("P");

        // Paragraph attributes
        newP.setAttribute("class", "section-header");

        // Paragraph HTML
        newP.innerHTML = "<a href=\"#relative\" class=\"section-link\" id=\"" + theFlight + "_relativepositionlink\">(<span id=\"" + theFlight + "_relativepositionsign\" style=\"color: red;\">+</span>) Relative Position</a>:";

        // Overall div attributes
        newDIV.setAttribute("id", theFlight + "_relativeposition");
        newDIV.setAttribute("style", "display: none;");

        // Create the first row for the gauges section
        var tablediv1 = document.createElement("DIV");
        tablediv1.setAttribute("class", "div-table");

        var tablerow1 = document.createElement("DIV");
        tablerow1.setAttribute("class", "table-row");

        var cell1 = document.createElement("DIV");
        cell1.setAttribute("class", "panel-cell toprow bottomrow");
        cell1.innerHTML = "<div style=\"margin: 5px;\">" +
            "<div>&nbsp;</div>" +
            "<div id=\"" + theFlight + "_relativeelevationangle\"></div>" +
            "<div class=\"instrumenttitle\">Elev Angle</div>" +
            "<div>Angle: <span id=\"" + theFlight + "_relativeelevationanglevalue\">--</span>&#176;</div>" +
            "</div>";

        var cell2 = document.createElement("DIV");
        cell2.setAttribute("class", "panel-cell toprow bottomrow");
        cell2.innerHTML = "<div style=\"margin: 5px;\">" +
            "<div class=\"instrumenttitle\">My Hdng</div>" +
            "<div>Hdng: <span id=\"" + theFlight + "_myheadingvalue\">--</span>&#176;</div>" +
            "<div id=\"" + theFlight + "_relativebearing\"></div>" +
            "<div class=\"instrumenttitle bottomrow\">R. Brng</div>" +
            "<div>Brng: <span id=\"" + theFlight + "_relativebearingvalue\">--</span>&#176;</div>" +
            "</div>";

        tablerow1.appendChild(cell1);
        tablerow1.appendChild(cell2);
        tablediv1.appendChild(tablerow1);

        // Create the second row for the gauges section
        var tablediv2 = document.createElement("DIV");
        tablediv2.setAttribute("class", "div-table");

        var tablerow2 = document.createElement("DIV");
        tablerow2.setAttribute("class", "table-row");

        var cell3 = document.createElement("DIV");
        cell3.setAttribute("class", "table-cell header toprow");
        cell3.innerHTML = "Distance To Balloon";

        var cell4 = document.createElement("DIV");
        cell4.setAttribute("class", "table-cell header toprow");
        cell4.innerHTML = "Balloon Coords";

        tablerow2.appendChild(cell3);
        tablerow2.appendChild(cell4);
        tablediv2.appendChild(tablerow2);

        var tablerow3 = document.createElement("DIV");
        tablerow3.setAttribute("class", "table-row");

        var cell5 = document.createElement("DIV");
        cell5.setAttribute("class", "table-cell big");
        cell5.innerHTML = "<mark><span id=\"" + theFlight + "_relativepositiondistance\"></span></mark></div>";

        var cell6 = document.createElement("DIV");
        cell6.setAttribute("class", "table-cell big");
        cell6.innerHTML = "<mark><span id=\"" + theFlight + "_relativeballooncoords\"></span></mark></div>";

        tablerow3.appendChild(cell5);
        tablerow3.appendChild(cell6);
        tablediv2.appendChild(tablerow3);


        // Add the relative gauges section to the overall div
        newDIV.appendChild(tablediv1);
        newDIV.appendChild(tablediv2);


        // insert the section header and the overall div into the DOM
        masterdiv.insertBefore(newP, insertBeforeElem);
        masterdiv.insertBefore(newDIV, insertBeforeElem);

        // make sure the toggle functionality is working
        var rel_a = "#" + theFlight + "_relativepositionlink";
        var rel_l = "#" + theFlight + "_relativepositionsign";
        var rel_e = "#" + theFlight + "_relativeposition";

        $(rel_a).click({element: rel_e, link: rel_l }, toggle);

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

        /*$(hvelement).data("relativebearing").setRelativeHeading(0, 0);
        $(evelement).data("relativeangle").setElevationAngle(0);
        if ($(delement).length)
            $(delement).html("n/a");
        if ($(celement).length)
            $(celement).html("n/a");
        $(evelement).text("--");
        $(hvelement).text("--");
        $(mhvelement).text("--");
        */
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
                                updateStatusPackets(packetlist.statuspackets);
                            }

                            //if (packetlist.lastpacketpath) {
                            //    updateReceivePath(fid, packetlist.lastpacketpath);
                            //}

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
                                var lastpositionlist = [];

                                total_length += beacon_json.features.length;

                                if (beacon_json.features.length > 0) {
                                    var lastpacket = beacon_json.features[beacon_json.features.length - 1];

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
                    allStationsLayer.update(data.inetstations);
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

            // Prune off any RF, inet, or weather stations
            var cutoff = new Date(Date.now() - lookbackPeriod * 60000);
            var layers = [allStationsLayer, weatherStationsLayer, trackersAtLargeLayer];

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
     * UpdateAllItems
     *
     * This function updates other parts of the instrumentation, charts, and tables.
     * This will update every chart/graph/table globally.
    *************/
    function updateAllItems(fullupdate, fromFocus) {

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

        // ...the idea being that ever so often, we should try a special update
        if (globalUpdateCounter > 20) {
            // Set updateAllItems to run again in 5 seconds, but as a full.
            updateTimeout = setTimeout(function() {updateAllItems("full")}, 5000);
            globalUpdateCounter = 0;
        }
        else {
            // Set updateAllItems to run again in 5 seconds.
            updateTimeout = setTimeout(updateAllItems, 5000);
        }
        globalUpdateCounter += 1;

    }

