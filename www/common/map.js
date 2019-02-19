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
* In its current state, this block of code is reliant upon several external variables:
*    map  // This is the variable that holds a Leaflet map object.
*    followfeatureid     // This holds the feature id of an object that we're wanting to "follow" on the map.
*
*/


    
    /*********
    * Search for an object within an array objects
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

                //document.getElementById("error").innerHTML = "colorIndex:  " + colorIndex + "<br>flightid:  " + fid + "<br>ascending_color: " + ascending_color + "<br>descending_color: " + descending_color + "<br>aCM: " + JSON.stringify(ascendingColorMap) + "<br>dCM: " + JSON.stringify(descendingColorMap);

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
    function createActiveFlightsLayer(url, container, interval) {
        return L.realtime(url, {
            interval: interval,
            container: container,
            color: 'black',
            weight: 2,
            opacity: 0.7,
            style:  activeFlightStyle,
            onEachFeature: function (feature, layer) {
                var html = "";
                var objecttype = feature.properties.objecttype;
                if (feature.properties.objecttype) 
                    objecttype = feature.properties.objecttype;
                else
                    objecttype = "";

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
			      "&zoom=" + mapzoom +  
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
                    var offset;
		    var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 

                    if (objecttype == "balloon") {
                        mappane = "flightTooltipPane";
                        tipclass = "flightTooltipLabelStyle";
                        theoffset = - (iconsize * 1.1 );
                    }
                    else if (objecttype == "balloonmarker") {
                        mappane = "flightTooltipPane";
                        tipclass = "flightBreadCrumbStyle";
                        theoffset = -iconsize/1.45;
                    }
                    else {
                        mappane = "otherTooltipPane";
                        tipclass = "myTooltipLabelStyle";
                        theoffset = -iconsize/1.3;
                    }

                    // if this object has a tooltip or label defined...
                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "")
                                layer.bindTooltip(feature.properties.label, { className:  tipclass,  permanent:true, direction: "center", offset: [0,theoffset], opacity: .9, pane: mappane }).openTooltip();
                        }    
                        else {
                            if (feature.properties.tooltip != "")
                                layer.bindTooltip(feature.properties.tooltip, { className:  "myTooltipStyle", permanent:true, direction: "auto", opacity: 0.9, pane: mappane }).openTooltip();
                        }
                    }
                    
                    // dispatch an event with this feature as content so that event listeners can update their content
                    // dispatch event code here...
                    if (objecttype == "balloon") {
                        var flightEvent = new CustomEvent("UpdateFlightGauges", { detail: feature });
                        document.dispatchEvent(flightEvent);
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
                       if (feature.properties.ascending == "true")
                           markercolor = ascending_colorsets[indexOfObject(ascendingColorMap, "flightid", feature.properties.flightid)].markerColor;
                       else
                           markercolor = descending_colorsets[indexOfObject(descendingColorMap, "flightid", feature.properties.flightid)].markerColor;
                   } 
    
                   if (feature.properties.label)
                       var markercolor = 'black';

		   return L.circleMarker(latlon, { radius: 3, fillColor: markercolor, fillOpacity: .9, stroke : false, fill: true });

               }

               // ...for everything else, we create the standard APRS icon for this object based on it's advertised "symbol"
               else {
                   var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 
                   var localiconsize = iconsize;
                   var mappane = "otherStationsPane";

                   if (feature.properties.objecttype == "balloon")
                       mappane = "flightPane";

                   if (feature.properties.symbol) 
                       if ((feature.properties.symbol.charAt(0) == '\/' && feature.properties.symbol.charAt(1) == 'O') || id.indexOf("_landing") >= 0) 
                           localiconsize = iconsize;
		   var myIcon = L.icon({
		       iconUrl: filename,
		       iconSize: [localiconsize, localiconsize],
		       iconAnchor: [localiconsize/2, localiconsize/2],
		       popupAnchor: [0, -localiconsize / 2],
		       tooltipAnchor: [localiconsize/2, 0]
		   }); 
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

            //document.getElementById("error").innerHTML = JSON.stringify(item);

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


            // dispatch an event with this feature as content so that event listeners can update their content
            // dispatch event code here...
            if (item.properties.objecttype == "balloon") {
                var flightEvent = new CustomEvent("UpdateFlightGauges", { detail: item });
                document.dispatchEvent(flightEvent);
            }

            // If we're following a specific station then pan the map to its location
            if (followfeatureid && followfeatureid != "") {
                if (followfeatureid.localeCompare(item.properties.id) == 0) {
                    map.panTo({ lat: item.geometry.coordinates[1], lng: item.geometry.coordinates[0] });
                    //document.getElementById("error").innerHTML = JSON.stringify(item);
                }
            }
            
            // dispatch an event with this feature as content so that event listeners can update their content
            // dispatch event code here...
            //if (item.properties.objecttype == "balloon") {
            //    var flightEvent = new CustomEvent("UpdateFlightGauges", { detail: item });
            //    document.dispatchEvent(flightEvent);
           // }

        }
        //document.getElementById("error").innerHTML = JSON.stringify(flightids);
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


                    var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 

                    // if this object has a tooltip or label defined...
                    if (feature.properties.tooltip) {
                        if (feature.properties.label) {
                            if (feature.properties.label != "")
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", offset: [0,-iconsize/1.3], opacity: .9, pane: "otherTooltipPane"}).openTooltip();
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
               var localiconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 
               var markercolor = 'navy';

               // Determine what the APRS symbol is for this object, then determine path to the corresponding icon file.
               if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x'))
                   filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";
               else
                   filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";


               // For balloon markers (i.e. the breadcrumbs within their path) create a Leaflet marker for each one...
               if (feature.properties.objecttype == "balloonmarker") {
		   return L.circleMarker(latlon, { radius: 3, fillColor: markercolor, fillOpacity: .9, stroke : false, fill: true });
               }
               
               // ...for everything else, we create the standard APRS icon for this object based on it's advertised "symbol"
               else {
                   var myIcon = L.icon({
                       iconUrl: filename,
                       iconSize: [localiconsize, localiconsize],
                       iconAnchor: [localiconsize/2, localiconsize/2],
                       popupAnchor: [0, -localiconsize / 2],
                       tooltipAnchor: [localiconsize/2, 0]
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
        return L.realtime(url, {
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
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", offset: [0,-iconsize/1.25], opacity: .9, pane: "otherTooltipPane" }).openTooltip();
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

               var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 
               var localiconsize = iconsize;

               if (feature.properties.symbol) 
                   if ((feature.properties.symbol.charAt(0) == '\/' && feature.properties.symbol.charAt(1) == 'O') || id.indexOf("_landing") >= 0) 
                       localiconsize = iconsize;
               var myIcon = L.icon({
                   iconUrl: filename,
                   iconSize: [localiconsize, localiconsize],
                   iconAnchor: [localiconsize/2, localiconsize/2],
                   popupAnchor: [0, -localiconsize / 2],
                   tooltipAnchor: [localiconsize/2, 0]
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
        return L.realtime(url, {
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
                                layer.bindTooltip(feature.properties.label, { className:  "myTooltipLabelStyle", permanent:true, direction: "center", offset: [0,-iconsize/1.2], opacity: .9, pane: "otherTooltipPane" }).openTooltip();
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

               var iconsize = (typeof(feature.properties.iconsize) == undefined ? 24 : feature.properties.iconsize * 10 / 10); 
               var localiconsize = iconsize;

                   if (feature.properties.symbol) 
                       if ((feature.properties.symbol.charAt(0) == '\/' && feature.properties.symbol.charAt(1) == 'O') || id.indexOf("_landing") >= 0) 
                           localiconsize = iconsize; 
		   var myIcon = L.icon({
		       iconUrl: filename,
		       iconSize: [localiconsize, localiconsize],
		       iconAnchor: [localiconsize/2, localiconsize/2],
		       popupAnchor: [0, -localiconsize / 2],
		       tooltipAnchor: [localiconsize/2, 0]
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
        //document.getElementById("error").innerHTML = JSON.stringify(flightids);
    }
