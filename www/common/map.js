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
    var flightTooltipPane;
    var otherTooltipPane;
    var otherStationsPane;
    var lastposition;
    var activeflights = [];
    var globalUpdateCounter = 0;
    var updateTimeout;

    // these are for the Live Packet Stream tab
    var updateLivePacketStreamEvent;
    var packetdata;
    var currentflight;
    var livePacketStreamState = 0;;
    var processInTransition = 0;

    // The list of realtime layers 
    var realtimeflightlayers = [];
    var realtimelayers = [];

    
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
                }
                if (descendingColorIndex > -1)
                    descending_color = descending_colorsets[descendingColorMap[descendingColorIndex].coloridx].color;
                else  {
                    i = 1;
                    descendingColorMap.push({ flightid : fid, coloridx : descending_color });
                }


                if (feature.properties.ascending) {
                    if (feature.properties.ascending == "true")
                        localstyle = { color : ascending_color, pane: 'pathsPane', weight: 2 };
                    else if (feature.properties.ascending == "false")
                        localstyle = { color : descending_color, pane: 'pathsPane', weight: 2 };
                }
                //errorhtml = document.getElementById("error-" + fid);
                //errorhtml.innerHTML = errorhtml.innerHTML + "<br>" + "[" + fid + ":" + id + "] colorIndex: " + colorIndex + ", len: " + ascending_colorsets.length;
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
        return L.geolayer(url, {
            interval: interval,
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
 
                    // If this is a balloon object then we want a hyperlink in the popup...
		            if (objecttype == "balloon") {
        			    html = "<a target=\"_blank\" href=\"map.php" + 
                            "?followfeatureid=" + feature.properties.id + 
	        		        "&latitude=" + feature.geometry.coordinates[1] + 
		        	        "&longitude=" + feature.geometry.coordinates[0] + 
			                "&zoom=" + mapzoom + "\">" +
        			        "<strong>" + feature.properties.callsign + "</strong></a>";
	        	    }
                    // ...if it's NOT a balloon (i.e. a path, or burst, or prior beacon location then we don't want a hyperlink in the popup.
                    else 
		            	html = "<strong>" + feature.properties.callsign + "</strong>";

                    // Update the popup content to include a number of balloon specific items
       		        html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
		                (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
		                (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + "MHz" : "" )) +
		                (typeof(feature.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (feature.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
		                (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time : ""));

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

		           return L.circleMarker(latlon, { radius: 3, fillColor: markercolor, fillOpacity: .9, stroke : false, fill: true });
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

            //document.getElementById("error-" + item.properties.flightid).innerHTML = JSON.stringify(item);

            // if this is a balloon object, then update it's html properties with a hyperlink...
            if (item.properties.objecttype == "balloon") {
                html = "<a target=\"_blank\" href=\"map.php" +
                      "?followfeatureid=" + item.properties.id + 
                      "&latitude=" + item.geometry.coordinates[1] + 
                      "&longitude=" + item.geometry.coordinates[0] + 
                      "&zoom=" + mapzoom + "\">" +
                      "<strong>" + item.properties.callsign + "</strong></a>";
            }
            //...otherwise, we don't want a hyper link because this is a path of some sort.
            else 
                html = "<strong>" + item.properties.callsign + "</strong>";

            // Update the popup content to include a number of balloon specific items
            html = html + (typeof(item.properties.comment) == "undefined" ? "" : (item.properties.comment != "" ? "<br><font class=\"commentstyle\">" + item.properties.comment + "</font>" : "")) + 
                (typeof(item.properties.altitude) == "undefined" ? "" : (item.properties.altitude != 0 && item.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (item.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
                (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + "MHz" : "" )) +
	  	      (typeof(item.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (item.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
                (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time : ""));

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
        return L.geolayer(url, {
            interval: interval,
            container: container,
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
		        	      (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + "MHz" : "" )) +
			              (typeof(feature.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (feature.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
        			      (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time : ""));

	        	    layer.bindPopup(html, {className:  'myPopupStyle'} );

                    // If this object has a tooltip or label defined...
                    // ...if this is a balloonmarker (i.e. the breadcrumbs within the path), then we need to specify an offset for the tooltip.  That's because we'll use a "circleMarker" object 
                    // instead of a bonfied marker with custom icon.
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
                   var cm = L.circleMarker(latlon, { radius: 3, fillColor: markercolor, fillOpacity: .9, stroke : false, fill: true });

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
		      (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + "MHz" : "" )) +
	  	      (typeof(item.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (item.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
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
    function createLandingPredictionsLayer(url, container, interval) {
        return L.geolayer(url, {
            interval: interval,
            container: container,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            style:  landingPredictionStyle,
            onEachFeature: function (feature, layer) {
                var html = "";
                var objecttype = feature.properties.objecttype;

                if (objecttype == "landingprediction") {
                    var id = feature.properties.id;
		    html = "<strong>" + feature.properties.callsign + "</strong>";
		    html = html + (typeof(feature.properties.comment) == "undefined" ? "" : (feature.properties.comment != "" ? "<br><font class=\"commentstyle\">" + feature.properties.comment + "</font>" : "")) + 
			      (typeof(feature.properties.altitude) == "undefined" ? "" : (feature.properties.altitude != 0 && feature.properties.altitude != "" ? "<br>Altitude: <font class=\"altitudestyle\">" + (feature.properties.altitude * 10 / 10).toLocaleString() + "ft</font>" : "")) + 
			      (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + "MHz" : "" )) +
			      (typeof(feature.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (feature.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
			      (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time : ""));
                    // Popup for the landing prediction point
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
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: "otherTooltipPane" } ).openTooltip();
                        }
                    }
                    
                }
           },
           pointToLayer:  function (feature, latlon) {
               var filename;
               var id = feature.properties.id;
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";

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

               return L.marker(latlon, { icon: myIcon, zIndexOffset: -1000 });
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
		      (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + "MHz" : "" )) +
	  	      (typeof(item.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (item.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
		      (typeof(item.properties.time) == "undefined" ? "" : (item.properties.time != "" ? "<br>Time: " + item.properties.time : ""));

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
    function createRealtimeLayer(url, container, interval, styleFunction) {
        return L.geolayer(url, {
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
			      (typeof(feature.properties.frequency) == "undefined" ? "" : (feature.properties.frequency != "" ? "<br>Heard on: " + feature.properties.frequency + "MHz" : "" )) +
			      (typeof(feature.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (feature.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (feature.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
			      (typeof(feature.properties.time) == "undefined" ? "" : (feature.properties.time != "" ? "<br>Time: " + feature.properties.time : ""));


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
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
               else 
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";

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
		      (typeof(item.properties.frequency) == "undefined" ? "" : (item.properties.frequency != "" ? "<br>Heard on: " + item.properties.frequency + "MHz" : "" )) +
	  	      (typeof(item.geometry.coordinates) == "undefined" ? "" : "<br>Coords: " + (item.geometry.coordinates[1] * 10 / 10).toFixed(3) + ", " + (item.geometry.coordinates[0] * 10 / 10).toFixed(3)) +
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

            // If we're following a specific station then pan the map to its location
            if (followfeatureid != "") {
                if (followfeatureid.localeCompare(item.properties.id) == 0) {
                    map.panTo({ lat: item.geometry.coordinates[1], lng: item.geometry.coordinates[0] });
                    //document.getElementById("error").innerHTML = JSON.stringify(item);
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
            var plottracks = document.getElementById("plottracks").checked;
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
            form_data.append("plottracks", (plottracks == true ? "on" : "off"));
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
		            if (jsonData.plottracks == "on")
			            document.getElementById("plottracks").checked = true;
		            else
			            document.getElementById("plottracks").checked = false;
                    document.getElementById("systemsettings_error").innerHTML = "Settings saved.";
                    setTimeout(function() {
                        document.getElementById("systemsettings_error").innerHTML = "";
                    }, 3000);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    //document.getElementById("errors").innerHTML = "error set tz: " + textStatus;
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
		    if (jsonData.plottracks == "on")
			    document.getElementById("plottracks").checked = true;
		    else
			    document.getElementById("plottracks").checked = false;
            });
    }




    /***********
    * changeAssignedFlight function
    *
    * This function will update the assigned flight for a team (ex. Alpha, Bravo, etc.)
    ***********/
    function changeAssignedFlight(tactical, element) {
        var assignedFlight = element.options[element.selectedIndex].value;

        //document.getElementById("error").innerHTML = "tactical:  " + tactical + "  flight: " + assignedFlight;

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

        //document.getElementById("error").innerHTML = "callsign:  " + call + "  tactical:  " + tactical;

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
    $.get("getflights.php", function(fdata) {
        var flightsJson = JSON.parse(fdata)
        var flightids = [];
        var f;

        for (f in flightsJson) {
            flightids.push(flightsJson[f].flight);
        }

        $.get("getteams.php", function(data) {
            var teamsJson = JSON.parse(data);
            var teams = [];
            var t;

            for (t in teamsJson) {
                teams.push(teamsJson[t].tactical);
            }


            $.get("gettrackers.php", function(data) {
                var trackerJson = JSON.parse(data);
                var keys = Object.keys(trackerJson);
                var i; 
                var j;
                var k;
                var teamhtml;

                //Create a HTML Table element.
                var table = document.createElement("TABLE");
                var tablediv = document.getElementById("trackers");
                table.setAttribute("class", "trackerlist");
                //table.setAttribute("style", "width: auto");
 
                //The columns
                var columns = ["Team and Flight Assignment", "Callsign", "Move to This Team"];
     
                //Add the header row.
                var row = table.insertRow(-1);
                for (i = 0; i < columns.length; i++) {
                    var headerCell = document.createElement("TH");
                    headerCell.innerHTML = columns[i];
                    headerCell.setAttribute("class", "trackerlistheader");
                    row.appendChild(headerCell);
                }


                //Add the data rows.
                for (i = 0; i < keys.length; i++) {
                    row = table.insertRow(-1);
                    var trackers = trackerJson[i].trackers;
                    var trackerkeys = Object.keys(trackers);
                    var teamcell = row.insertCell(0);
                    var flight;
                    var html = "<select id=\"" + trackerJson[i].tactical + "\" onchange='changeAssignedFlight(\"" + trackerJson[i].tactical + "\", this)'>";
                    var checked;
                    var foundmatch = 0;
   

                    teamcell.setAttribute("class", "trackerlist");
                    if (i % 2)
                        teamcell.setAttribute("style", "background-color: lightsteelblue; white-space: normal; word-wrap: word-break;"); 
 
 
                    for (flight in flightids) {
                        if (flightids[flight] == trackerJson[i].flightid) {
                            checked = "selected=\"selected\""; 
                            foundmatch = 1;
                        }
                        else
                            checked = "";
                        html = html + "<option value=" + flightids[flight] + " " + checked + " >" + flightids[flight] + "</option>";
                    }
                    if (trackerJson[i].flightid == "At Large" || foundmatch == 0)
                        checked = "selected=\"selected\""; 
                    else
                        checked = "";
                    html = html + "<option value=\"atlarge\" " + checked + " >At Large</option></select>";
         
                    teamcell.innerHTML = "<span style=\"font-size: 1.2em;\"><strong>" + trackerJson[i].tactical + "</strong></span><br>" + html;
                    teamcell.setAttribute("rowspan", trackerkeys.length);
                  
                    var t;
    
                    for (j = 0; j < trackerkeys.length; j++) {
                        if (j > 0) {
                            row = table.insertRow(-1);
                        }
                        teamhtml = "<select id=\"" + trackers[j].callsign + "_tacticalselect\" onchange='changeTrackerTeam(\"" + trackers[j].callsign + "\", this)'>";
                        for (t in teams) {
                           if (trackerJson[i].tactical == teams[t])
                               checked = "selected=\"selected\""; 
                            else
                                checked = "";
                            teamhtml = teamhtml + "<option value=\"" + teams[t] + "\" " + checked + " >" + teams[t] + "</option>";
                        }
                        teamhtml = teamhtml + "</select>";
    
                        var cellCallsign = row.insertCell(-1);
                        cellCallsign.setAttribute("class", "trackerlist");
                        if (i % 2)
                            cellCallsign.setAttribute("style", "background-color: lightsteelblue;"); 
                        cellCallsign.innerHTML = "<span style=\"font-size: 1.1em;font-weight: bold;\">" + trackers[j].callsign + "</span><br><span class=\"lorem\" style=\"color: #303030;\">" + trackers[j].notes;
    
                        var cellFlightid = row.insertCell(-1);
                        cellFlightid.setAttribute("class", "trackerlist");
                        if (i % 2)
                            cellFlightid.setAttribute("style", "background-color: lightsteelblue;"); 
                        cellFlightid.innerHTML = teamhtml;
    
                    }
                }
                tablediv.innerHTML = "";
                tablediv.appendChild(table);
            });
        });
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
               //document.getElementById("debug").innerHTML = "in OR section";
               if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 || 
                   packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) >= 0) {
                   html = html + escapeHtml(packets[key].packet.toString()) + "<br>"; 
                   i += 1;
               }
           }
           else if (operation == "not") {
               //document.getElementById("debug").innerHTML = "in OR section";
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
          var statusJson = JSON.parse(data);
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
    * initialize function
    *
    * This function performs all of the heavy lifting to init the map, get preferences, and start things up.
    ***********/
    function initialize() {
        var baselayer;
        var overlays;


	// create the tile layer referencing the local system as the url (i.e. "/maps/....")
	var osmUrl='/maps/{z}/{x}/{y}.png';
	var osmAttrib='Map data © <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';
        var tilelayer = L.tileLayer(osmUrl, {minZoom: 4, maxZoom: 20, attribution: osmAttrib});

        // Create a map object. 
	    map = new L.Map('map', {
            //renderer : canvasRenderer,
            preferCanvas:  true,
            zoomControloption: false,
            layers : [ tilelayer ]
        });

        tilelayer.addTo(map);		

        // Pane for all tracks, to put them at the bottom of the z-order
        pathsPane = map.createPane("pathsPane");
        pathsPane.style.zIndex = 300; 

        // Pane for all flights, to put them at the top of the z-order
        flightPane = map.createPane("flightPane");
        flightPane.style.zIndex = 670; 

        // Pane for all flight Tooltips
        flightTooltipPane = map.createPane("flightTooltipPane");
        flightTooltipPane.style.zIndex = 680; 

        // Pane for all non-flight tooltips, to put them underneath regular tooltips
        otherTooltipPane = map.createPane("otherTooltipPane");
        otherTooltipPane.style.zIndex = 640; 

        // Pane for all other stations, to put them underneath regular markers/objects
        otherStationsPane = map.createPane("otherStationsPane");
        otherStationsPane.style.zIndex = 590; 

 
        if (latitude != "" && longitude != "" && zoom != "")
	        map.setView(new L.LatLng(latitude, longitude), zoom);
        else
	        map.setView(new L.LatLng(lastposition.geometry.coordinates[1], lastposition.geometry.coordinates[0]), 12);
        

        // Layer groups for all stations and just my station.  This allows toggling the visibility of these two groups of objects.
        var allstations = L.markerClusterGroup();
        var mystation = L.layerGroup();

        // Layer group for trackers that are not assigned to a specific flight
        var trackersatlarge = L.layerGroup();

        var a = createRealtimeLayer("getallstations.php", allstations, 5 * 1000, function(){ return { color: 'black'}});
        if (showallstations == 1)
            a.addTo(map); 

        var b = createRealtimeLayer("getmystation.php", mystation, 5 * 1000, function(){ return { color: 'black'}});
        var c = createRealtimeLayer("gettrackerstations.php", trackersatlarge, 5 * 1000, function(){ return { color: 'black'}});
        b.addTo(map);
        c.addTo(map);
        realtimelayers.push(a);
        realtimelayers.push(b);
        realtimelayers.push(c);

        // The base layers and overlays that will be added to every map
        var groupedoverlays = { 
            "Generic Stations" : {
                "All Other Stations" : allstations, 
                "Trackers at Large" : trackersatlarge, 
                "My Location" : mystation
            }
        };
        baselayer = { "OSM Base Map" : tilelayer };
 
        // use the grouped layers plugin so the layer selection widget shows layers categorized
        var layerControl = L.control.groupedLayers(baselayer, groupedoverlays, { groupCheckboxes: true}).addTo(map); 

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
        var sidebar = L.control.sidebar('sidebar').addTo(map);
        var zoomcontrol = L.control.zoom({ position: 'topright' }).addTo(map);

        /*
        * This sets up all the flight layers.
        *   ...includes the active, predicted, and landing layers
        */
        var key;
        var key2;
            
        for (key in flightids) {
            //document.getElementById("error").innerHTML = JSON.stringify(flightids[key]);
            var predictedpathlayer = L.layerGroup();
            var landingpredictionlayer = L.layerGroup();
            var trackerstationslayer = L.layerGroup();
            
    

            for (key2 in flightids[key].callsigns) {
                var activeflightlayer = L.featureGroup();

                //activeflights.push({ "callsign" : flightids[key].callsigns[key2], "layergroup" : activeflightlayer });
                var r = createActiveFlightsLayer("getactiveflights.php?flightid=" + flightids[key].flightid + "&callsign=" + flightids[key].callsigns[key2], activeflightlayer, 5 * 1000, flightids[key].flightid + flightids[key].callsigns[key2]);
                r.addTo(map);
                realtimeflightlayers.push(r);
                layerControl.addOverlay(activeflightlayer, flightids[key].callsigns[key2], "Flight:  " + flightids[key].flightid);
            }
    
            
            var d = createRealtimeLayer("gettrackerstations.php?flightid=" + flightids[key].flightid, trackerstationslayer, 5 * 1000, function(){ return { color: 'black'}});
            var e = createFlightPredictionLayer("getpredictionpaths.php?flightid=" + flightids[key].flightid, predictedpathlayer, 5 * 1000);
            var f = createLandingPredictionsLayer("getlandingpredictions.php?flightid=" + flightids[key].flightid, landingpredictionlayer, 5 * 1000);
            d.addTo(map);
            f.addTo(map);
            realtimelayers.push(d);
            realtimelayers.push(e);
            realtimelayers.push(f);
            layerControl.addOverlay(trackerstationslayer, "Trackers", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(predictedpathlayer, "Flight Prediction", "Flight:  " + flightids[key].flightid);
            layerControl.addOverlay(landingpredictionlayer, "Landing Predictions", "Flight:  " + flightids[key].flightid);
         }


        // add a scale widget in the lower left hand corner for miles / kilometers.
        var scale = L.control.scale({position: 'bottomright', maxWidth: 200}).addTo(map);

	    // add a widget in the upper right hand corner for adding waypoints
	    var marker_control = new L.Control.SimpleMarkers({marker_draggable: true});
	    map.addControl(marker_control);
    }


    /************
     * startup
     *
     * This function performs some startup actions and calls "initialize", the primary function for starting the map stuff
    *************/
    function startup() {
        $.get("getposition.php", function(data) { 
            //document.getElementById("error").innerHTML = "followfeatureid:  " + followfeatureid;
            lastposition = JSON.parse(data);
            initialize();

	        getConfiguration();
            buildGauges();
            buildCharts();
            createTheListener();
            getProcessStatus();

            var flight;
            var allHtml = "<input type=\"radio\" id=\"allpackets\" name=\"flightLivePacketStream\" value=\"allpackets\" checked > All packets (< 3hrs) &nbsp; &nbsp;";
            var livePacketStreamHTML = "<form>" + allHtml;
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
                //$(va_a).click({element: va_e, link: va_l }, toggle);
                $(rel_a).click({element: rel_e, link: rel_l }, toggle);
                $(lpp_a).click({element: lpp_e, link: lpp_l }, toggle);

                // We use this to determine when the last packet came in for a given flight.
                $("#" + flightids[flight].flightid + "_sidebar").data("lastpacket", new Date("1970-01-01T00:00:00"));

                // Build the live packet stream HTML for flight selection
                livePacketStreamHTML = livePacketStreamHTML + "<input type=\"radio\" id=\"flightLivePacketStream-" + flightids[flight].flightid + "\" name=\"flightLivePacketStream\"  value=\"" + flightids[flight].flightid + "\" > " + flightids[flight].flightid + "&nbsp; &nbsp;";
                i += 1;
            }
            var liveA_a = "#livePacketFlightSelectionLink";
            var liveA_l = "#livePacketFlightSelectionSign";
            var liveA_e = "#livePacketFlightSelection";

            var liveB_a = "#livePacketSearchLink";
            var liveB_l = "#livePacketSearchSign";
            var liveB_e = "#livePacketSearch";
            $(liveA_a).click({element: liveA_e, link: liveA_l }, toggle);
            $(liveB_a).click({element: liveB_e, link: liveB_l }, toggle);
 
            // Build the Live Packet Stream tab
            livePacketStreamHTML = livePacketStreamHTML + "</form>"; 
            document.getElementById("flightsLivePacketStream").innerHTML = livePacketStreamHTML;
 
            var e = document.getElementById('searchfield');
            e.oninput = updateLivePacketStream;
            e.onpropertychange = e.oninput;

            var e = document.getElementById('searchfield2');
            e.oninput = updateLivePacketStream;
            e.onpropertychange = e.oninput;

            var e = document.getElementById('operation');
            e.oninput = updateLivePacketStream;
            e.onpropertychange = e.oninput;


            // set onclick for the Live Packet Stream flight selection radio buttons
            for (flight in flightids) {
                $("#flightLivePacketStream-" + flightids[flight].flightid).on('click change', function(e) {
                    currentflight = selectedflight();
                    getLivePackets();
                });
            }

            $("#allpackets").on('click change', function(e) {
                currentflight = selectedflight();
                getLivePackets();
            });

            // set onclick for the start/stop buttons on the Live Packet Stream tab
            $("#livepacketstart").on('click change', function(e) {
                livePacketStreamState = 1;
                document.getElementById("livePacketStreamState").innerHTML = "<mark style=\"background-color: lightgreen;\">on</mark>";
                getLivePackets();
            });

            $("#livepacketstop").on('click change', function(e) {
                livePacketStreamState = 0;
                document.getElementById("livePacketStreamState").innerHTML = "<mark style=\"background-color: red;\">off</mark>";
                clearLivePacketFilters();
            });


            // Setup the Live Packet Stream event and handler 
            updateLivePacketStreamEvent= new CustomEvent("updateLivePacketStreamEvent");
            document.addEventListener("updateLivePacketStreamEvent", displayLivePackets, false);

            currentflight = "allpackets";
            getLivePackets();

            // build the Trackers table
            getTrackers();

            // Update all things on the map.  Note:  updateAllItems will scheduled itself to run every 5 seconds.  No need for a setInterval call.
            // We delay a couple of seconds before updating the full map/gauges/tables if the number of flights/beacons we're tracking is > 8 in an attempt
            // to not swamp the user's browser with updates upon first load.
            if (realtimeflightlayers.length > 8)
                setTimeout(function() {updateAllItems("full")}, 2000);
            else
                updateAllItems("full");

            // When this map screen loses focus and then the user returns...when we regain focus, we want to update all items on the map.
            $(window).on('focus', function() { 
                updateAllItems("full", true);
            });

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
                //document.getElementById("error-JEFF-275").innerHTML = "toggling...minus:  " + divId + ", " + switchTag;
             }
             else  {
                signEle.text('+');
                //document.getElementById("error-JEFF-275").innerHTML = "toggling...plus:  " + divId + ", " + switchTag;
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
            
            achart = c3.generate({
                bindto: altElement,
                size: { width: 360, height: 250 },
                data: { empty : { label: { text: "No Data Available" } }, type: 'area', json: data, xs: cols, xFormat: '%H:%M:%S'  },
                axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { count: 6, format: '%H:%M:%S' }  }, y: { label: { text: 'Altitude (ft)', position: 'outer-middle' } } },
                //grid: { x: { show: true }, y: { show: true, lines: [{ value: lastposition.properties.altitude, class: 'groundlevel', text: 'Ground Level'}] } }
                grid: { x: { show: true }, y: { show: true } },
                line: { connectNull: true }
            });

            vchart = c3.generate({
                bindto: vertElement,
                size: { width: 360, height: 250 },
                data: { empty : { label: { text: "No Data Available" } }, type: 'area', json: data, xs: cols, xFormat: '%H:%M:%S'  },
                axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { count: 6, format: '%H:%M:%S' }  }, y: { label: { text: 'Vertical Rate (ft/min)', position: 'outer-middle' } } },
                //grid: { x: { show: true }, y: { show: true, lines: [{ value: lastposition.properties.altitude, class: 'groundlevel', text: 'Ground Level'}] } }
                grid: { x: { show: true }, y: { show: true } },
                line: { connectNull: true }
            });


            $(altElement).data('altitudeChart', achart);
            $(vertElement).data('verticalChart', vchart);
        }

        // Now query the backend database for chart data for all active flights, and load that data into the pre-built charts...
        $.get("getaltitudechartdata.php", function(data) {
            var thejsondata;
            var i = 0;
            var thekeys;

            if (data.length > 0) {
                thejsondata = JSON.parse(data);
                thekeys = Object.keys(thejsondata);


                //document.getElementById("error").innerHTML = JSON.stringify(thekeys);
                for (i = 0; i < thekeys.length; i++) {
                        var flight = thejsondata[i];
                    var jsondata = flight.chartdata;
                    var k = 0;
                    var chartkeys = Object.keys(jsondata);
                    var cols = {};
                    var thisflightid = flight.flightid;
                    var element = "#" + thisflightid + "_altitudechart";

                    for (k = 0; k < chartkeys.length; k++) {  
    
                        if (! chartkeys[k].startsWith("tm-")) {
                            cols[chartkeys[k]] = "tm-" + chartkeys[k];
                        }
                    }

                    //document.getElementById("error2").innerHTML = "thisflightid:  " + thisflightid + "<br>" + JSON.stringify(cols);
                    
                    // Load data into each Altitude chart
                    var achart = $(element).data('altitudeChart');
                    achart.load({ json: jsondata, xs: cols }); 
                 }
             }
        });


        // Now query the backend database for chart data for all active flights, and load that data into the pre-built charts...
        $.get("getvertratechartdata.php", function(data) {
            var thejsondata;
            var i = 0;
            var thekeys;

            if (data.length > 0) {
                thejsondata = JSON.parse(data);
                thekeys = Object.keys(thejsondata);


                //document.getElementById("error").innerHTML = JSON.stringify(thekeys);
                for (i = 0; i < thekeys.length; i++) {
                        var flight = thejsondata[i];
                    var jsondata = flight.chartdata;
                    var k = 0;
                    var chartkeys = Object.keys(jsondata);
                    var cols = {};
                    var thisflightid = flight.flightid;
                    var element = "#" + thisflightid + "_verticalchart";

                    for (k = 0; k < chartkeys.length; k++) {  
    
                        if (! chartkeys[k].startsWith("tm-")) {
                            cols[chartkeys[k]] = "tm-" + chartkeys[k];
                        }
                    }

                    //document.getElementById("error2").innerHTML = "thisflightid:  " + thisflightid + "<br>" + JSON.stringify(cols);
                    
                    // Load data into each Altitude chart
                    var vchart = $(element).data('verticalChart');
                    vchart.load({ json: jsondata, xs: cols }); 
                 }
             }
        });

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


            altimeter = $.flightIndicator(altitudeInstrument, 'altimeter', { showBox: true, size: 180 });
            variometer = $.flightIndicator(verticalRateInstrument, 'variometer', { showBox: true, size: 180 });
            heading = $.flightIndicator(balloonHeadingInstrument, 'heading', { showBox: true, size: 180 });
            airspeed = $.flightIndicator(speedInstrument, 'airspeed', { showBox: true, size: 180 });
            relativebearing = $.flightIndicator(relativeBearingInstrument, 'relativeHeading', { showBox: true, size: 180 });
            relativeangle = $.flightIndicator(relativeElevationInstrument, 'elevationAngle', { showBox: true, size: 180 });

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
                //map.setZoom(map.zoom);
            }
        });

    }



    /************
     * UpdateAllItems
     *
     * This function updates other parts of the instrumentation, charts, and tables.
     * This will update every chart/graph/table globally.
    *************/
    function updateAllItems(fullupdate, fromFocus) {

        // If the fromFocus parameter was not supplied then we set it to false, otherwise true.
        if (typeof(fromFocus) == "undefined")
            fromFocus = false;
        else
            fromFocus = true;

        // If this update was called from an "onFocus" event and there's already a timer set, then clear that...we'll reset again at the end of this function.
        if (fromFocus && updateTimeout) {
            clearTimeout(updateTimeout);
        }


        // Check if this is a full update (i.e. user reloaded the web page)...in that case, update everything.
        if (typeof(fullupdate) != "undefined") {
            fullupdate="full";
            globalUpdateCounter = 0;
        }
        else {
            fullupdate = "";
        }

        // Update the realtime layers that aren't flight layers (aka everything else...mylocation, trackers, landing predictions, other stations, etc.)
        var rl;
        for (rl in realtimelayers) {
            realtimelayers[rl].update();
        }

        // Get list of flights that have new packets and based on that list, only update those flights on the map/gauges/tables
        $.get("getupdates.php" + (fullupdate != "" ? "?fullupdate=full" : ""), function(data) {
            var jsonData = JSON.parse(data);

            // for each flight that was returned, update the map
            for (key in jsonData) {
                var theflight = jsonData[key].flightid;
                var thecallsign = jsonData[key].callsign;

                // Update the realtime layers for this flight
                var rfl;
                for (rfl in realtimeflightlayers) {
                    if (realtimeflightlayers[rfl].options.name == theflight + thecallsign)  
                        realtimeflightlayers[rfl].update();
                }

                // Update all the gauges as well as the last position, last status, and packet source tables
                $.get("getflightpackets.php?flightid=" + theflight, function(data) {
                    var flightJsonData = JSON.parse(data);
                    var k = 0;
                    var i = 0;
                    var positionPackets = flightJsonData.positionpackets;
                    var statusPackets = flightJsonData.statuspackets;
                    var lastPacketPath = flightJsonData.lastpacketpath;
                    var fid = flightJsonData.flightid;

                    // Loop to update the gauges and last position packet table
                    k = 0;
                    while (k < 5 && positionPackets[k]) {
                        var item = positionPackets[k]; 

                        // Update the flight gauges...
                        if (k == 0) {
                            // The telemetry
                            var thealtitude = Math.round((item.altitude * 10) / 10);
                            var theheading = Math.round((item.bearing * 10) / 10);
                            var thespeed = Math.round((item.speed * 10) / 10);
                            var thevertrate = Math.round((item.verticalrate * 10) / 10);

                            // The element names for displaying the telemetry
                            var altitudeValue = "#" + fid + "_altitudevalue";
                            var verticalRateValue = "#" + fid + "_verticalratevalue";
                            var balloonHeadingValue = "#" + fid + "_headingvalue";
                            var speedValue = "#" + fid + "_speedvalue";

                            // Update altitude and vertical rate, but only if valid values...
                            if (thealtitude > 0 && thevertrate < 50000 && thevertrate > -50000) {
                                $(altitudeValue).data("altimeter").setAltitude(thealtitude);
                                $(verticalRateValue).data("variometer").setVario(thevertrate/1000);
                                $(altitudeValue).text(thealtitude.toLocaleString());
                                $(verticalRateValue).text(thevertrate.toLocaleString());
                            }

                            // Update heading and speed
                            $(balloonHeadingValue).data("heading").setHeading(theheading);
                            $(speedValue).data("airspeed").setAirSpeed(thespeed);
                            $(balloonHeadingValue).text(theheading);
                            $(speedValue).text(thespeed);
                        }


                        // Update the last position packets table
                        $("#" + item.flightid + "_lasttime_" + k).text(item.time.split(" ")[1]);
                        $("#" + item.flightid + "_lastcallsign_" + k).html(
                            "<a href=\"#\" class=\"normal-link\" onclick=\"dispatchPanToEvent('" + item.latitude + "', '" + item.longitude + "');\">" +  item.callsign + "</a>"
                        );
                        $("#" + item.flightid + "_lastspeed_" + k).text(Math.round(item.speed * 10 / 10) + " mph");
                        $("#" + item.flightid + "_lastvertrate_" + k).text(Math.round(item.verticalrate * 10 / 10).toLocaleString() + " ft/min");
                        $("#" + item.flightid  + "_lastaltitude_" + k).text(Math.round(item.altitude * 10 / 10).toLocaleString() + " ft");
                        k += 1;
                    } 


                    // Update the status packet table
                    //
                    k = 0;
                    i = 0;
                    while (k < 5 && statusPackets[k]) {
                        var item = statusPackets[k];
              
                        $("#" + item.flightid + "_statustime_" + k).text(item.time.split(" ")[1]);
                        $("#" + item.flightid + "_statuscallsign_" + k).text(item.callsign);
                        $("#" + item.flightid + "_statuspacket_" + k).text(item.packet);
                        k += 1;
                    }


                    //
                    // Create the last packet source table and populate.
                    //
                    //
                    // Create a HTML Table element.
                    var table = document.createElement("TABLE");
                    var tablediv = document.getElementById(fid + "_lastpacketpath");
                    table.setAttribute("class", "packetlist");
                    table.setAttribute("style", "width: auto");

                    // The columns
                    var columns = ["Callsign", "Receive Time", "Last 10 Packets"];

                    // Add the header row.
                    var row = table.insertRow(-1);
                    for (i = 0; i < columns.length; i++) {
                        var headerCell = document.createElement("TH");
                        headerCell.innerHTML = columns[i];
                        headerCell.setAttribute("class", "packetlistheader");
                        headerCell.setAttribute("style", "white-space: nowrap;");
                        row.appendChild(headerCell);
                    }
                    
                    // Now add the data rows
                    var keys = Object.keys(lastPacketPath);
                    if (keys.length == 0) {
                        row = table.insertRow(-1);
                        var blankcell1 = row.insertCell(0);
                        var blankcell2 = row.insertCell(1);
                        var blankcell3 = row.insertCell(2);
                        blankcell1.setAttribute("class", "packetlist");
                        blankcell2.setAttribute("class", "packetlist");
                        blankcell3.setAttribute("class", "packetlist");
                        blankcell1.innerHTML = "n/a";
                    }
                    else {
                        for (i = 0; i < keys.length; i++) {
                            row = table.insertRow(-1);
                            var beacon = lastPacketPath[i].callsign;
                            var packetsource = lastPacketPath[i].lastpath;
                            var beaconcell = row.insertCell(0);
                            var timecell = row.insertCell(1);
                            var packetcell = row.insertCell(2);


                            beaconcell.setAttribute("class", "packetlist");
                            beaconcell.innerHTML = beacon;

                            timecell.setAttribute("class", "packetlist");
                            timecell.innerHTML = lastPacketPath[i].time.split(" ")[1];

                            packetcell.setAttribute("class", "packetlist");
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
                                packetcell.innerHTML = "<pre class=\"packetdata\" style=\"margin: 0px;\">" + html + "</pre>";
                            else
                                packetcell.innerHTML = "n/a";
                        }
                    }

                    //Add the legend row
                    row = table.insertRow(-1);
                    var legendcell = row.insertCell(0);
                    legendcell.setAttribute("class", "packetlist");
                    legendcell.setAttribute("colspan", "3");
                    legendcell.innerHTML = "<strong>Legend:</strong> &nbsp; newest----->oldest<br>" 
                        + "<span style=\"font-family: monospace; font-size: 1.4em;\"><mark style=\"background-color: lightgreen;\">R</mark></span>"
                        + " - packet received over RF<br>"
                        + "<span style=\"font-family: monospace; font-size: 1.4em;\"><mark style=\"background-color: yellow;\">I</mark></span>"
                        + " - packet received over the Internet";
                    tablediv.innerHTML = "";
                    tablediv.appendChild(table);
                    
                // getflightpackets.php
                });
            

                // Now query the backend database for chart data for all active flights, and load that data into the pre-built charts...
                $.get("getaltitudechartdata.php?flightid=" + theflight, function(data) {
                    var thejsondata;
                    var i = 0;
                    var thekeys;

                    if (data.length > 0) {
                        thejsondata = JSON.parse(data);
                        thekeys = Object.keys(thejsondata);


                        //document.getElementById("error").innerHTML = JSON.stringify(thekeys);
                        for (i = 0; i < thekeys.length; i++) {
                                var flight = thejsondata[i];
                            var jsondata = flight.chartdata;
                            var k = 0;
                            var chartkeys = Object.keys(jsondata);
                            var cols = {};
                            var thisflightid = flight.flightid;
                            var element = "#" + thisflightid + "_altitudechart";

                            for (k = 0; k < chartkeys.length; k++) {  

                                if (! chartkeys[k].startsWith("tm-")) {
                                    cols[chartkeys[k]] = "tm-" + chartkeys[k];
                                }
                            }

                            //document.getElementById("error2").innerHTML = "thisflightid:  " + thisflightid + "<br>" + JSON.stringify(cols);
                            
                            // Load data into each Altitude chart
                            var achart = $(element).data('altitudeChart');
                            achart.load({ json: jsondata, xs: cols }); 
                         }
                     }
                });


                // Now query the backend database for chart data for all active flights, and load that data into the pre-built charts...
                $.get("getvertratechartdata.php?flightid=" + theflight, function(data) {
                    var thejsondata;
                    var i = 0;
                    var thekeys;

                    if (data.length > 0) {
                        thejsondata = JSON.parse(data);
                        thekeys = Object.keys(thejsondata);


                        //document.getElementById("error").innerHTML = JSON.stringify(thekeys);
                        for (i = 0; i < thekeys.length; i++) {
                                var flight = thejsondata[i];
                            var jsondata = flight.chartdata;
                            var k = 0;
                            var chartkeys = Object.keys(jsondata);
                            var cols = {};
                            var thisflightid = flight.flightid;
                            var element = "#" + thisflightid + "_verticalchart";

                            for (k = 0; k < chartkeys.length; k++) {  
            
                                if (! chartkeys[k].startsWith("tm-")) {
                                    cols[chartkeys[k]] = "tm-" + chartkeys[k];
                                }
                            }

                            //document.getElementById("error2").innerHTML = "thisflightid:  " + thisflightid + "<br>" + JSON.stringify(cols);

                            // Load data into each Altitude chart
                            var vchart = $(element).data('verticalChart');
                            vchart.load({ json: jsondata, xs: cols }); 
                         }
                     }
                });


                // Get the latest Time-to-Live values for this flightid
                $.get("getttl.php?flightid=" + theflight, function(data) {
                    var thejsondata = JSON.parse(data);
                    var ttl = thejsondata.ttl + " mins";
                    var elem = "#" + thejsondata.flightid + "_ttl";
                    
                    $(elem).text(ttl);

                // getttl.php
                });



                // Calculate our relative position to each flight's latest position packet
                $.get("getrelativeposition.php?flightid=" + theflight, function(data) {
                    var thejsondata;
                    var i = 0;
                    var thekeys;

                    // json should look like this:  { "flightid" : "EOSS-123", "myheading" : "123", "range" : "123", "angle" : "123.123", "bearing" : "123.123" }

                    if (data.length > 0) {
                        thejsondata = JSON.parse(data);
                        thekeys = Object.keys(thejsondata);

                        for (i = 0; i < thekeys.length; i++) {
                            var flight = thejsondata[i];

                            // These are the values that are stuck in the table
                            var delement = "#" + flight.flightid + "_relativepositiondistance";
                            var celement = "#" + flight.flightid + "_relativeballooncoords";

                            // These are the dials
                            var eelement = "#" + flight.flightid + "_relativeelevationangle";
                            var evelement = "#" + flight.flightid + "_relativeelevationanglevalue";
                            var hvelement = "#" + flight.flightid + "_relativebearingvalue";
                            var mhvelement = "#" + flight.flightid + "_myheadingvalue";

                            var relativeBearing = flight.bearing - flight.myheading;
                            if (relativeBearing < 0)
                                relativeBearing = 360 + relativeBearing;

                            $(hvelement).data("relativebearing").setRelativeHeading(flight.myheading, flight.bearing);
                            $(evelement).data("relativeangle").setElevationAngle(flight.angle);
                            $(delement).html(flight.distance + " mi" + " @ " + flight.bearing + "&#176;");
                            $(celement).text(flight.latitude + ", " + flight.longitude);
                            $(evelement).text(flight.angle);
                            $(hvelement).text(relativeBearing);
                            $(mhvelement).text(flight.myheading);
                         }
                     }
                });

            // for loop for each flightid
            }

        // getupdates.php
        });

        // Update process status
        getProcessStatus();
        
        // Update the live packet stream tab
        getLivePackets();


        // If the global update counter is greater than this threshold, then schedule the next update to be a "full" update.
        // ...the idea being that ever so often, we should try to update everything on the map.
        if (globalUpdateCounter > 16) {
            // Set updateAllItems to run again in 5 seconds, but as a full.
            updateTimeout = setTimeout(function() {updateAllItems("full")}, 5000);
        }
        else {
            // Set updateAllItems to run again in 5 seconds.
            updateTimeout = setTimeout(updateAllItems, 5000);
        }
        globalUpdateCounter += 1;

    }

