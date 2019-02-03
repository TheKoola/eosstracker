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

/* The routines here are centric to functionality for the data entry screens within the setup screens 
*
*
*/


    /***********
    * deleteLaunchSite function
    *
    * This function will delete the specified launch site.
    ***********/
    function deleteLaunchSite(launchsite) {
        var retVal = confirm("This will delete the " + launchsite + " launch site.   Are you sure?");
        if (retVal == true)
            $.get("deletelaunchsite.php?launchsite=" + launchsite, function(data) {
                var jsonData = JSON.parse(data);

                if (jsonData.result == 0)
                    document.getElementById("addlaunchsiteerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
                else
                    document.getElementById("addlaunchsiteerror").innerHTML = "";
                getLaunchSites();
                getPredictions();
                getFlights();
            });
    }

    /***********
    * addLaunchSite function
    *
    * This function will add a new launch site
    ***********/
    function addLaunchSite() {
        var launchsite = document.getElementById("launchsite_name").value;
        var lat = document.getElementById("launchsite_lat").value;
        var lon = document.getElementById("launchsite_lon").value;
        var alt = document.getElementById("launchsite_alt").value;

        //document.getElementById("addnewbeaconerror").innerHTML = flightid + ", " + freq + ", " + call + ", " + beacon_desc;
/*        if (!lat.checkValidity()) {
            throw lat.validationMessage;
            return false;
        }
*/
        $.get("addlaunchsite.php?launchsite=" + launchsite + "&lat=" + lat + "&lon=" + lon + "&alt=" + alt, function(data) {
            var jsonData = JSON.parse(data);

            if (jsonData.result == 0)
                document.getElementById("addlaunchsiteerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else
                document.getElementById("addlaunchsiteerror").innerHTML = "";
            getLaunchSites();
            getPredictions();
            getFlights();
            document.getElementById("launchsite_name").value = "";
	    document.getElementById("launchsite_lat").value = "";
            document.getElementById("launchsite_lon").value = "";
            document.getElementById("launchsite_alt").value = "";
  
        });
 
    }

    /***********
    * getLaunchSites function
    *
    * This function will get the list of launch sites
    ***********/
    function getLaunchSites() {
        $.get("getlaunchsites.php", function(data) {
            var siteJson = JSON.parse(data);
            var keys = Object.keys(siteJson);

            //document.getElementById("errors").innerHTML = JSON.stringify(keys);
            //document.getElementById("errors").innerHTML = "Jeff was here";

            //Create a HTML Table element.
            var tablediv = document.getElementById("launchsites");
            var table = document.createElement("TABLE");
            table.setAttribute("class", "packetlist");
            table.setAttribute("style", "width: 75%;");
            tablediv.innerHTML = "";


            // Create the header row
            var headerRow = table.insertRow(-1);
            var headerCell0 = headerRow.insertCell(-1);
            var headerCell1 = headerRow.insertCell(-1);
            var headerCell2 = headerRow.insertCell(-1);
            var headerCell3 = headerRow.insertCell(-1);
            headerCell0.setAttribute("class", "packetlistheader");
            headerCell1.setAttribute("class", "packetlistheader");
            headerCell2.setAttribute("class", "packetlistheader");
            headerCell3.setAttribute("class", "packetlistheader");
            headerCell2.setAttribute("style", "text-align: center;"); 
            headerCell3.setAttribute("style", "text-align: center;"); 
            headerCell0.innerHTML = "Action";
            headerCell1.innerHTML = "Launch Site";
            headerCell2.innerHTML = "Coordinates";
            headerCell3.innerHTML = "Elevation";
            headerRow.appendChild(headerCell0);
            headerRow.appendChild(headerCell1);
            headerRow.appendChild(headerCell2);
            headerRow.appendChild(headerCell3);


            //Add the data rows.
            for (i = 0; i < keys.length; i++) {
                var site = siteJson[i].launchsite;
                var lat = siteJson[i].lat;
                var lon = siteJson[i].lon;
                var alt = siteJson[i].alt;

                // Create the prediction row
                var siterow = table.insertRow(-1);
                var sitecell0 = siterow.insertCell(-1);
                var sitecell1 = siterow.insertCell(-1);
                var sitecell2 = siterow.insertCell(-1);
                var sitecell3 = siterow.insertCell(-1);

                sitecell0.setAttribute("class", "packetlist");
                sitecell1.setAttribute("class", "packetlist");
                sitecell2.setAttribute("class", "packetlist");
                sitecell3.setAttribute("class", "packetlist");
                sitecell2.setAttribute("style", "text-align: center;"); 
                sitecell3.setAttribute("style", "text-align: center;"); 

                sitecell0.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteLaunchSite(\"" + site + "\")\'> &nbsp; ";
                sitecell1.innerHTML = site;
                sitecell2.innerHTML = lat + ", " + lon;
                sitecell3.innerHTML = (alt * 10 / 10).toLocaleString() + " ft";
                siterow.appendChild(sitecell0);
                siterow.appendChild(sitecell1);
                siterow.appendChild(sitecell2);
                siterow.appendChild(sitecell3);

            }
            tablediv.appendChild(table);

        });
    }


    /***********
    * addBeacon function
    *
    * This function will add a beacon to an existing flight
    ***********/
    function addBeacon() {
        var flightidelem = document.getElementById("addnewbeacon_flightid");
        var flightid = flightidelem.options[flightidelem.selectedIndex].value;
        var freqelem = document.getElementById("addnewbeacon_frequency");
        var freq = freqelem.options[freqelem.selectedIndex].value;
        var beacon_call = document.getElementById("addnewbeacon_call");
        var call = document.getElementById("addnewbeacon_call").value;
        var beacon_desc = document.getElementById("addnewbeacon_description").value;
       
        //document.getElementById("addnewbeaconerror").innerHTML = flightid + ", " + freq + ", " + call + ", " + beacon_desc;
        if (!beacon_call.checkValidity()) {
            throw beacon_call.validationMessage;
            return false;
        }

        $.get("addbeacon.php?flightid=" + flightid + "&callsign=" + call + "&description=" + beacon_desc + "&frequency=" + freq, function(data) {
            var jsonData = JSON.parse(data);
  
            if (jsonData.result == 0)
                document.getElementById("addnewbeaconerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else
                document.getElementById("addnewbeaconerror").innerHTML = "";
            document.getElementById("newflighterror").innerHTML = "";
            getFlights();
            document.getElementById("addnewbeacon_flightid").selectedIndex = 0;
            document.getElementById("addnewbeacon_frequency").selectedIndex = 0;
            document.getElementById("addnewbeacon_call").value = "";
            document.getElementById("addnewbeacon_description").value = "";
        });
        return false;
    }


    /***********
    * addFlight function
    *
    * This function will add the specified flight.
    ***********/
    function addFlight() {
        var flightid = document.getElementById("newflightid").value;
        var notes = document.getElementById("newflightnotes").value;
        var monitoring = document.getElementById("newflightmonitoring").value;
        var newflightid = document.getElementById("newflightid");
        var beacon1 = document.getElementById("beacon1_call");
        var beacon1_desc = document.getElementById("beacon1_description");
        var origin = document.getElementById('newflightlaunchsite');
        var launchsite = origin.options[origin.selectedIndex].value;

        var i = 1;
        var url = "";
       
        if (!newflightid.checkValidity()) {
            throw newflightid.validationMessage;
            return false;
        }

        if (!beacon1.checkValidity()) {
            throw beacon1.validationMessage;
            return false;
        }

        if (!beacon1_desc.checkValidity()) {
            throw beacon1_desc.validationMessage;
            return false;
        }

 
        // construct url...
        for (i = 1; i < 6; i++) {
            var call = document.getElementById("beacon" + i + "_call");
            var freqelem = document.getElementById("beacon" + i + "_frequency");
            var freq = freqelem.options[freqelem.selectedIndex].value;
            var desc = document.getElementById("beacon" + i + "_description");
 
            if (call.value)
                if (!call.checkValidity()) {
                    throw call.validationMessage;
                    return false;
                }
            if (desc.value)
                if (!desc.checkValidity()) {
                    throw desc.validationMessage;
                    return false;
                }

            url = url + "&beacon" + i + "_callsign=" + call.value;
            url = url + "&beacon" + i + "_frequency=" + freq;
            url = url + "&beacon" + i + "_description=" + desc.value;
        }

        $.get("addflight.php?flightid=" + flightid + "&description=" + notes + "&monitoring=" + monitoring + "&launchsite=" + launchsite + url, function(data) {
            var jsonData = JSON.parse(data);
  
            if (jsonData.result == 0)
                document.getElementById("newflighterror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else 
                document.getElementById("newflighterror").innerHTML = "";
            document.getElementById("addnewbeaconerror").innerHTML = "";
            getFlights();
            getPredictions();
            getLaunchSites();
            getTrackers();
            document.getElementById("newflightid").value = "";
            document.getElementById("newflightnotes").value = "";
            document.getElementById("newflightmonitoring").value = "";
            document.getElementById("newflightlaunchsite").selectedIndex = 0;
            for (i = 1; i < 6; i++) {
                document.getElementById("beacon" + i + "_call").value = "";
                document.getElementById("beacon" + i + "_description").value = "";
                document.getElementById("beacon" + i + "_frequency").selectedIndex = 0;
            }
        });
        return false;
    }


    /***********
    * deleteFlight function
    *
    * This function will delete the specified flight.
    ***********/
    function deleteFlight(flightid) {
        var retVal = confirm("This will delete all beacons and prediction data associated with " + flightid + ".   Are you sure you want to delete " + flightid + "?");
        if (retVal == true)
            $.get("deleteflight.php?flightid=" + flightid, function(data) {
                getFlights();
		getPredictions();
		getTrackers();
                document.getElementById("newflighterror").innerHTML = "";
                document.getElementById("addnewbeaconerror").innerHTML = "";
            });
    }

    /***********
    * deleteBeacon function
    *
    * This function will delete the specified beacon from this flight
    ***********/
    function deleteBeacon(flightid, callsign) {
        var retVal = confirm("This will delete " + callsign + " from " + flightid + ".   Are you sure you want to delete " + callsign + "?");
        if (retVal == true)
            $.get("deletebeacon.php?flightid=" + flightid + "&callsign=" + callsign, function(data) {
                getFlights();
                document.getElementById("newflighterror").innerHTML = "";
                document.getElementById("addnewbeaconerror").innerHTML = "";
            });
    }
    
    /***********
    * updateBeacon function
    *
    * This function will update the callsign, frequency, or notes for an existing beacon
    ***********/
/*    function updateBeacon(call, element) {
        var flightid = element.options[element.selectedIndex].value;
        var callsign = element.options[element.selectedIndex].value;
        var frequency = element.options[element.selectedIndex].value;
        var notes = element.options[element.selectedIndex].value;

        //document.getElementById("error").innerHTML = "callsign:  " + call + "  tactical:  " + tactical;

        $.get("updatebeacon.php?flightid=" + flightid + &callsign=" + callsign + "&frequency=" + frequency + "&notes=" + notes, function(data) {
            getFlights();
        });
    }
*/


    /***********
    * trackFlight function
    *
    * This function will update active tracking status for a given flight
    ***********/
    function trackFlight(flight, element) {
        var activeStatus = element.checked;
        //document.getElementById("error").innerHTML = "callsign:  " + call + "  tactical:  " + tactical;

        $.get("trackflight.php?flightid=" + flight + "&active=" + activeStatus, function(data) {
            document.getElementById("newflighterror").innerHTML = "";
            getFlights();
        });
    }


    /***********
    * changeAssignedLaunchSite function
    *
    * This function will update the assigned launch site for a given flight
    ***********/
    function changeAssignedLaunchSite(flightid, element) {
        var assignedSite = element.options[element.selectedIndex].value;


        //document.getElementById("debug").innerHTML = "changing:  " + assignedSite;
        $.get("changelaunchsite.php?flightid=" + flightid + "&launchsite=" + assignedSite, function(data) {
            var resultJson = JSON.parse(data);

            if (resultJson.result == 0)
                document.getElementById("newflighterror").innerHTML = resultJson.error; 
            else
                document.getElementById("newflighterror").innerHTML = "";
            getFlights();
        });
    }



/**********
** This is an example of the JSON for a flight
**
    {
        "active": "f",
        "beacons": [
            {
                "callsign": "K0SCC-9",
                "frequency": "144.340",
                "location": "Bottom of flight string"
            },
            {
                "callsign": "KC0D-1",
                "frequency": "144.905",
                "location": "Top of flight string"
            }
        ],
        "description": "CU Gateway to Space and COSGC colleges",
        "flight": "EOSS-269"
    }
*/

    /***********
    * getFlights function
    *
    * This function queries the backend for a list of flights and their current beacons 
    * ...then will create the table for displaying the flights/beacons 
    ***********/
    function getFlights() {
        $.get("getlaunchsites.php", function(data) {
            var siteJson = JSON.parse(data);
            var sites = [];
            var s;
 
            $("#newflightlaunchsite").html("");
            for (s in siteJson) {
                sites.push(siteJson[s].launchsite);
                $("#newflightlaunchsite").append($("<option></option>").val(siteJson[s].launchsite).html(siteJson[s].launchsite));
            }

            $.get("getflights.php", function(data) {
                var flightsJson = JSON.parse(data);
                var keys = Object.keys(flightsJson);

                //document.getElementById("errors").innerHTML = JSON.stringify(keys);
                //document.getElementById("errors").innerHTML = "Jeff was here";

                //Create a HTML Table element.
                var tablediv = document.getElementById("flights");
                var table = document.createElement("TABLE");
                table.setAttribute("class", "packetlist");
                table.setAttribute("style", "width: 75%;");
                tablediv.innerHTML = "";
    
                // Blank out the flightids for the "add a new beacon" form
                $("#addnewbeacon_flightid").html("");
     
     
                //Add the data rows.
                for (i = 0; i < keys.length; i++) {
    
                    var flight = flightsJson[i].flight;
                    var beaconkeys = Object.keys(flightsJson[i].beacons);
                    var row = table.insertRow(-1);
    
                    // Update the "add a new beacon" form...
                    $("#addnewbeacon_flightid").append($("<option></option>").val(flight).html(flight));
                    
                    // Create the header row
                    var headerCell = row.insertCell(0);
                    headerCell.innerHTML = flight + " &nbsp; " + (flightsJson[i].active == "t" ? "<span style=\"font-size: .8em;\">(tracking)</span>" : "");
                    headerCell.setAttribute("class", "packetlistheader");
                    if (flightsJson[i].active == "t")
                        headerCell.setAttribute("style", "background-color: #ffbf00; color: black;");
                    headerCell.setAttribute("colspan", "5");
                    row.appendChild(headerCell);

                    // Create the flight row
                    row = table.insertRow(-1);
                    var flightcell0 = row.insertCell(0);
                    var flightcell1 = row.insertCell(1);
                    var flightcell2 = row.insertCell(2);
                    var flightcell3 = row.insertCell(3);
                    var flightcell4 = row.insertCell(4);

                    flightcell0.setAttribute("class", "packetlist");
                    flightcell1.setAttribute("class", "packetlist");
                    flightcell2.setAttribute("class", "packetlist");
                    flightcell3.setAttribute("class", "packetlist");
                    flightcell4.setAttribute("class", "packetlist");
                    flightcell0.setAttribute("style", "background-color: lightsteelblue;"); 
                    flightcell1.setAttribute("style", "background-color: lightsteelblue;"); 
                    flightcell2.setAttribute("style", "background-color: lightsteelblue;"); 
                    flightcell3.setAttribute("style", "background-color: lightsteelblue; text-align: center;"); 
                    flightcell4.setAttribute("style", "background-color: lightsteelblue; text-align: center;"); 
    
                    flightcell0.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteFlight(\"" + flight + "\")\'> &nbsp; ";
                    flightcell1.innerHTML = flight;
                    flightcell2.innerHTML = flightsJson[i].description;

                    var html = "<select id=\"" + flightsJson[i].flight + "_launchsite\" onchange='changeAssignedLaunchSite(\"" + flightsJson[i].flight + "\", this)'>";
                    var s;
                    var checked;
                    //document.getElementById("debug").innerHTML = JSON.stringify(sites);
                    for (s in sites) {
                        if (flightsJson[i].launchsite == sites[s])
                            checked = "selected=\"selected\""; 
                        else
                            checked = "";
                        html = html + "<option value=\"" + sites[s] + "\" " + checked + " >" + sites[s] + "</option>";
                    }
                    html = html + "</select>";

                    flightcell3.innerHTML = "Launch Site: " + html;
                    flightcell4.innerHTML = "Tracking: &nbsp; <input type=\"checkbox\" name=\"flight_status\" " + (flightsJson[i].active == "t" ? "checked" : "")
                        + " onclick='trackFlight(\"" + flightsJson[i].flight + "\", this)'>";
                    row.appendChild(flightcell0);
                    row.appendChild(flightcell1);
                    row.appendChild(flightcell2);
                    row.appendChild(flightcell3);
                    row.appendChild(flightcell4);

                    // Add rows for each beacon
                    for (b in flightsJson[i].beacons) {
                        row = table.insertRow(-1);
                        var action = row.insertCell(0); 
                        var call = row.insertCell(1); 
                        var freq = row.insertCell(2); 
                        var desc = row.insertCell(3); 
    
                        action.setAttribute("class", "packetlist");
                        call.setAttribute("class", "packetlist");
                        freq.setAttribute("class", "packetlist");
                        desc.setAttribute("class", "packetlist");
                        desc.setAttribute("colspan", "2");
    
                        action.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteBeacon(\"" + flight + "\", \"" + flightsJson[i].beacons[b].callsign + "\")\'> &nbsp; ";
                        call.innerHTML = flightsJson[i].beacons[b].callsign;
                        freq.innerHTML = flightsJson[i].beacons[b].frequency;
                        desc.innerHTML = flightsJson[i].beacons[b].location;
                        
                        row.appendChild(action);
                        row.appendChild(call);
                        row.appendChild(freq);
                        row.appendChild(desc);
                    }
                }
                tablediv.appendChild(table);
            });
        });
    }

    /***********
    * addPrediction function
    *
    * This function will add the specified prediction data from the RAW file URL.
    ***********/
    function addPrediction() {
        var flightidelem = document.getElementById("newprediction_flightids")
        var flightid = flightidelem.options[flightidelem.selectedIndex].value;
        var launchsite = document.getElementById("newprediction_launchsite").value;
        var thedate = document.getElementById("newprediction_thedate").value;
        var url = document.getElementById("newprediction_url").value;
        var origin = document.getElementById("newprediction_launchsite");
        var launchsite = origin.options[origin.selectedIndex].value;

        var i = 1;
 
        //document.getElementById("addpredictionerror").innerHTML = flightid + ", " + thedate + ", " + launchsite + ", " + url;
       
        $.get("addpredictiondata.php?flightid=" + flightid + "&thedate=" + thedate + "&launchsite=" + launchsite + "&url=" + url, function(data) {
            var jsonData = JSON.parse(data);
  
            if (jsonData.result)
                if (jsonData.result == 1)
                    document.getElementById("addpredictionerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
                else
                    document.getElementById("addpredictionerror").innerHTML = "";
            getPredictions();
            document.getElementById("newprediction_flightids").selectedIndex = 0;
            document.getElementById("newprediction_launchsite").selectedIndex = 0;
            document.getElementById("newprediction_thedate").value = "";
            document.getElementById("newprediction_launchsite").value = "";
            document.getElementById("newprediction_url").value = "";
        });
        return false;
    }


    /***********
    * deletePrediction function
    *
    * This function will delete the specified flight.
    ***********/
    function deletePrediction(flightid, thedate, launchsite) {
        var retVal = confirm("This will delete prediction data for " + flightid + " from " + thedate + " at the " + launchsite + " launch site.   Are you sure you want to delete this data?");
        if (retVal == true)
            $.get("rmpredictiondata.php?flightid=" + flightid + "&thedate=" + thedate + "&launchsite=" + launchsite, function(data) {
                getPredictions();
            });
    }

/*
    **** Example of the JSON from getpredictions.php
[
    {
        "flightid": "TEST-001",
        "launchsite": "Eaton",
        "thedate": "2019-01-10"
    },
    ...
    ...
]

*/

    /***********
    * getPredictions function
    *
    * This function queries the backend for a list of prediction downloads 
    * ...then will create the table for displaying the predictions
    ***********/
    function getPredictions() {
        $.get("getlaunchsites.php", function(data) {
            var siteJson = JSON.parse(data);
            var sites = [];
            var s;
 
            $("#newprediction_launchsite").html("");
            for (s in siteJson) {
                sites.push(siteJson[s].launchsite);
                $("#newprediction_launchsite").append($("<option></option>").val(siteJson[s].launchsite).html(siteJson[s].launchsite));
            }

            $.get("getflights.php", function(data) {
                var flightsJson = JSON.parse(data);
                var flights = [];
                var f;

                
                // blank out the list of flightids for the prediction form
                $("#newprediction_flightids").html("");
      
                for (f in flightsJson) {
                    flights.push(flightsJson[f].flight);
                    $("#newprediction_flightids").append($("<option></option>").val(flightsJson[f].flight).html(flightsJson[f].flight));
                }
            

            $.get("getpredictions.php", function(data) {
                var predictionJson = JSON.parse(data);
                var keys = Object.keys(predictionJson);

                //document.getElementById("errors").innerHTML = JSON.stringify(keys);
                //document.getElementById("errors").innerHTML = "Jeff was here";
        
                //Create a HTML Table element.
                var tablediv = document.getElementById("predictiondata");
                var table = document.createElement("TABLE");
                table.setAttribute("class", "packetlist");
                table.setAttribute("style", "width: 75%");
                tablediv.innerHTML = "";

                // Create the header row
                var headerRow = table.insertRow(-1);
                var headerCell0 = headerRow.insertCell(-1);
                var headerCell1 = headerRow.insertCell(-1);
                var headerCell2 = headerRow.insertCell(-1);
                var headerCell3 = headerRow.insertCell(-1);
                headerCell0.setAttribute("class", "packetlistheader");
                headerCell1.setAttribute("class", "packetlistheader");
                headerCell2.setAttribute("class", "packetlistheader");
                headerCell3.setAttribute("class", "packetlistheader");
                headerCell0.innerHTML = "Action";
                headerCell1.innerHTML = "Flight ID";
                headerCell2.innerHTML = "The Date";
                headerCell3.innerHTML = "Launch Site";
                headerRow.appendChild(headerCell0);
                headerRow.appendChild(headerCell1);
                headerRow.appendChild(headerCell2);
                headerRow.appendChild(headerCell3);

    
                //Add the data rows.
                for (i = 0; i < keys.length; i++) {
                    var flight = predictionJson[i].flightid;
                    var thedate = predictionJson[i].thedate;
                    var launchsite = predictionJson[i].launchsite;
    
                    // Create the prediction row
                    var predictionrow = table.insertRow(-1);
                    var predictioncell0 = predictionrow.insertCell(-1);
                    var predictioncell1 = predictionrow.insertCell(-1);
                    var predictioncell2 = predictionrow.insertCell(-1);
                    var predictioncell3 = predictionrow.insertCell(-1);

                    predictioncell0.setAttribute("class", "packetlist");
                    predictioncell1.setAttribute("class", "packetlist");
                    predictioncell2.setAttribute("class", "packetlist");
                    predictioncell3.setAttribute("class", "packetlist");

                    predictioncell0.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deletePrediction(\"" + flight + "\", \"" + thedate + "\", \"" + launchsite + "\")\'> &nbsp; ";
                    predictioncell1.innerHTML = flight;
                    predictioncell2.innerHTML = thedate;
                    predictioncell3.innerHTML = launchsite;
                    predictionrow.appendChild(predictioncell0);
                    predictionrow.appendChild(predictioncell1);
                    predictionrow.appendChild(predictioncell2);
                    predictionrow.appendChild(predictioncell3);
 
                    
                }
                tablediv.appendChild(table);
            });
        });
        });
    }

