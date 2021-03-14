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

    // Global variables
    var lastStation = "";
    var lastStationTime = new Date(1970, 1, 1, 0, 0, 0, 0);
    var currentflight = "";
    var interval;

    // The audio device
    var audio;
    var playing;

    // Our audio queue
    var sndqueue;

    // Used to hold the session ID passed to getaudioalerts.php
    var callerid;


    /************
     * queue class
     *
     * implemented to queue objects
    *************/
    class Queue {
        constructor(...items) {
            //initialize the items in queue
            this._items = [];

            // enqueuing the items passed to the constructor
            this.enqueue(...items);
        }

        enqueue(...items) {
            //push items into the queue
            items.forEach( item => this._items.push(item) );

            return this._items;
        }

        dequeue(count=1) {
            //pull out the first item from the queue
            this._items.splice(0,count);

            return this._items;
        }

        peek() {
            //peek at the first item from the queue
            return this._items[0];
        }

        size() {
            //get the length of queue
            return this._items.length;
        }

        isEmpty() {
            //find whether the queue is empty or no
            return this._items.length===0;
        }

        empty() {
            this._items = [];
            return this._items;
        }
    }
    

    /************
     * makeid
     *
     * This function will construct a random character string to serve as the session ID for calls to the getaudioalerts.php page
    *************/
    function makeid(lengthOfString) {
        var result = "";
        var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
        var charactersLength = characters.length;

        for ( var i = 0; i < lengthOfString; i++ ) {
           result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }
        return result;
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
                signEle.text('expanded');
             }
             else  {
                signEle.text('normal');
             }
        });
    }

    /************
     * toggleMute
     *
     * This function will toggle the audio Mute clickydoo
    *************/
    function toggleMute(event) {
        var signEle = $(event.data.link);

        if (audio.muted == true) {
            audio.muted = false;        
            signEle.text('enabled');
        }
        else  {
            audio.muted = true;        
            signEle.text('disabled');
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
    * ready function
    *
    * This function will run with the page is fully loaded.
    ***********/
    $(document).ready(function () {

        // Create an audio element
        audio = new Audio();
        audio.muted = true;
        playing = false;

        // For toggling visibility of the expanded station list
        var list_a = "#listSelectionLink";
        var list_l = "#listSelectionLinkSign";
        var list_e = "#stationlist";
        $(list_a).click({element: list_e, link: list_l }, toggle);

        // For toggling mute on the audio element
        var audio_a = "#audioSelectionLink";
        var audio_l = "#audioSelectionLinkSign";
        $(audio_a).click({ link: audio_l }, toggleMute);

        // Create the queue for audio alerts
        sndqueue = new Queue(); 

        // Set the handlers for the audio object
        audio.onloadeddata = function() {
            playing = true;
            audio.play();
        };

        audio.onended = function() {
            sndqueue.dequeue();
            audio.src = "";
            playing = false;
            processSoundQueue();
        };


        // Create our session ID string for calls to getaudioalerts.php
        callerid = makeid(20);

        // Get initial data
        getFlights();
        
        // Stop processing on mobile devices when this browser tab loses focus.
        window.onfocus = gainFocus;
        window.onblur = lostFocus;

        // Set a timer so that we refresh data every 5 secs
        interval = setInterval(function() {
          getrecentdata(); 
          getAudioAlerts();
        }, 5000);
    });

    /***********
    * processSoundQueue
    *
    * This function will determine if audio is playing, and if not, then start the snowball rolling...
    ***********/
    function processSoundQueue() {
        var i;
        var queuesize = sndqueue.size();

        //console.log("queue: " + JSON.stringify(sndqueue._items));
        
        if (queuesize > 0 && playing == false) {
            audio.src = sndqueue.peek().sndfile;
            audio.load();
        }
    }

    
    /***********
    * getrecentdata
    *
    * This function will query the server for recent packets and update the webpage.
    ***********/
    function getrecentdata() {
        var url;

        if (currentflight == "allpackets")
            url = "getdashboardpackets.php";
        else
            url = "getdashboardpackets.php?flightid=" + currentflight;

        $.get(url, function(data) {
            var jsonData = data;
            var keys = Object.keys(jsonData);
            var i;
            var j;
            var k;

            // Get the currently selected flight
            var flightid = currentflight;


            
            //Create a HTML Table element for the list of callsigns.
            var table = document.createElement("TABLE");
            var tablespan = document.getElementById("stationlist");
            table.setAttribute("style", "border: 0px; color: white; font-size: 1.2em; margin: 10px;");

            var headerrow = table.insertRow(-1);
            var headerCell = document.createElement("TH");
            headerCell.innerHTML = "Recent Packets";
            headerCell.setAttribute("colspan", 3);
            headerCell.setAttribute("style", "text-align: center; font-variant: small-caps; border-bottom: 1px white solid;");
            headerrow.appendChild(headerCell);

            //Create a HTML Table element for the last callsign heard.
            var stationtable = document.createElement("TABLE");
            stationtablespan = document.getElementById("station");
            stationtable.setAttribute("style", "border: 0px; color: white; margin: 10px;");

            // Loop through each packet in the JSON
            for (i = 0; i < keys.length; i++) {
                var station = jsonData[i];
                var row = table.insertRow(-1);
                var cell = row.insertCell(-1);
                var cell2 = row.insertCell(-1);
                var cell3 = row.insertCell(-1);
                var filename = "";

                // Check if this incoming packets are "new".  If they are, then we want to have them fade red to white.
                // ...also if this is new data, then we want to grab audio reports
                var thisStationDate = new Date(station.thetime.replace(/ /g, "T"));
                if (thisStationDate > lastStationTime) {
                    // Update cell attributes for the red-to-white fade effect.
                    cell2.setAttribute("class", "redToWhite");
                    cell3.setAttribute("class", "redToWhite");
                }
                cell.setAttribute("style", "white-space: nowrap; vertical-align: middle;text-align: left; height:32px;");
                cell2.setAttribute("style", "white-space: nowrap; vertical-align: middle; text-align: left;padding-left: 20px;");
                cell3.setAttribute("style", "white-space: nowrap; vertical-align: middle; padding-left: 20px; text-align: right;");
               

            //document.getElementById("error").innerHTML = JSON.stringify(jsonData);

                // Determine what the APRS symbol is for this object, then determine path to the corresponding icon file.
                if (typeof(station.symbol) != "undefined") {
                    if (station.symbol != "" && station.symbol != "null" && station.symbol != null) {
                        if (station.symbol.startsWith('\\') || station.symbol.startsWith('\/') || station.symbol.startsWith('1x'))
                            filename = "/images/aprs/" + symbols[station.symbol].tocall + ".png";
                        else
                            filename = "/images/aprs/" + station.symbol.charAt(0) + "-" + symbols["\\" + station.symbol.charAt(1)].tocall + ".png";
                        cell.innerHTML = "<img style=\"width: 32px; height: 32px; vertical-align: middle;\" src=\"" + filename + "\">";
                    }
                    else {
                        cell.innerHTML = "n/a";
                        filename = "";
                    }
                }
                else {
                    cell.innerHTML = "n/a";
                    filename = "";
                }
                cell2.innerHTML = station.callsign;
                cell3.innerHTML = station.thetime.split(" ")[1].split(".")[0];

                // We only want to update the dashboard web page with the first three packets (aka the latest ones).
                if (i < 3) {
                    var srow = stationtable.insertRow(-1);
                    var stationSymbol = srow.insertCell(-1);
                    var stationCallsign = srow.insertCell(-1);
                    stationSymbol.setAttribute("style", "white-space: nowrap; vertical-align: middle;text-align: left;");
                    stationCallsign.setAttribute("style", "white-space: nowrap; vertical-align: middle;text-align: left; ");
                    //if (i == 0 && lastStation != station.callsign)
                    if (thisStationDate > lastStationTime) 
                        stationCallsign.setAttribute("class", "redToWhite");

                    if (filename != "")
                        stationSymbol.innerHTML = "<img style=\"vertical-align: middle;\" src=\"" + filename + "\">";
                    else
                        stationSymbol.innerHTML = "<font style=\"font-size: 2em;\">n/a";

                    stationCallsign.innerHTML = "<font style=\"font-size: 4em;\">" + station.callsign + "</font> &nbsp; <font style=\"font-size: 3em;\">"
                        + (typeof(station.altitude) == "undefined" ? 
                            "" : 
                            (station.altitude > 0 ? (station.altitude * 10 / 10).toLocaleString() + " ft" : ""))
                        + "</font>";

                    var srow2 = stationtable.insertRow(-1);
                    var stationDetails = srow2.insertCell(-1);
                    stationDetails.setAttribute("colspan", 2);

                    var detailstable = document.createElement("TABLE");
                    detailstable.setAttribute("style", "border: 0px; color: white; font-size: 1.2em; margin-bottom: 20px;");
                    var detailheaderrow = detailstable.insertRow(-1);
                    var detailheadercell = document.createElement("TH");
                    detailheadercell.innerHTML = "Station Details";
                    detailheadercell.setAttribute("style", "text-align: left; font-size: 1.2em; font-variant: small-caps; border-bottom: 1px white solid;");
                    detailheadercell.setAttribute("colspan", 2);
                    detailheaderrow.appendChild(detailheadercell);

                    var commentrow = detailstable.insertRow(-1); 
                    var commentcell1 = commentrow.insertCell(-1);
                    var commentcell2 = commentrow.insertCell(-1);
                    commentcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    commentcell2.setAttribute("style", "vertical-align: top; text-align: left; word-break: break-all; word-wrap: break-word;");
                    commentcell1.innerHTML = "<font style=\"font-weight: bold;\">Comment: </font>";
                    commentcell2.innerHTML = (typeof(station.comment) == "undefined" ? "n/a" : (station.comment == null ? "n/a" : station.comment) );

                    var speedrow = detailstable.insertRow(-1); 
                    var speedcell1 = speedrow.insertCell(-1);
                    var speedcell2 = speedrow.insertCell(-1);
                    speedcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    speedcell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    speedcell1.innerHTML = "<font style=\"font-weight: bold;\">Speed (MPH): </font>";
                    speedcell2.innerHTML = (typeof(station.speed_mph) == "undefined" ? "n/a" : (station.speed_mph == null ? "n/a" : station.speed_mph + " mph"));

                    var bearingrow = detailstable.insertRow(-1); 
                    var bearingcell1 = bearingrow.insertCell(-1);
                    var bearingcell2 = bearingrow.insertCell(-1);
                    bearingcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    bearingcell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    bearingcell1.innerHTML = "<font style=\"font-weight: bold;\">Heading: </font>";
                    bearingcell2.innerHTML = (typeof(station.bearing) == "undefined" ? "n/a" : (station.bearing == null ? "n/a" : station.bearing + "&#176"));

                    var altituderow = detailstable.insertRow(-1); 
                    var altitudecell1 = altituderow.insertCell(-1);
                    var altitudecell2 = altituderow.insertCell(-1);
                    altitudecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    altitudecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    altitudecell1.innerHTML = "<font style=\"font-weight: bold;\">Altitude (ft): </font>";
                    altitudecell2.innerHTML = (typeof(station.altitude) == "undefined" ? "n/a" : (station.altitude == null ? "n/a" : (station.altitude > 0 ? "<mark>" + (station.altitude * 10 / 10).toLocaleString() + " ft" + "</mark>" : station.altitude + " ft")));

                    var rangerow = detailstable.insertRow(-1); 
                    var rangecell1 = rangerow.insertCell(-1);
                    var rangecell2 = rangerow.insertCell(-1);
                    rangecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    rangecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    rangecell1.innerHTML = "<font style=\"font-weight: bold;\">Range/Bearing:</font>";
                    rangecell2.innerHTML = 
                        (typeof(station.distance_miles) == "undefined" ? "" : (station.distance_miles > 0 ? "<mark style=\"background-color: lightgreen;\">" + station.distance_miles + "mi</mark>" : ""))
                        + (typeof(station.relative_bearing) == "undefined" ? "" : (station.relative_bearing >= 0 ? "<mark style=\"background-color: lightgreen;\"> @ " + station.relative_bearing + "&#176;</mark> <font style=\"font-size: .8em;\">(relative to N)</font>" : ""))
                        + (typeof(station.angle) == "undefined" ? "" : (station.angle > -99 ? "<br><mark style=\"background-color: lightgreen;\">elev angle: " + station.angle + "&#176;</mark>" : ""));

                    var coordsrow = detailstable.insertRow(-1); 
                    var coordscell1 = coordsrow.insertCell(-1);
                    var coordscell2 = coordsrow.insertCell(-1);
                    coordscell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    coordscell2.setAttribute("style", "vertical-align: top; text-align: left; word-break: break-all; word-wrap: break-word;");
                    coordscell1.innerHTML = "<font style=\"font-weight: bold;\">Coords: </font>";
                    coordscell2.innerHTML = (typeof(station.latitude) == "undefined" ? "n/a" : (station.latitude == null ? "n/a" : station.latitude)) + ", " 
                        + (typeof(station.longitude) == "undefined" ? "n/a" : (station.longitude == null ? "n/a" : station.longitude));

                    var timerow = detailstable.insertRow(-1); 
                    var timecell1 = timerow.insertCell(-1);
                    var timecell2 = timerow.insertCell(-1);
                    timecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    timecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    timecell1.innerHTML = "<font style=\"font-weight: bold;\">Date/Time: </font>";
                    timecell2.innerHTML = (typeof(station.thetime) == "undefined" ? "n/a" : station.thetime.split(' ')[1].split('.')[0]);

                    var packetrow = detailstable.insertRow(-1); 
                    var packetcell1 = packetrow.insertCell(-1);
                    var packetcell2 = packetrow.insertCell(-1);
                    packetcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    packetcell2.setAttribute("style", "vertical-align: top; text-align: left; font-size: .8em; word-break: break-all; word-wrap: break-word;");
                    packetcell1.innerHTML = "<font style=\"font-weight: bold;\">Packet: </font>";
                    packetcell2.innerHTML = (typeof(station.raw) == "undefined" ? "n/a" : escapeHtml(station.raw));

                    stationDetails.innerHTML = "";
                    stationDetails.appendChild(detailstable);

                }


            }
            if (keys.length > 0) {
                if (typeof(jsonData[0].thetime) != "undefined" && typeof(jsonData[0].callsign) != "undefined") {
                    lastStation = jsonData[0].callsign;
                    lastStationTime = new Date(jsonData[0].thetime.replace(/ /g, "T"));
                }
            }

            // Update the station list
            stationtablespan.innerHTML = "";
            stationtablespan.appendChild(stationtable);

            // update the table with the latest packet
            tablespan.innerHTML = "";
            tablespan.appendChild(table);
            
        });
    }

    /***********
    * getAudioAlerts
    *
    * This function will query for any audio alerts if a flight is selected (i.e. the radio buttons) and add any alerts to the sndqueue.
    ***********/
    function getAudioAlerts() {
        // get audio alerts and add any alerts to the sound queue
        if (currentflight != "" || currentflight != "allpackets") {
            $.get("getaudioalerts.php?callerid=" + callerid + "&flightid=" + currentflight, function(d) {
                var jsonData = d;
                var a = 0;
                var t = Object.keys(jsonData);
                var f = currentflight;

                // Loop through the JSON records
                for (a = 0; a < t.length; a++) {
                    if (jsonData[a].flightid == f) {
                        // Our flight has an audio alert...add it to the queue
                        sndqueue.enqueue({sndfile: jsonData[a].audiofile, flightid: f}); 
                    }
                }
                processSoundQueue();
            });
        } 
    }


    /***********
    * getFlights
    *
    * This function will create the selection radio buttons
    ***********/
    function getFlights() {
        $.get("getflightsformap.php", function(data) {
            var jsondata = JSON.parse(data);
            var keys = Object.keys(jsondata);
            var key;
            var flight;
            var allHtml = "Filter: <input type=\"radio\" id=\"allpackets\" name=\"flight\" value=\"allpackets\" checked > All stations &nbsp;";
            var html = "<form>" + allHtml;
            var i = 0;

            for (key in keys) {
                flight = jsondata[key].flightid;
                html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" > " + flight + " &nbsp;";
                i += 1;

            }
            html = html + "</form></p>";

            document.getElementById("flights").innerHTML = html;

            currentflight = "allpackets";
            //$('input[type="radio"]').on('click change', function(e) {
            $('input[type="radio"]').on('change', function(e) {
                currentflight = selectedflight();
                getrecentdata();

                // if the selected radio button is an actual flight, then we display the audio control
                if (currentflight == "" || currentflight == "allpackets")
                    $("#audioalerts").hide();
                else
                    $("#audioalerts").show();
            });

            getrecentdata();
        });
    }

    /***********
    * selectedflight
    *
    * This function will return the value of the flight selection radio buttons
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
    * lostFocus
    *
    * This function is called when the browser tab loses focus
    ***********/
    function lostFocus() {
        var isiPad = (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 0) || navigator.platform === 'iPad';
        var isMobile = 'ontouchstart' in document.documentElement ||  navigator.maxTouchPoints > 1;

        // If this is a mobile device then stop periodic updates...at least until the browser tab is in focus again.
        if ((isiPad || isMobile) && interval) {
            clearInterval(interval);
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
        if (interval) {
            clearInterval(interval);
            interval = setInterval(function() {
              getrecentdata(); 
              getAudioAlerts();
            }, 5000);
        }
        return 0;
    }


