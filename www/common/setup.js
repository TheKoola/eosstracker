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
        var monitoring = (document.getElementById("newflightmonitoring").checked == true ? "t" : "f");
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
        //var rawfile = document.getElementById("newprediction_file");
        var origin = document.getElementById("newprediction_launchsite");
        var launchsite = origin.options[origin.selectedIndex].value;

	var file_data = $("#newprediction_file").prop("files")[0];
        var form_data = new FormData();    
        form_data.append("file", file_data);
        form_data.append("flightid", flightid);
        form_data.append("thedate", thedate);
        form_data.append("launchsite", launchsite);
        $.ajax({
                url: "addpredictiondata.php",
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
		success: function(jsonData, textStatus, jqXHR) {
	            if (jsonData.result == 1)
                        document.getElementById("addpredictionerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
                    else
                        document.getElementById("addpredictionerror").innerHTML = "";
                    getPredictions();
                    document.getElementById("newprediction_flightids").selectedIndex = 0;
                    document.getElementById("newprediction_launchsite").selectedIndex = 0;
                    document.getElementById("newprediction_thedate").value = "";
                    document.getElementById("newprediction_launchsite").value = "";
                    document.getElementById("newprediction_file").value = "";
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    document.getElementById("errors").innerHTML = "<mark>" + textStatus + ": " + errorThrown + "</mark>";
                    getPredictions();
                    document.getElementById("newprediction_flightids").selectedIndex = 0;
                    document.getElementById("newprediction_launchsite").selectedIndex = 0;
                    document.getElementById("newprediction_thedate").value = "";
                    document.getElementById("newprediction_launchsite").value = "";
                    document.getElementById("newprediction_file").value = "";
                }
        });

        var i = 1;
 
        //document.getElementById("addpredictionerror").innerHTML = flightid + ", " + thedate + ", " + launchsite + ", " + url;
       
/*	   
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
	*/
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


    /***********
    * getTimeZones function
    *
    * This function will get the list of timezones from the backend database.
    ***********/
    function getTimeZones() {
	$.get("readconfiguration.php", function(data) {
	    var mytzJson = JSON.parse(data);
	    var mytz = mytzJson.timezone;

	    //document.getElementById("errors2").innerHTML = "New TZ:  " + mytz + ",  id: " + mytzJson.sessionid;
            $.get("gettimezones.php", function(data) {
                var tzJson = JSON.parse(data);
                var t;
		
                // blank out the list of flightids for the prediction form
                $("#settimezone").html("");

                for (t in tzJson) {
		    if (mytz == tzJson[t].timezone)
                        $("#settimezone").append($("<option></option>").val(tzJson[t].timezone).prop("selected", true).html(tzJson[t].timezone));
		    else
                        $("#settimezone").append($("<option></option>").val(tzJson[t].timezone).html(tzJson[t].timezone));
                }
	    });
	});
    }

    /***********
    * setTimeZone function
    *
    * This function will call the backend PHP script to set a SESSION variable to the timezone selected
    ***********/
    function setTimeZone(element) {
	    var mytz = element.options[element.selectedIndex].value; 
	    var form_data = new FormData();
	    form_data.append("timezone", mytz);
            $.ajax({
                url: "setconfiguration.php",
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
		success: function(jsonData, textStatus, jqXHR) {
	            //document.getElementById("errors").innerHTML = "set tz: " + JSON.stringify(jsonData);
		    getTimeZones();
		},
                error: function (jqXHR, textStatus, errorThrown) {
	            //document.getElementById("errors").innerHTML = "error set tz: " + textStatus;
		}
	    });
    }

    /***********
    * validateCallsign function
    *
    * This function will validate the callsign
    ***********/
    function validateCallsign() {
        var callsign = document.getElementById("callsign");
	    
	//console.log("callsign:  " + callsign.value + ", passcode:  " + generatePasscode(callsign.value));

        if (!callsign.checkValidity()) {
            disableIgating();
            disableBeaconing();
            document.getElementById("beaconing").disabled = true;
            document.getElementById("beaconingtext").style["color"] = "lightgrey";
            document.getElementById("igating").disabled = true;
            document.getElementById("igatingtext1").style["color"] = "lightgrey";
            document.getElementById("igatingtext2").style["color"] = "lightgrey";
            document.getElementById("igating").checked = false;
            document.getElementById("beaconing").checked = false;
            //throw callsign.validationMessage;
	    return false;
	}
	if (callsign.value != "") {
            document.getElementById("igating").disabled = false;
            document.getElementById("beaconing").disabled = false;
	    document.getElementById("igatingtext1").style["color"] = "black";
	    document.getElementById("igatingtext2").style["color"] = "black";
	    document.getElementById("beaconingtexta").style["color"] = "black";
	    document.getElementById("beaconingtextb").style["color"] = "black";
        }	
	else {
	    disableIgating();
	    disableBeaconing();
            document.getElementById("beaconing").disabled = true;
            document.getElementById("beaconingtexta").style["color"] = "lightgrey";
            document.getElementById("beaconingtextb").style["color"] = "lightgrey";
            document.getElementById("igating").disabled = true;
            document.getElementById("igatingtext1").style["color"] = "lightgrey";
            document.getElementById("igatingtext2").style["color"] = "lightgrey";
            document.getElementById("igating").checked = false;
            document.getElementById("beaconing").checked = false;
	}
	
	return true;

    }


    /***********
    * disableIgating
    *
    * This function will disable the passcode data entry section
    ***********/
    function disableIgating() {
        document.getElementById("passcode").disabled = true;
        document.getElementById("passcodetext1").style["color"] = "lightgrey";
        document.getElementById("passcodetext2").style["color"] = "lightgrey";
	document.getElementById("ibeacon").disabled = true;
	document.getElementById("ibeaconrate").disabled = true;
	document.getElementById("ibeaconratetext1").style["color"] = "lightgrey";
	document.getElementById("ibeaconratetext2").style["color"] = "lightgrey";

	var beaconing = document.getElementById("beaconing").checked;
	if (!beaconing) {
	    document.getElementById("symbol").disabled = true;
    	    document.getElementById("beaconingtext101").style["color"] = "lightgrey";
    	    document.getElementById("beaconingtext102").style["color"] = "lightgrey";
	    document.getElementById("comment").disabled = true;
	    document.getElementById("beaconingtext81").style["color"] = "lightgrey";
	    document.getElementById("beaconingtext82").style["color"] = "lightgrey";
	    if (checkOverlay()) {
	        document.getElementById("overlay").disabled = false;
	        document.getElementById("overlaytext").style["color"] = "black";
	    }
            else {
	        document.getElementById("overlay").disabled = true;
	        document.getElementById("overlaytext").style["color"] = "lightgrey";
	    }
	}
    }

    /***********
    * disableBeaconing
    *
    * This function will disable the beaconing data entry section
    ***********/
    function disableBeaconing() {
        //document.getElementById("beaconing").disabled = true;
        //document.getElementById("beaconingtext").style["color"] = "lightgrey";
	document.getElementById("fastspeed").disabled = true;
	document.getElementById("fastrate").disabled = true;
	document.getElementById("slowspeed").disabled = true;
	document.getElementById("slowrate").disabled = true;
	document.getElementById("beaconlimit").disabled = true;
	document.getElementById("fastturn").disabled = true;
	document.getElementById("slowturn").disabled = true;
	document.getElementById("audiodev").disabled = true;
	document.getElementById("serialport").disabled = true;
	document.getElementById("serialproto").disabled = true;
	document.getElementById("includeeoss").disabled = true;
	
	var igating = document.getElementById("igating").checked;
        if (!igating) {
	    document.getElementById("symbol").disabled = true;
	    document.getElementById("beaconingtext101").style["color"] = "lightgrey";
	    document.getElementById("beaconingtext102").style["color"] = "lightgrey";
	    document.getElementById("comment").disabled = true;
	    document.getElementById("beaconingtext81").style["color"] = "lightgrey";
	    document.getElementById("beaconingtext82").style["color"] = "lightgrey";
	    if (checkOverlay()) {
	        document.getElementById("overlay").disabled = false;
	        document.getElementById("overlaytext").style["color"] = "black";
	    }
            else {
	        document.getElementById("overlay").disabled = true;
	        document.getElementById("overlaytext").style["color"] = "lightgrey";
	    }
	}
	document.getElementById("beaconingtext1a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext1b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext2a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext2b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext3a").style["color"] = "lightgrey";
        document.getElementById("beaconingtext3b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext4a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext4b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext5a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext5b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext6a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext6b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext7a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext7b").style["color"] = "lightgrey";
	document.getElementById("beaconingtext9a").style["color"] = "lightgrey";
	document.getElementById("beaconingtext9b").style["color"] = "lightgrey";
    }

    

    /***********
    * generatePasscode function
    *
    * This function will generate the passcode for a given callsign
    ***********/
    function generatePasscode(callsign) {
	var thecall = callsign.toUpperCase();
	var code = 0x73e2;
	var pcode = 0;
	var i = 0;
	var c;
	var shift;

	

	for (i in thecall){
            c = thecall.charCodeAt(i);
	    shift = (i % 2 == 0 ? 8 : 0); 
            code ^= c << shift;
	}

        pcode = code & 0x7fff

	return pcode;

    }

    /***********
    * validateComment function
    *
    * This function will validate the comment field
    ***********/
    function validateComment() {
	var comment = document.getElementById("comment");
	
	if (!comment.checkValidity()) {
	    comment.setCustomValidity("Invalid character within comment field.  Characters, | and ~ are not allowed.");
	    return false;
	}
 
	comment.setCustomValidity("");
	return true;
    }


    /***********
    * changeSymbol function
    *
    * This function will update the APRS symbol icon when the dropdown value is changed
    ***********/
    function changeSymbol() {
	var symbol = document.getElementById("symbol");
	var value = symbol.options[symbol.selectedIndex].value;
	var overlay = document.getElementById("overlay");
	var sym;

	r = aprssymbols;
	r.sort(function(a, b) { return (String(a.description) < String(b.description) ? -1 : (String(a.description) > String(b.description) ? 1 : 0))});

	var keys = Object.keys(r);
	var i = 0;
	var selectedSymbol = value;
	for (sym in keys) {
	    if (selectedSymbol == r[sym].symbol)
	  	i = sym;
	}
	//document.getElementById("symbolicon").innerHTML = "<img src=\"/images/aprs/" + r[i].tocall + ".png\" style=\"width: 32px; height: 32px;\">";
	
	var imagefile;
	var tc;
	var match = false;

	if (overlay.value != "")
	    overlay.value = overlay.value.toUpperCase();
	if (!overlay.checkValidity()) {
		overlay.value="";
	}
	else
	    overlay.value = overlay.value.toUpperCase();
	for (tc in validoverlays) {
	    if (r[i].tocall == validoverlays[tc]) {
	        match = true;
	    }
	}

        if (match) {
            if (overlay.value != "")
                 imagefile = "/images/aprs/" + overlay.value + "-" + r[i].tocall + ".png";
            else
	         imagefile = "/images/aprs/" + r[i].tocall + ".png";
            overlay.disabled = false;
            document.getElementById("overlaytext").style["color"] = "black";
	}
	else {
	    imagefile = "/images/aprs/" + r[i].tocall + ".png";
            overlay.disabled = true;
	    overlay.value = "";
            document.getElementById("overlaytext").style["color"] = "lightgrey";
	}

        document.getElementById("symbolicon").innerHTML = "<img src=\"" + imagefile + "\" style=\"width: 32px; height: 32px;\">";
    }


    /***********
    * validatePasscode function
    *
    * This function will validate the passcode
    ***********/
    function validatePasscode() {
        var passcode = document.getElementById("passcode");
	var callsign = document.getElementById("callsign");
	var calculatedPasscode = generatePasscode(callsign.value);


	if (!passcode.checkValidity()) { 
	    //throw passcode.validationMessage;
            return false;
	}

	if (String(passcode.value) != String(calculatedPasscode) || passcode.value == "") {
	    passcode.setCustomValidity("Invalid passcode for callsign, " + callsign.value.toUpperCase() + ".");
	    //throw passcode.validationMessage; 
	    return false;
	}

	passcode.setCustomValidity("");

	return true;
    }


    /***********
    * validateSlowSpeed function
    *
    * This function will make sure that the slowspeed threshold is <= fast speed threshold
    ***********/
    function validateSlowSpeed() {
        var slowspeed = document.getElementById("slowspeed");
	var fastspeed = document.getElementById("fastspeed");

	if (!slowspeed.checkValidity()) { 
	  //  throw slowspeed.validationMessage;
            return false;
	}

	if (parseInt(slowspeed.value) > 0 && parseInt(slowspeed.value) > parseInt(fastspeed.value)) {
	    slowspeed.setCustomValidity("Slow speed threshold cannot be greater than fast speed threshold");
	   // throw slowspeed.validationMessage; 
	    return false;
	}

	slowspeed.setCustomValidity("");
	
	return true;
    }


    /***********
    * checkOverlay function
    *
    * This function will check if the currently selected symbol is in the "allowed to be overlayed" list
    ***********/
    function checkOverlay() {
        var symbol = document.getElementById("symbol");
        var currentSymbol = symbol.options[symbol.selectedIndex].value;

	var sym;
        r = aprssymbols;
        r.sort(function(a, b) { return (String(a.description) < String(b.description) ? -1 : (String(a.description) > String(b.description) ? 1 : 0))});
        var keys = Object.keys(r);
        var enableOverlay = false;
	var tc;
        for (sym in keys) {
            if (typeof(r[sym].description) != "undefined" && typeof(r[sym].tocall) != "undefined" && r[sym].symbol != "1x")  {
                if (currentSymbol == r[sym].symbol) {
		    for (tc in validoverlays) {
                        if (r[sym].tocall == validoverlays[tc]) {
                            enableOverlay = true;
                        }
                    }
		    
		}

	    }
	}

	return enableOverlay;
    }
	
	


    /***********
    * checkIgating function
    *
    * This function will check that the checkbox "igating" is checked and if so, enable some input fields.
    ***********/
    function checkIgating() {
        var igating = document.getElementById("igating");
	
	if (igating.checked) {
	    document.getElementById("passcode").disabled = false;
	    document.getElementById("passcodetext1").style["color"] = "black";
	    document.getElementById("passcodetext2").style["color"] = "black";
	    document.getElementById("symbol").disabled = false;
	    document.getElementById("beaconingtext101").style["color"] = "black";
	    document.getElementById("beaconingtext102").style["color"] = "black";
	    document.getElementById("comment").disabled = false;
	    document.getElementById("beaconingtext81").style["color"] = "black";
	    document.getElementById("beaconingtext82").style["color"] = "black";
	    if (checkOverlay()) {
	        document.getElementById("overlay").disabled = false;
	        document.getElementById("overlaytext").style["color"] = "black";
	    }
            else {
	        document.getElementById("overlay").disabled = true;
	        document.getElementById("overlaytext").style["color"] = "lightgrey";
	    }
	    document.getElementById("ibeacon").disabled = false;
	    document.getElementById("ibeaconrate").disabled = false;
	    document.getElementById("ibeaconratetext1").style["color"] = "black";
	    document.getElementById("ibeaconratetext2").style["color"] = "black";
	}
	else {
	    disableIgating();
	}


    }

    /***********
    * checkBeaconing function
    *
    * This function will check that the checkbox "beaconing" is checked and if so, enable some input fields.
    ***********/
    function checkBeaconing() {
        var beaconing = document.getElementById("beaconing");
	
	if (beaconing.checked) {
	    document.getElementById("fastspeed").disabled = false;
	    document.getElementById("fastrate").disabled = false;
	    document.getElementById("slowspeed").disabled = false;
	    document.getElementById("slowrate").disabled = false;
	    document.getElementById("beaconlimit").disabled = false;
	    document.getElementById("fastturn").disabled = false;
	    document.getElementById("slowturn").disabled = false;
	    document.getElementById("audiodev").disabled = false;
	    document.getElementById("serialport").disabled = false;
	    document.getElementById("serialproto").disabled = false;
	    document.getElementById("comment").disabled = false;
	    document.getElementById("includeeoss").disabled = false;
	    document.getElementById("symbol").disabled = false;
	    if (checkOverlay()) {
	        document.getElementById("overlay").disabled = false;
	        document.getElementById("overlaytext").style["color"] = "black";
	    }
            else {
	        document.getElementById("overlay").disabled = true;
	        document.getElementById("overlaytext").style["color"] = "lightgrey";
	    }
	    document.getElementById("beaconingtext1a").style["color"] = "black";
	    document.getElementById("beaconingtext1b").style["color"] = "black";
	    document.getElementById("beaconingtext2a").style["color"] = "black";
	    document.getElementById("beaconingtext2b").style["color"] = "black";
	    document.getElementById("beaconingtext3a").style["color"] = "black";
            document.getElementById("beaconingtext3b").style["color"] = "black";
	    document.getElementById("beaconingtext4a").style["color"] = "black";
	    document.getElementById("beaconingtext4b").style["color"] = "black";
	    document.getElementById("beaconingtext5a").style["color"] = "black";
	    document.getElementById("beaconingtext5b").style["color"] = "black";
	    document.getElementById("beaconingtext6a").style["color"] = "black";
	    document.getElementById("beaconingtext6b").style["color"] = "black";
	    document.getElementById("beaconingtext7a").style["color"] = "black";
	    document.getElementById("beaconingtext7b").style["color"] = "black";
	    document.getElementById("beaconingtext81").style["color"] = "black";
	    document.getElementById("beaconingtext82").style["color"] = "black";
	    document.getElementById("beaconingtext9a").style["color"] = "black";
	    document.getElementById("beaconingtext9b").style["color"] = "black";
	    document.getElementById("beaconingtext101").style["color"] = "black";
	    document.getElementById("beaconingtext102").style["color"] = "black";
	}
	else {
	    disableBeaconing();
	}
    }


    /***********
    * getConfiguration function
    *
    * This function will get the current system configuration settings
    ***********/
    function getConfiguration() {
        $.get("readconfiguration.php", function(data) {
	    var jsonData = JSON.parse(data);
	    var keys = Object.keys(jsonData);
            var i;
            var ssid = document.getElementById("ssid");
            var serialport = document.getElementById("serialport");
            var serialproto = document.getElementById("serialproto");


            document.getElementById("callsign").value = (typeof(jsonData.callsign) == "undefined" ? "" : jsonData.callsign);	    
	    $("#ssid").val(jsonData.ssid);
            //ssid.selectedIndex = (typeof(jsonData.ssid) == "undefined" ? 9 : jsonData.ssid -1 );	    

            document.getElementById("passcode").value = (typeof(jsonData.passcode) == "undefined" ? "" : jsonData.passcode);	    
            document.getElementById("ibeacon").checked = (typeof(jsonData.ibeacon) == "undefined" ? false : (jsonData.ibeacon == "true" ? true : false));
            document.getElementById("ibeaconrate").value = (typeof(jsonData.ibeaconrate) == "undefined" ? "" : jsonData.ibeaconrate);	    

            document.getElementById("fastspeed").value = (typeof(jsonData.fastspeed) == "undefined" ? "" : jsonData.fastspeed);	    
            document.getElementById("slowspeed").value = (typeof(jsonData.slowspeed) == "undefined" ? "" : jsonData.slowspeed);	    
            document.getElementById("fastrate").value = (typeof(jsonData.fastrate) == "undefined" ? "" : jsonData.fastrate);	    
            document.getElementById("slowrate").value = (typeof(jsonData.slowrate) == "undefined" ? "" : jsonData.slowrate);	    
	    document.getElementById("beaconlimit").value = (typeof(jsonData.beaconlimit) == "undefined" ? "" : jsonData.beaconlimit);
            document.getElementById("fastturn").value = (typeof(jsonData.fastturn) == "undefined" ? "" : jsonData.fastturn);	    
            document.getElementById("slowturn").value = (typeof(jsonData.slowturn) == "undefined" ? "" : jsonData.slowturn);	    
	    document.getElementById("includeeoss").checked = (typeof(jsonData.includeeoss) == "undefined" ? false : (jsonData.includeeoss == "true" ? true : false));
	    document.getElementById("comment").value = (typeof(jsonData.comment) == "undefined" ? "EOSS Tracker" : jsonData.comment);
            var olay = (typeof(jsonData.overlay) == "undefined" ? "" : jsonData.overlay.toUpperCase());
	    $("#serialproto").val((typeof(jsonData.serialproto) == "undefined" ? "RTS" : jsonData.serialproto));

	    // Update the aprs symbols dropdown box
	    var sym;
	    r = aprssymbols;
	    r.sort(function(a, b) { return (String(a.description) < String(b.description) ? -1 : (String(a.description) > String(b.description) ? 1 : 0))});
	    var keys = Object.keys(r);
	    var i = 0;
	    var selectedSymbol = jsonData.symbol;
	    var overlaymatch = false;
	    var tc;
	    for (sym in keys) {
		if (typeof(r[sym].description) != "undefined" && typeof(r[sym].tocall) != "undefined" && r[sym].symbol != "1x")  {
		    if (selectedSymbol == r[sym].symbol) {
			i = sym;
                        if (olay != "") {
	                    for (tc in validoverlays) {
	                        if (r[sym].tocall == validoverlays[tc]) {
	                            overlaymatch = true;
	                        }
                            }
	                }
		    }
  		    $("#symbol").append($("<option></option>").val(r[sym].symbol).html(r[sym].description));
		}
	    }
	    $("#symbol").val(jsonData.symbol);
	    if (overlaymatch) {
                 imagefile = "/images/aprs/" + olay + "-" + r[i].tocall + ".png";
		 document.getElementById("overlay").disabled = false;
		 document.getElementById("overlay").value = olay;
                 document.getElementById("overlaytext").style["color"] = "black";
	    }
	    else {
                 imagefile = "/images/aprs/" + r[i].tocall + ".png";
		 document.getElementById("overlay").value = "";
		 document.getElementById("overlay").disabled = true;
                 document.getElementById("overlaytext").style["color"] = "lightgrey";
	    }
            document.getElementById("symbolicon").innerHTML = "<img src=\"" + imagefile + "\" style=\"width: 32px; height: 32px;\">";
	    
	    var selectedAudioDevice = jsonData.audiodev;
	    $.get("getaudiodevs.php", function(d) {
		var audioJson = JSON.parse(d);
		var a;
		var i = 0;
		var match = false;
		var matchidx = 0;

                $("#audiodev").html("");
                for (a in audioJson) {
	            if (selectedAudioDevice == audioJson[a].device) {
			match = true;
			matchidx = i;
		    }
                    $("#audiodev").append($("<option></option>").val(audioJson[a].device).html("Device " + audioJson[a].device + ": " + audioJson[a].description));
	            i += 1;
                }
                if (match)
		    document.getElementById("audiodev").selectedIndex = matchidx;
		else
    	            document.getElementById("audiodev").selectedIndex = 0;
	    });


	    // Get the serial port
	    var selectedSerialPort = (typeof(jsonData.serialport) == "undefined" ? "none" : jsonData.serialport);
	    $.get("getserialports.php", function(d) {
		var serialJson = JSON.parse(d);
		var a;
		var i = 0;
		var idx = 0;
		var match = false;
		var matchidx = 0;

                $("#serialport").html("");
                $("#serialport").append($("<option></option>").val("none").html("none"));
                for (a in serialJson) {
			if (selectedSerialPort == serialJson[a].serialport) {
			    match = true;
			    matchidx = i+1;
			}
                        $("#serialport").append($("<option></option>").val(serialJson[a].serialport).html(serialJson[a].serialport));
			i += 1;
                }
                if (match)
		    document.getElementById("serialport").selectedIndex = matchidx;
		else
		    document.getElementById("serialport").selectedIndex = 0;
	    });
            var beaconing = (typeof(jsonData.beaconing) == "undefined" ? false : (jsonData.beaconing == "true" ? true : false));
            var igating = (typeof(jsonData.igating) == "undefined" ? false : (jsonData.igating == "true" ? true : false));
            
            document.getElementById("igating").checked = igating;
            document.getElementById("beaconing").checked = beaconing;
	    checkIgating();
	    checkBeaconing();
            validateCallsign();
		

	});
    }


    /***********
    * setConfiguration function
    *
    * This function will set the current system configuration settings
    ***********/
    function setConfiguration() {
	    var form_data = new FormData();
	    var callsign = document.getElementById("callsign");
	    var passcode = document.getElementById("passcode");
	    var ibeacon = document.getElementById("ibeacon");
	    var ibeaconrate = document.getElementById("ibeaconrate");
	    var fastspeed = document.getElementById("fastspeed");
	    var slowspeed = document.getElementById("slowspeed");
	    var fastrate = document.getElementById("fastrate");
	    var slowrate = document.getElementById("slowrate");
	    var beaconlimit = document.getElementById("beaconlimit");
	    var fastturn = document.getElementById("fastturn");
	    var slowturn = document.getElementById("slowturn");
	    var igating = document.getElementById("igating");
	    var beaconing = document.getElementById("beaconing");
	    var audiodev = document.getElementById("audiodev");
	    var ssid = document.getElementById("ssid");
	    var serialport = document.getElementById("serialport");
	    var serialproto = document.getElementById("serialproto");
	    var includeeoss = document.getElementById("includeeoss");
	    var comment = document.getElementById("comment");
	    var symbol = document.getElementById("symbol");
	    var overlay = document.getElementById("overlay");

	    var fields = [ comment, fastspeed, fastrate, slowspeed, slowrate, beaconlimit, fastturn, slowturn ];
	    var f;

            if (!callsign.checkValidity()) {
                throw callsign.validationMessage;
                return false;
	    }

            if (igating.checked) {
		if (!validatePasscode()) {
                    throw passcode.validationMessage;
                    return false;
	        }
		else if (ibeacon.checked && !ibeaconrate.checkValidity()) {
		    throw ibeaconrate.validationMessage;
		    return false;
		}
		else {
		    form_data.append("ibeacon", ibeacon.checked.toString());
		    form_data.append("passcode", passcode.value);
		    form_data.append("igating", igating.checked.toString());
		    form_data.append("ibeaconrate", ibeaconrate.value);
		}
	    }
	    else {
		form_data.append("igating", "false");
		form_data.append("passcode", "");
            }
	        


	    if (beaconing.checked) {
		for (f of fields) {
	            //alert("checking: " + f.name);
	            if (!f.checkValidity()) {
			throw f.validationMessage;
			return false;
		    }
	        }
		form_data.append("beaconing", beaconing.checked.toString());
		form_data.append("includeeoss", includeeoss.checked.toString());
		form_data.append("fastspeed", fastspeed.value);
		form_data.append("fastrate", fastrate.value);
		form_data.append("slowspeed", slowspeed.value);
		form_data.append("slowrate", slowrate.value);
		form_data.append("beaconlimit", beaconlimit.value);
		form_data.append("fastturn", fastturn.value);
		form_data.append("slowturn", slowturn.value);
	    }
	    else 
		form_data.append("beaconing", "false");



	    if (beaconing.checked || igating.checked)  {
		form_data.append("comment", comment.value);
	        form_data.append("symbol", symbol.value);
		if (!overlay.disabled) {
                    form_data.append("overlay", overlay.value.toUpperCase());
		}
		else {
		    form_data.append("overlay", "");
		}
	    }
	    else {
		form_data.append("overlay", "");
	    }

	    form_data.append("callsign", callsign.value.toUpperCase());
	    form_data.append("ssid", ssid.options[ssid.selectedIndex].value);
	    form_data.append("audiodev", audiodev.options[audiodev.selectedIndex].value);
	    form_data.append("serialport", serialport.options[serialport.selectedIndex].value);
	    form_data.append("serialproto", serialproto.options[serialproto.selectedIndex].value);
            $.ajax({
                url: "setconfiguration.php",
                dataType: 'json',
                cache: false,
                contentType: false,
                processData: false,
                data: form_data,
                type: 'post',
		success: function(jsonData, textStatus, jqXHR) {
	            document.getElementById("configurationsettings_error").innerHTML = "<mark>Settings saved.</mark>";
		    setTimeout(function() {
		        document.getElementById("configurationsettings_error").innerHTML = "";
		    }, 3000);
		    getConfiguration();
		},
                error: function (jqXHR, textStatus, errorThrown) {
	            //document.getElementById("errors").innerHTML = "error set tz: " + textStatus;
		}
	    });

	    return false;
    }



