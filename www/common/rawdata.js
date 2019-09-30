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

    // The variables for the charts.
    var chart;
    var chart2;
    var chart3;
    var chart4;
    var chart5;
    var chart6;
    var bubblechart;

    // These are global variables used to maintain state for the raw packet display
    var selectedFlight;
    var packetdata;
    var updatePacketsEvent;
    var flightlist;
    var currentflight;
    var packetcount;
    

    /***********
    * coord_distance
    *
    * This function return the distance in miles between two lat/lon points
    ***********/
    function coord_distance(lat1, lon1, lat2, lon2) {
        // This is pi (i.e. 3.14159) divided by 180.  Pre-calcualted and entered here as static 
        // variable so we don't have to calcuate that on every call.
        var p = 0.017453292519943295;    
        
        // The cosine function
        var c = Math.cos;

        // partial calculation...
        var a = 0.5 - c((lat2 - lat1) * p)/2 + 
                c(lat1 * p) * c(lat2 * p) * 
                (1 - c((lon2 - lon1) * p))/2;

        // Finish the calcs and return the distance in miles
        return Math.round((12742 * Math.asin(Math.sqrt(a)))*.6213712 * 100)/100; // 2 * R; R = 6371 km
    }


    /***********
    * createchart
    *
    * This is the APRS-IS packet counts chart.
    ***********/
    function createchart (jsondata, columns) {
        chart = c3.generate({
            bindto: '#chart1',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, 
                type: 'spline', json: jsondata, xs: columns, xFormat: '%Y-%m-%d %H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { count: 6, format: '%H:%M' }  }, 
                y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } },
            point: { show: false }
        });
    }

    /***********
    * createchart2
    *
    * This is the Flight Spped vs. Altitude chart.
    ***********/
    function createchart2 (jsondata, columns) {
        chart2 = c3.generate({
            bindto: '#chart2',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / No Active Flights" } }, 
                type: 'spline', json: jsondata, xs: columns, labels: { format: function (v, id, i, j) { return Math.round(v * 10) / 10; } }  },
            axis: { x: { label: { text: 'Altitude (ft)', position: 'outer-center' }, tick: { count: 6, format: d3.format(",d") } }, 
                y: { label: { text: 'Average Speed (MPH)', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
        });
    }
    
    /***********
    * createchart3
    *
    * This is the Direwolf RF Packets chart.
    ***********/
    function createchart3 (jsondata, columns) {
        chart3 = c3.generate({
            bindto: '#chart3',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, 
                type: 'spline', json: jsondata, xs: columns, xFormat: '%Y-%m-%d %H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { count: 6, format: '%H:%M' }  }, 
                y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            point: { show: false },
            grid: { x: { show: true }, y: { show: true } }
        });
    }

    /***********
    * createchart4
    *
    * This is the heading vs. altitude for flight beacons chart.
    ***********/
    function createchart4 (jsondata, columns) {
        chart4 = c3.generate({
            bindto: '#chart4',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / No Active Flights" } }, 
                type: 'scatter', json: jsondata, xs: columns },
            axis: { x: { label: { text: 'Altitude (ft)', position: 'outer-center' }, tick : { count: 6, format: d3.format(",d")  } }, 
                y: { label: { text: 'Heading Variability (deg)', position: 'outer-middle' } } },
                //y2: { show: true, label: { text: 'Vert. Acceleration (ft/min^2)', position: 'outer-middle' }, tick: { format: d3.format(",d") } } },
            grid: { x: { show: true }, y: { show: true } },
            point: { show: false }
        });
    }
    
    /***********
    * createchart5
    *
    * This is the vertical rate vs. altitude for flight beacons chart.
    ***********/
    function createchart5 (jsondata, columns) {
        chart5 = c3.generate({
            bindto: '#chart5',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / No Active Flights" } }, 
                type: 'scatter', json: jsondata, xs: columns },
            axis: { x: { label: { text: 'Altitude (ft)', position: 'outer-center' }, tick: { count: 6, format: d3.format(",d")  } }, 
                y: { label: { text: 'Vertical Rate (ft/min)', position: 'outer-middle' }, tick: { format: d3.format(",d") } } },
                //y2: { show: true, label: { text: 'Vert. Acceleration (ft/min^2)', position: 'outer-middle' }, tick: { format: d3.format(",d") } } },
            grid: { x: { show: true }, y: { show: true } },
            point: { show: false }
        });
    }

    /***********
    * createchart6
    *
    * This is the digipeated packet counts chart.
    ***********/
    function createchart6 (jsondata, columns) {
        chart6 = c3.generate({
            bindto: '#chart6',
            padding: { right: 20 },
            size: { width: 800, height: 220 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, 
                type: 'spline', json: jsondata, xs: columns, xFormat: '%Y-%m-%d %H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { count: 6, format: '%H:%M' }  }, 
                y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            point: { show: false },
            grid: { x: { show: true }, y: { show: true } }
        });
    }

    /***********
    * updatechart
    *
    * This updates the APRS-IS chart
    ***********/
    function updatechart (jsondata, columns) {
         chart.load ({ json:  jsondata, xs: columns });
    }
    
    /***********
    * updatechart2
    *
    * This updates the Flight Speed vs. Altitude chart
    ***********/
    function updatechart2 (jsondata, columns) {
         chart2.load ({ json:  jsondata, xs: columns });
    }

    /***********
    * updatechart3
    *
    * This updates the Direwolf RF Packets chart.
    ***********/
    function updatechart3 (jsondata, columns) {
         chart3.load ({ json:  jsondata, xs : columns});
    }

    /***********
    * updatechart4
    *
    * This updates the Heading Variability vs. Altitude chart
    ***********/
    function updatechart4 (jsondata, columns) {
         chart4.load ({ json:  jsondata, xs: columns});
    }

    /***********
    * updatechart5
    *
    * This updates the Vertical Rate vs. Altitude chart
    ***********/
    function updatechart5 (jsondata, columns) {
        chart5.load ({ json:  jsondata, xs: columns});
    }

    /***********
    * updatechart6
    *
    * This updates the RF Packets vs. Time chart
    ***********/
    function updatechart6 (jsondata, columns ) {
         chart6.load ({ json:  jsondata, xs: columns });
    }


    /***********
    * getchartdata
    *
    * This function serves as a front-end for the updatechart functions.  
    * It accepts a function and a URL.
    ***********/
    function getchartdata(chartupdatefunction, url) {
        /* Call the URL provided */
        $.get(url, function(data) {
            var jsonOutput = JSON.parse(data);
            var mycolumns = {};
            var i = 0;
            var thekeys = Object.keys(jsonOutput);

            for (i = 0; i < thekeys.length; i++) {
                if (! thekeys[i].startsWith("tm-")) {
                    mycolumns[thekeys[i]] = "tm-" + thekeys[i];
                }
            }

            /* call the provided update function with the JSON returned from the URL */
            chartupdatefunction(jsonOutput, mycolumns);
        });
    }

    

    /***********
    * escapeHtml
    *
    * This function will escape HTML special chars
    ***********/
    function escapeHtml(s) {
        /* The list of characters and their equivalent HTML replacements. */
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
          };

       // Search for and return the replacement HTML escape code string 
       return s.replace(/[&<>"']/g, function(m) { return map[m]; });
    }
    
    /***********
    * getIndicesOf
    *
    * This function search through a string looking for a substring.
    * args:
    *     searchStr - the substring to be searched for
    *     str - the string we're looking within
    *     caseSensitive - boolean, indicating if we're to perform the search with case sensitivity or not
    *
    * Returns:  it returns an array of locations where the searchStr was found within str.
    ***********/
    function getIndicesOf(searchStr, str, caseSensitive) {
        // The length of the search string
        var searchStrLen = searchStr.length;

        // If the search string is empty, then we have to return an empty array
        if (searchStrLen == 0) {
            return [];
        }

        var startIndex = 0;
        var index; 
        var indices = [];

        // If we don't care about case, then just convert everything to lower case
        if (!caseSensitive) {
            str = str.toLowerCase();
            searchStr = searchStr.toLowerCase();
        }

        // Now loop through str, searching for searchStr.
        while ((index = str.indexOf(searchStr, startIndex)) > -1) {
            // for each instance of searchStr that is found in str, add that starting location to the indices array.
            indices.push(index);
            
            // Move the startIndex location forward within str by the length of searchStr
            startIndex = index + searchStrLen;
        }

        // return our list of indices
        return indices;
    }


    /***********
    * displaypackets
    *
    * This function will filter through the list of APRS packets and display that pass the filter
    ***********/
    function displaypackets () {
        //document.getElementById("debug4").innerHTML = "packetdata: " + JSON.parse(packetdata).length;
        
        // This is the list of packets
        var packets = JSON.parse(packetdata);
        var html = "";
        var keys = Object.keys(packets);
        var key;
        var i = 0;

        // grab the search strings from the HTML fields...if the user has entered anything
        var searchstring = document.getElementById("searchfield").value;
        var searchstring2 = document.getElementById("searchfield2").value;

        // The value of the AND, OR, NOT combiner on the HTML page
        var operation = document.getElementById("operation").value;

 
        //document.getElementById("debug").innerHTML = operation;
        // Loop through the packets applying the search filters
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

        // Update the raw packet list area on the HTML page with the packets that made it through the search filters.
        document.getElementById("packetdata").innerHTML = html;
        document.getElementById("packetcount").innerHTML = i.toLocaleString();
    }


    /***********
    * selectedFlight
    *
    * This function grabs the selected flight (from the HTML form) and returns what the user has selected
    ***********/
    function selectedflight() {
        var radios = document.getElementsByName("flight");
        var selectedValue;

        for(var i = 0; i < radios.length; i++) {
            if(radios[i].checked) selectedValue = radios[i].value;   
        }
        return selectedValue;
    }

    /***********
    * initialize
    *
    * This function sets things up, grabs the list of active flights, gets initial data, etc..
    ***********/
    function initialize() {
        $.get("getflightsformap.php", function(data) {
            var jsondata = JSON.parse(data);
            var keys = Object.keys(jsondata);
            var key;
            var flight;
            var allHtml = "<input type=\"radio\" id=\"allpackets\" name=\"flight\" value=\"allpackets\" checked > All packets (< 3hrs) &nbsp; &nbsp;";
            var html = "<p style=\"font-weight: bold;\">Select flight: <form>" + allHtml;
            var i = 0;

            for (key in keys) {
                flight = jsondata[key].flightid;
                html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" > " + flight + "&nbsp; &nbsp;";
                i += 1;
                
            }
            html = html + "</form></p>";
           
            document.getElementById("flights").innerHTML = html;
 
            currentflight = "allpackets";
            $('input[type="radio"]').on('click change', function(e) {
                currentflight = selectedflight();
                getrecentdata();
            });

            getrecentdata();
        });
  

        // setup the toggle for hiding/displaying help text for the charts
        var c1_a = "#c1-link";
        var c1_l = "#c1-sign";
        var c1_e = "#c1-elem";
        $(c1_a).click({element: c1_e, link: c1_l }, toggle);

        var c2_a = "#c2-link";
        var c2_l = "#c2-sign";
        var c2_e = "#c2-elem";
        $(c2_a).click({element: c2_e, link: c2_l }, toggle);

        var c3_a = "#c3-link";
        var c3_l = "#c3-sign";
        var c3_e = "#c3-elem";
        $(c3_a).click({element: c3_e, link: c3_l }, toggle);

        var c4_a = "#c4-link";
        var c4_l = "#c4-sign";
        var c4_e = "#c4-elem";
        $(c4_a).click({element: c4_e, link: c4_l }, toggle);

        var c5_a = "#c5-link";
        var c5_l = "#c5-sign";
        var c5_e = "#c5-elem";
        $(c5_a).click({element: c5_e, link: c5_l }, toggle);

        var c6_a = "#c6-link";
        var c6_l = "#c6-sign";
        var c6_e = "#c6-elem";
        $(c6_a).click({element: c6_e, link: c6_l }, toggle);
    }


    /***********
    * getrecentdata
    *
    * This function queries the backend for all updates raw APRS packets, 
    * updates the global variable, packetdata, with that resultant JSON, 
    * and finally updates the HTML page with those packets
    ***********/
    function getrecentdata() {
      var url;
 
      // Has the user selected All Flights or a specific active flight...this changes which list of packets we query for
      if (currentflight == "allpackets")
          url = "getallpackets.php";
      else
          url = "getpackets.php?flightid=" + currentflight;
        
      // set the packetdata variable to nothing...so we can update it with new data from the backend
      packetdata = {};

      // Call the URL to get the latest list of raw APRS packets and assign that to the packetdata global variable. 
      $.get(url, function(data) { 

          // Update the global packetdata variable with the list of packets we get back
          packetdata = data;

          // Update the packet display so the user sees new packets
          updatepackets(); 
      });
    }


    /***********
    * updatepackets
    *
    * This dispatches an event declaring that we have new packet data available that needs to be displayed
    ***********/
    function updatepackets () {
        document.body.dispatchEvent(updatePacketsEvent);
    }

 
    /***********
    * clearfields
    *
    * This function simply clears the HTML searching fields for the raw APRS packet display area
    ***********/
    function clearfields() {
        // Set all of the fields to blank or their default values
        document.getElementById("searchfield").value = "";
        document.getElementById("searchfield2").value = "";
        document.getElementById("operation").selectedIndex = 0;
        document.getElementById("packetdata").innerHTML = "";
        document.getElementById("packetcount").innerHTML = "0";

        // Now update the packet list
        updatepackets();
    }


    /***********
    * downloadData
    *
    * This function is called when the user clicks the "download data" button 
    ***********/
    function downloadData () {
        // Get the starting, ending, and data type fields from the HTML form
	    var data_beginning = document.getElementById("data_beginning");
    	var data_ending = document.getElementById("data_ending");
    	var data_type_selection = document.getElementById("data_type_selection");

        // Check the validity of the beginning date.  If not good, then return.
        if (!data_beginning.checkValidity()) {
            throw data_beginning.validationMessage;
            return false;
        }

        // Check the validity of the ending date.  If not good, then return.
        if (!data_ending.checkValidity()) {
            throw data_ending.validationMessage;
            return false;
        }
	
        // construct the url we'll use to download the CSV data for the user
    	var url="downloaddata.php?datatype=" + data_type_selection.options[data_type_selection.selectedIndex].value + "&beginning=" + data_beginning.value + "&ending=" + data_ending.value;

        // Now clear out the HTML for values
        document.getElementById("data_beginning").value = "";
        document.getElementById("data_ending").value = "";
        initializeDataSelection();
        document.getElementById("data_type_selection").selectedIndex = 0;

        // open a new browser tab calling the URL, which will return the CSV data the user was wanting
        window.open(url, "_blank");

    	return false;
    }


    /***********
    * initializeDataSelection
    *
    * This function is used to populate the flight selection choices
    ***********/
    function initializeDataSelection() {
        // query the backend for a list of active flights
        $.get("getflights.php", function(data) {
            var flightsJson = JSON.parse(data);

	        // blank out the list of flightids for the prediction form
            $("#data_type_selection").html("");
            $("#data_type_selection").append($("<option></option>").val("gps").html("GPS Position Log"));

            // loop through the list of return flights creating a radio button for each one
            for (f in flightsJson) {
                $("#data_type_selection").append($("<option></option>").val("flight_" + flightsJson[f].flight).html("Flight:  " + flightsJson[f].flight));
            }
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


    /***********
    * startup
    *
    * This function is called to start everything in motion.  Should be called from the document.ready function.
    ***********/
    function rawdata_startup() {
        // create a new event for when new packet data is available
        updatePacketsEvent = new CustomEvent("updatepackets");

        // Add a listener for that event to the page
        document.body.addEventListener("updatepackets", displaypackets, false);
        
        // have the search fields and operation dropdown call the updatepackets function when their value/state changes
        var e = document.getElementById('searchfield');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('searchfield2');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('operation');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        // Call the initialize function to get the page setup
        initialize();

        // populate initial values
    	initializeDataSelection();

        // populate the charts with data
        getchartdata(createchart, "getpacketperformance.php");
        getchartdata(createchart2, "getspeedvsaltitude.php");
        getchartdata(createchart3, "getdirewolfperformance.php");
        getchartdata(createchart4, "getheadingvsaltitude.php");
        getchartdata(createchart5, "getverticalvsaltitude.php"); 
        getchartdata(createchart6, "getdigicounts.php"); 

        // Create a timer that is called every 5secs for updating all of our items on the page
        setInterval(function() { 
            getrecentdata(); 
            getchartdata(updatechart, "getpacketperformance.php"); 
            getchartdata(updatechart2, "getspeedvsaltitude.php"); 
            getchartdata(updatechart3, "getdirewolfperformance.php"); 
            getchartdata(updatechart4, "getheadingvsaltitude.php"); 
            getchartdata(updatechart5, "getverticalvsaltitude.php"); 
            getchartdata(updatechart6, "getdigicounts.php"); 
        }, 5000);
    }


