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

    var lastStation = "";
    var lastStationTime = new Date(1970, 1, 1, 0, 0, 0, 0);
    var currentflight = "";

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
        var list_a = "#listSelectionLink";
        var list_l = "#listSelectionLinkSign";
        var list_e = "#stationlist";
        $(list_a).click({element: list_e, link: list_l }, toggle);

        getFlights();
        getrecentdata();
        setInterval(function() {getrecentdata(); }, 5000);
    });

    
    function getrecentdata() {
        var url;

        if (currentflight == "allpackets")
            url = "getdashboardpackets.php";
        else
            url = "getdashboardpackets.php?flightid=" + currentflight;

        $.get(url, function(data) {
            var jsonData = JSON.parse(data);
            var keys = Object.keys(jsonData);
            var i;
            var j;
            var k;

            
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

            for (i = 0; i < keys.length; i++) {
                var station = jsonData[i];
                var row = table.insertRow(-1);
                var cell = row.insertCell(-1);
                var cell2 = row.insertCell(-1);
                var cell3 = row.insertCell(-1);
                var filename = "";
                var thisStationDate = new Date(station.thetime.replace(/ /g, "T"));
                if (thisStationDate > lastStationTime) {
                    cell2.setAttribute("class", "redToWhite");
                    cell3.setAttribute("class", "redToWhite");
                }
                cell.setAttribute("style", "white-space: nowrap; vertical-align: middle;text-align: left; height:32px;");
                cell2.setAttribute("style", "white-space: nowrap; vertical-align: middle; text-align: left;padding-left: 20px;");
                cell3.setAttribute("style", "white-space: nowrap; vertical-align: middle; padding-left: 20px; text-align: right;");
               

            //document.getElementById("error").innerHTML = JSON.stringify(jsonData);

                // Determine what the APRS symbol is for this object, then determine path to the corresponding icon file.
                if (typeof(station.symbol) != "undefined") {
                    if (station.symbol != "") {
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

                    stationCallsign.innerHTML = "<font style=\"font-size: 4em;\">" + station.callsign + "</font>";

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
                    commentcell2.innerHTML = (typeof(station.comment) == "undefined" ? "n/a" : station.comment);

                    var speedrow = detailstable.insertRow(-1); 
                    var speedcell1 = speedrow.insertCell(-1);
                    var speedcell2 = speedrow.insertCell(-1);
                    speedcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    speedcell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    speedcell1.innerHTML = "<font style=\"font-weight: bold;\">Speed (MPH): </font>";
                    speedcell2.innerHTML = (typeof(station.speed_mph) == "undefined" ? "n/a" : station.speed_mph + " mph");

                    var bearingrow = detailstable.insertRow(-1); 
                    var bearingcell1 = bearingrow.insertCell(-1);
                    var bearingcell2 = bearingrow.insertCell(-1);
                    bearingcell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    bearingcell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    bearingcell1.innerHTML = "<font style=\"font-weight: bold;\">Bearing: </font>";
                    bearingcell2.innerHTML = (typeof(station.bearing) == "undefined" ? "n/a" : station.bearing + "&#176");

                    var altituderow = detailstable.insertRow(-1); 
                    var altitudecell1 = altituderow.insertCell(-1);
                    var altitudecell2 = altituderow.insertCell(-1);
                    altitudecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    altitudecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    altitudecell1.innerHTML = "<font style=\"font-weight: bold;\">Altitude (ft): </font>";
                    altitudecell2.innerHTML = (typeof(station.altitude) == "undefined" ? "n/a" : (station.altitude > 0 ? "<mark>" + (station.altitude * 10 / 10).toLocaleString() + " ft" + "</mark>" : station.altitude + " ft"));

                    var rangerow = detailstable.insertRow(-1); 
                    var rangecell1 = rangerow.insertCell(-1);
                    var rangecell2 = rangerow.insertCell(-1);
                    rangecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    rangecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    rangecell1.innerHTML = "<font style=\"font-weight: bold;\">Relative Pos.:</font>";
                    rangecell2.innerHTML = (typeof(station.distance_miles) == "undefined" ? "" : (station.distance_miles > 0 ? "<mark style=\"background-color: lightgreen;\">range: " + station.distance_miles + " mi</mark>" : ""))
                        + (typeof(station.relative_bearing) == "undefined" ? "" : (station.relative_bearing > 0 ? "<br>heading: " + station.relative_bearing + "&#176;  (relative to N)" : ""))
                        + (typeof(station.angle) == "undefined" ? "" : (station.angle > -99 ? "<br>elevation angle: " + station.angle + "&#176;" : ""));

                    var coordsrow = detailstable.insertRow(-1); 
                    var coordscell1 = coordsrow.insertCell(-1);
                    var coordscell2 = coordsrow.insertCell(-1);
                    coordscell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    coordscell2.setAttribute("style", "vertical-align: top; text-align: left; word-break: break-all; word-wrap: break-word;");
                    coordscell1.innerHTML = "<font style=\"font-weight: bold;\">Coords: </font>";
                    coordscell2.innerHTML = (typeof(station.latitude) == "undefined" ? "n/a" : station.latitude) + ", " + (typeof(station.longitude) == "undefined" ? "n/a" : station.longitude);

                    var timerow = detailstable.insertRow(-1); 
                    var timecell1 = timerow.insertCell(-1);
                    var timecell2 = timerow.insertCell(-1);
                    timecell1.setAttribute("style", "vertical-align: top; text-align: left; white-space: nowrap;");
                    timecell2.setAttribute("style", "vertical-align: top; text-align: left;");
                    timecell1.innerHTML = "<font style=\"font-weight: bold;\">Date/Time: </font>";
                    timecell2.innerHTML = (typeof(station.thetime) == "undefined" ? "n/a" : station.thetime);

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
            stationtablespan.innerHTML = "";
            stationtablespan.appendChild(stationtable);

            tablespan.innerHTML = "";
            tablespan.appendChild(table);
        });
    }

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
            $('input[type="radio"]').on('click change', function(e) {
                currentflight = selectedflight();
                getrecentdata();
            });

            getrecentdata();
        });
    }

    function selectedflight() {
        var radios = document.getElementsByName("flight");
        var selectedValue;

        for(var i = 0; i < radios.length; i++) {
            if(radios[i].checked) selectedValue = radios[i].value;
        }
        return selectedValue;
    }





