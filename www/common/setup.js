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

    /*********
     * This is a global variable that contains the list of frequencies.
    *********/
     var frequencies = [];


    /***********
    * validateFrequency function
    *
    * This function will add validate that the frequency entered is betwee 144MHz and 148MHz.
    ***********/
    function validateFrequency() {
        var freq = document.getElementById("newfrequency");
        var thefreq = freq.value * 10 / 10;

        var min = Math.min(...frequencies, thefreq);
        var max = Math.max(...frequencies, thefreq);
        var range = max - min;


        if (thefreq < 144 || thefreq > 146) {
	        freq.setCustomValidity("Frequency range must be between 144MHz and 146MHz.");
            return false;
        }

        if (thefreq == 144.390) {
	        freq.setCustomValidity("The standard APRS frequency of 144.390MHz is already included within the system.");
            return false;
        }

        if (range > 2) {
	        freq.setCustomValidity("The range of frequencies must be within 2MHz.");
            return false;
        }

	    freq.setCustomValidity("");
        return true;
    }


    /***********
    * deleteFrequency function
    *
    * This function will delete the specified frequency.
    ***********/
    function deleteFrequency(freq) {
        var retVal = confirm("This will delete the frequency, " + freq + ".   Are you sure?");
        if (retVal == true)
            $.get("deletefrequency.php?freq=" + freq, function(data) {
                var jsonData = JSON.parse(data);

                if (jsonData.result == 0)
                    document.getElementById("addfrequencyerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
                else
                    document.getElementById("addfrequencyerror").innerHTML = "";
                getFrequencies();
                getLaunchSites();
                getPredictions();
                getFlights();
            });
    }

    /***********
    * addFrequency function
    *
    * This function will add a new frequency.
    ***********/
    function addFrequency() {
        var freq = document.getElementById("newfrequency");
        var thefreq = freq.value;

        if (!freq.checkValidity()) {
            throw freq.validationMessage;
            return false;
        }

        $.get("addfrequency.php?freq=" + thefreq, function(data) {
            var jsonData = JSON.parse(data);

            if (jsonData.result == 0)
                document.getElementById("addfrequencyerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else
                document.getElementById("addfrequencyerror").innerHTML = "";
            getFrequencies();
            getLaunchSites();
            getPredictions();
            getFlights();
            document.getElementById("newfrequency").value = "";
        });
 
    }


    /***********
    * getFrequencies function
    *
    * This function will get the list of frequencies.
    ***********/
    function getFrequencies() {
        $.get("getfrequencies.php", function(data) {
            var freqJson = JSON.parse(data);
            var keys = Object.keys(freqJson);


            //Create a HTML Table element.
            var tablediv = document.getElementById("frequencies");
            var table = document.createElement("TABLE");
            table.setAttribute("class", "packetlist");
            tablediv.innerHTML = "";


            // Create the header row
            var headerRow = table.insertRow(-1);
            var headerCell0 = headerRow.insertCell(-1);
            var headerCell1 = headerRow.insertCell(-1);
            headerCell0.setAttribute("class", "packetlistheader");
            headerCell1.setAttribute("class", "packetlistheader");
            headerCell1.setAttribute("style", "text-align: center;"); 
            headerCell0.innerHTML = "Action";
            headerCell1.innerHTML = "Frequency";
            headerRow.appendChild(headerCell0);
            headerRow.appendChild(headerCell1);


            //Add the data rows.
            frequencies = [];
            $("#addnewbeacon_frequency").html("");
            $("#beacon1_frequency").html("");
            $("#beacon2_frequency").html("");
            for (i = 0; i < keys.length; i++) {
                var freq = freqJson[i].freq * 10 / 10;
                frequencies.push(freq); 
                $("#addnewbeacon_frequency").append($("<option></option>").val(freq).html(freq.toFixed(3) + " MHz"));
                $("#beacon1_frequency").append($("<option></option>").val(freq).html(freq.toFixed(3) + " MHz"));
                $("#beacon2_frequency").append($("<option></option>").val(freq).html(freq.toFixed(3) + " MHz"));

                // Create the row
                var freqrow = table.insertRow(-1);
                var freqcell0 = freqrow.insertCell(-1);
                var freqcell1 = freqrow.insertCell(-1);

                freqcell0.setAttribute("class", "packetlist");
                freqcell1.setAttribute("class", "packetlist");
                freqcell1.setAttribute("style", "text-align: center;"); 

                // If this is 144.39, then we don't want to allow deletions.
                if (freq == 144.390) {
                    freqcell0.innerHTML = "Standard";
                    freqcell0.setAttribute("style", "height: 22px;");
                }
                else 
                    freqcell0.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteFrequency(\"" + freq + "\")\'> &nbsp; ";
                
                freqcell1.innerHTML = freq.toFixed(3) + " MHz";
                freqrow.appendChild(freqcell0);
                freqrow.appendChild(freqcell1);

            }
            tablediv.appendChild(table);

        });
    }

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
                getFrequencies();
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
        var launchsite = document.getElementById("launchsite_name");
        var lat = document.getElementById("launchsite_lat").value;
        var lon = document.getElementById("launchsite_lon").value;
        var alt = document.getElementById("launchsite_alt").value;

        if (!launchsite.checkValidity()) {
            throw launchsite.validationMessage;
            return false;
        }

        $.get("addlaunchsite.php?launchsite=" + launchsite.value + "&lat=" + lat + "&lon=" + lon + "&alt=" + alt, function(data) {
            var jsonData = JSON.parse(data);

            if (jsonData.result == 0)
                document.getElementById("addlaunchsiteerror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else
                document.getElementById("addlaunchsiteerror").innerHTML = "";
            getLaunchSites();
            getFrequencies();
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
        var beacon_desc = document.getElementById("addnewbeacon_description");
       
        if (!beacon_call.checkValidity()) {
            throw beacon_call.validationMessage;
            return false;
        }

        if (!beacon_desc.checkValidity()) {
            throw beacon_desc.validationMessage;
            return false;
        }

        $.get("addbeacon.php?flightid=" + flightid + "&callsign=" + call + "&description=" + beacon_desc.value + "&frequency=" + freq, function(data) {
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
        var notes = document.getElementById("newflightnotes");
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

        if (!notes.checkValidity()) {
            throw notes.validationMessage;
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
        for (i = 1; i < 3; i++) {
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

        $.get("addflight.php?flightid=" + flightid + "&description=" + notes.value + "&monitoring=" + monitoring + "&launchsite=" + launchsite + url, function(data) {
            var jsonData = JSON.parse(data);
  
            if (jsonData.result == 0)
                document.getElementById("newflighterror").innerHTML = "<mark>" + jsonData.error + "</mark>";
            else 
                document.getElementById("newflighterror").innerHTML = "";
            document.getElementById("addnewbeaconerror").innerHTML = "";
            getFlights();
            getPredictions();
            getLaunchSites();
            getFrequencies();
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
            getTrackers();
        });
    }


    /***********
    * changeAssignedLaunchSite function
    *
    * This function will update the assigned launch site for a given flight
    ***********/
    function changeAssignedLaunchSite(flightid, element) {
        var assignedSite = element.options[element.selectedIndex].value;


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
                    flightcell0.setAttribute("style", "background-color: #737373;"); 
                    flightcell1.setAttribute("style", "background-color: #737373;"); 
                    flightcell2.setAttribute("style", "background-color: #737373;"); 
                    flightcell3.setAttribute("style", "background-color: #737373; text-align: center;"); 
                    flightcell4.setAttribute("style", "background-color: #737373; text-align: center;"); 
    
                    flightcell0.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteFlight(\"" + flight + "\")\'> &nbsp; ";
                    flightcell1.innerHTML = flight;
                    flightcell2.innerHTML = flightsJson[i].description;

                    var html = "<select id=\"" + flightsJson[i].flight + "_launchsite\" onchange='changeAssignedLaunchSite(\"" + flightsJson[i].flight + "\", this)'>";
                    var s;
                    var checked;
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
                        freq.innerHTML = flightsJson[i].beacons[b].frequency + " MHz";
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
 
        return false;
    }


    /***********
    * getPredictFiles function
    *
    * This function will download initiate a predict file download from https://www.eoss.org/predict through the grabprediction.php file
    ***********/
    function getPredictFiles() {
        document.getElementById("predict-status").innerHTML = "<mark>Attempting predict file downloads...</mark>";

        $.get("grabprediction.php", function(data) {
            var r;
            var html = "";
            var firsttime = 1;
            var datetime = new Date();

            for(r in data) {
                if (firsttime == 1)
                    html = "<p class=\"normal-italic\">Last attempt: " + datetime.toLocaleString() + "</p>";
                firsttime = 0;

                html = html + "<p class=\"normal-italic\"><mark class=\"" + (data[r].result == 0 ? "okay" : "notokay") + "\">" + data[r].flightid + ": " + (data[r].result == 0 ? "Predict file added successfully." : data[r].error) + "</mark></p>";
            }

            document.getElementById("predict-status").innerHTML = html;
            getPredictions();

        });
    }

    /***********
    * deletePredictFiles function
    *
    * This function will delete all predict files that are older than two weeks.
    ***********/
    function deletePredictFiles() {
        var retVal = confirm("This will delete all prediction data older than two weeks.   Are you sure you want to delete this data?");
        if (retVal == true)
            $.get("deleteoldpredicts.php", function(data) {
                var html;
                var datetime = new Date();
                var r;

                html = "<p class=\"normal-italic\">Last attempt: " + datetime.toLocaleString() + "</p>";
                for(r in data) {
                    if (data[r].result != 0) 
                        html = html + "<p class=\"normal-italic\"><mark class=\"notokay\">An error occured:  " + data[r].error + "</mark></p>";
                    else
                        html = html + "<p class=\"normal-italic\"><mark class=\"okay\">Success</mark></p>";
                }

                document.getElementById("deletepredictions-status").innerHTML = html;
                setTimeout(function() {
                    document.getElementById("deletepredictions-status").innerHTML = "";
                }, 10000);
                getPredictions();
            });
    }


    /***********
    * deletePrediction function
    *
    * This function will delete the specified flight predict file.
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
	    

        if (!callsign.checkValidity()) {
            disableIgating();
            disableBeaconing();
            document.getElementById("beaconing").disabled = true;
            //document.getElementById("beaconingtext").className = "disabled";
            document.getElementById("igating").disabled = true;
            document.getElementById("igatingtext1").className = "disabled";
            document.getElementById("igatingtext2").className = "disabled";
            document.getElementById("igating").checked = false;
            document.getElementById("beaconing").checked = false;
            //throw callsign.validationMessage;
	        return false;
	    }
        if (callsign.value != "") {
            document.getElementById("igating").disabled = false;
            document.getElementById("beaconing").disabled = false;
            document.getElementById("igatingtext1").className = "normal";
            document.getElementById("igatingtext2").className = "normal";
            document.getElementById("beaconingtexta").className = "normal";
            document.getElementById("beaconingtextb").className = "normal";
            }	
        else {
            disableIgating();
            disableBeaconing();
            document.getElementById("beaconing").disabled = true;
            document.getElementById("beaconingtexta").className = "disabled";
            document.getElementById("beaconingtextb").className = "disabled";
            document.getElementById("igating").disabled = true;
            document.getElementById("igatingtext1").className = "disabled";
            document.getElementById("igatingtext2").className = "disabled";
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
        document.getElementById("passcodetext1").className = "disabled";
        document.getElementById("passcodetext2").className = "disabled";
	    document.getElementById("ibeacon").disabled = true;
    	document.getElementById("ibeaconrate").disabled = true;
    	document.getElementById("ibeaconratetext1").className = "disabled";
    	document.getElementById("ibeaconratetext2").className = "disabled";

    	var beaconing = document.getElementById("beaconing").checked;
    	if (!beaconing) {
    	    document.getElementById("symbol").disabled = true;
    	    document.getElementById("beaconingtext101").className = "disabled";
    	    document.getElementById("beaconingtext102").className = "disabled";
    	    document.getElementById("comment").disabled = true;
    	    document.getElementById("beaconingtext81").className = "disabled";
    	    document.getElementById("beaconingtext82").className = "disabled";
            if (checkOverlay()) {
                document.getElementById("overlay").disabled = false;
                document.getElementById("overlaytext").className = "normal-noborders";
            }
                else {
                document.getElementById("overlay").disabled = true;
                document.getElementById("overlaytext").className = "disabled-noborders";
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
        //document.getElementById("beaconingtext").className = "disabled";
            
        document.getElementById("audiodev").disabled = true;
        document.getElementById("serialport").disabled = true;
        document.getElementById("serialproto").disabled = true;
        document.getElementById("includeeoss").disabled = true;
        document.getElementById("eoss_string").disabled = true;
        document.getElementById("objectbeaconing").disabled = true;
        document.getElementById("mobilestation").disabled = true;
        document.getElementById("mobiletext1").className = "disabled";
        document.getElementById("mobiletext2").className = "disabled";
        checkMobile();
        
        var igating = document.getElementById("igating").checked;
        if (!igating) {
            document.getElementById("symbol").disabled = true;
            document.getElementById("beaconingtext101").className = "disabled";
            document.getElementById("beaconingtext102").className = "disabled";
            document.getElementById("comment").disabled = true;
            document.getElementById("beaconingtext81").className  = "disabled";
            document.getElementById("beaconingtext82").className  = "disabled";
            if (checkOverlay()) {
                document.getElementById("overlay").disabled = false;
                document.getElementById("overlaytext").className = "normal-noborders";
            }
            else {
                document.getElementById("overlay").disabled = true;
                document.getElementById("overlaytext").className = "disabled-noborders";
            }
        }
        document.getElementById("beaconingtext6a").className = "disabled";
        document.getElementById("beaconingtext6b").className = "disabled";
        document.getElementById("beaconingtext7a").className = "disabled";
        document.getElementById("beaconingtext7b").className = "disabled";
        document.getElementById("beaconingtext9a").className = "disabled";
        document.getElementById("beaconingtext9b").className = "disabled";
        document.getElementById("objectbeacona").className = "disabled";
        document.getElementById("objectbeaconb").className = "disabled";
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
            document.getElementById("overlaytext").className = "normal-noborders";
	}
	else {
	    imagefile = "/images/aprs/" + r[i].tocall + ".png";
            overlay.disabled = true;
	    overlay.value = "";
            document.getElementById("overlaytext").className = "disabled-noborders";
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
	    document.getElementById("passcodetext1").className = "normal";
	    document.getElementById("passcodetext2").className = "normal";
	    document.getElementById("symbol").disabled = false;
	    document.getElementById("beaconingtext101").className = "normal";
	    document.getElementById("beaconingtext102").className = "normal";
	    document.getElementById("comment").disabled = false;
	    document.getElementById("beaconingtext81").className = "normal";
	    document.getElementById("beaconingtext82").className = "normal";
	    if (checkOverlay()) {
	        document.getElementById("overlay").disabled = false;
	        document.getElementById("overlaytext").className = "normal-noborders";
	    }
        else {
	        document.getElementById("overlay").disabled = true;
	        document.getElementById("overlaytext").className = "disabled-noborders";
	    }
	    document.getElementById("ibeacon").disabled = false;
	    document.getElementById("ibeaconrate").disabled = false;
	    document.getElementById("ibeaconratetext1").className = "normal";
	    document.getElementById("ibeaconratetext2").className = "normal";
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
            document.getElementById("audiodev").disabled = false;
            document.getElementById("serialport").disabled = false;
            document.getElementById("serialproto").disabled = false;
            document.getElementById("comment").disabled = false;
            document.getElementById("includeeoss").disabled = false;
            document.getElementById("objectbeaconing").disabled = false;
            document.getElementById("mobilestation").disabled = false;
            document.getElementById("mobiletext1").className = "normal";
            document.getElementById("mobiletext2").className = "normal";
            checkEOSS();
            checkMobile();
            document.getElementById("symbol").disabled = false;
            if (checkOverlay()) {
                document.getElementById("overlay").disabled = false;
                document.getElementById("overlaytext").className = "normal-noborders";
            }
                else {
                document.getElementById("overlay").disabled = true;
                document.getElementById("overlaytext").className = "disabled-noborders";
            }
            document.getElementById("beaconingtext6a").className = "normal";
            document.getElementById("beaconingtext6b").className = "normal";
            document.getElementById("beaconingtext7a").className = "normal";
            document.getElementById("beaconingtext7b").className = "normal";
            document.getElementById("beaconingtext81").className = "normal";
            document.getElementById("beaconingtext82").className = "normal";
            document.getElementById("beaconingtext9a").className = "normal";
            document.getElementById("beaconingtext9b").className = "normal";
            document.getElementById("beaconingtext101").className = "normal";
            document.getElementById("beaconingtext102").className = "normal";
            document.getElementById("objectbeacona").className = "normal";
            document.getElementById("objectbeaconb").className = "normal";
        }
        else {
            disableBeaconing();
        }
    }


    /***********
    * checkMobile function
    *
    * This function will check that the checkbox "Mobile station" is checked and if so, enable some input fields.
    ***********/
    function checkMobile() {
        var mobilestation = document.getElementById("mobilestation");
        var rfbeaconing = document.getElementById("beaconing");

        if (mobilestation.checked && rfbeaconing.checked)  {
            document.getElementById("fastspeed").disabled   = false;
            document.getElementById("fastrate").disabled    = false;
            document.getElementById("slowspeed").disabled   = false;
            document.getElementById("slowrate").disabled    = false;
            document.getElementById("beaconlimit").disabled = false;
            document.getElementById("fastturn").disabled    = false;
            document.getElementById("slowturn").disabled    = false;
            document.getElementById("beaconingtext1a").className = "normal";
            document.getElementById("beaconingtext1b").className = "normal";
            document.getElementById("beaconingtext2a").className = "normal";
            document.getElementById("beaconingtext2b").className = "normal";
            document.getElementById("beaconingtext3a").className = "normal";
            document.getElementById("beaconingtext3b").className = "normal";
            document.getElementById("beaconingtext4a").className = "normal";
            document.getElementById("beaconingtext4b").className = "normal";
            document.getElementById("beaconingtext5a").className = "normal";
            document.getElementById("beaconingtext5b").className = "normal";
        }
        else {
            document.getElementById("fastspeed").disabled   = true;
            document.getElementById("fastrate").disabled    = true;
            document.getElementById("slowspeed").disabled   = true;
            document.getElementById("slowrate").disabled    = true;
            document.getElementById("beaconlimit").disabled = true;
            document.getElementById("fastturn").disabled    = true;
            document.getElementById("slowturn").disabled    = true;
            document.getElementById("beaconingtext1a").className = "disabled";
            document.getElementById("beaconingtext1b").className = "disabled";
            document.getElementById("beaconingtext2a").className = "disabled";
            document.getElementById("beaconingtext2b").className = "disabled";
            document.getElementById("beaconingtext3a").className = "disabled";
            document.getElementById("beaconingtext3b").className = "disabled";
            document.getElementById("beaconingtext4a").className = "disabled";
            document.getElementById("beaconingtext4b").className = "disabled";
            document.getElementById("beaconingtext5a").className = "disabled";
            document.getElementById("beaconingtext5b").className = "disabled";
        }
    }


    /***********
    * checkEOSS function
    *
    * This function will check that the checkbox "Include EOSS" is checked and if so, enable some input fields.
    ***********/
    function checkEOSS() {
        var eoss = document.getElementById("includeeoss");

        if (eoss.checked) 
	        document.getElementById("eoss_string").disabled = false;
        else
	        document.getElementById("eoss_string").disabled = true;
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
            document.getElementById("mobilestation").checked = (typeof(jsonData.mobilestation) == "undefined" ? false : (jsonData.mobilestation == "true" ? true : false));
            document.getElementById("eoss_string").value = (typeof(jsonData.eoss_string) == "undefined" ? "EOSS" : jsonData.eoss_string);
            document.getElementById("comment").value = (typeof(jsonData.comment) == "undefined" ? "EOSS Tracker" : jsonData.comment);
            var olay = (typeof(jsonData.overlay) == "undefined" ? "" : jsonData.overlay.toUpperCase());
            $("#serialproto").val((typeof(jsonData.serialproto) == "undefined" ? "RTS" : jsonData.serialproto));

            // Get the custom filter
            if (typeof(jsonData.customfilter) != "undefined") {
                var customfilter = jsonData.customfilter;
                var splitfilter = customfilter.split("/");

                var lat = parseFloat(splitfilter[1]);
                var lon = parseFloat(splitfilter[2]);
                var rad = parseFloat(splitfilter[3]);

                document.getElementById("filter_lat").value = lat;
                document.getElementById("filter_lon").value = lon;
                document.getElementById("filter_radius").value = rad;
            }

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
                document.getElementById("overlaytext").className = "normal-noborders";
            }
            else {
                imagefile = "/images/aprs/" + r[i].tocall + ".png";
                document.getElementById("overlay").value = "";
                document.getElementById("overlay").disabled = true;
                document.getElementById("overlaytext").className = "disabled-noborders";
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

            // getaudiodevs
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

            // getserialports
            });
            var beaconing = (typeof(jsonData.beaconing) == "undefined" ? false : (jsonData.beaconing == "true" ? true : false));
            var igating = (typeof(jsonData.igating) == "undefined" ? false : (jsonData.igating == "true" ? true : false));
            var objectbeaconing = (typeof(jsonData.objectbeaconing) == "undefined" ? false : (jsonData.objectbeaconing == "true" ? true : false));
                    
            document.getElementById("igating").checked = igating;
            document.getElementById("beaconing").checked = beaconing;
            document.getElementById("objectbeaconing").checked = objectbeaconing;
            checkIgating();
            checkBeaconing();
            validateCallsign();

        // readconfiguration
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
	    var objectbeaconing = document.getElementById("objectbeaconing");
	    var audiodev = document.getElementById("audiodev");
	    var ssid = document.getElementById("ssid");
	    var serialport = document.getElementById("serialport");
	    var serialproto = document.getElementById("serialproto");
	    var includeeoss = document.getElementById("includeeoss");
	    var mobilestation = document.getElementById("mobilestation");
        var eoss = document.getElementById("eoss_string");
	    var comment = document.getElementById("comment");
	    var symbol = document.getElementById("symbol");
	    var overlay = document.getElementById("overlay");
        var filter_lat = document.getElementById("filter_lat");
        var filter_lon = document.getElementById("filter_lon");
        var filter_radius = document.getElementById("filter_radius");

	    var fields = [ comment, fastspeed, fastrate, slowspeed, slowrate, beaconlimit, fastturn, slowturn ];
	    var f;

        if (!filter_lat.checkValidity()) {
            throw filter_lat.validationMessage;
            return false;
	    }
        
        if (!filter_lon.checkValidity()) {
            throw filter_lon.validationMessage;
            return false;
	    }

        if (!filter_radius.checkValidity()) {
            throw filter_radius.validationMessage;
            return false;
	    }

        if (filter_lat.value == null || filter_lat.value == 0 || filter_lat.value == "", 
            filter_lon.value == null || filter_lon.value == 0 || filter_lon.value == "",
            filter_radius.value == null || filter_radius.value == 0 || filter_radius.value == "") {
            customfilter = "";
        }
        else
            customfilter = "r/" + filter_lat.value + "/" + filter_lon.value + "/" + filter_radius.value;
        form_data.append("customfilter", customfilter);


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

        form_data.append("mobilestation", mobilestation.checked.toString());

	    if (beaconing.checked) {
		    for (f of fields) {
	            if (!f.checkValidity()) {
			        throw f.validationMessage;
			        return false;
		        }
	        }
            form_data.append("beaconing", beaconing.checked.toString());
            form_data.append("objectbeaconing", objectbeaconing.checked.toString());
            form_data.append("includeeoss", includeeoss.checked.toString());
            form_data.append("eoss_string", eoss.value);
            form_data.append("fastspeed", fastspeed.value);
            form_data.append("fastrate", fastrate.value);
            form_data.append("slowspeed", slowspeed.value);
            form_data.append("slowrate", slowrate.value);
            form_data.append("beaconlimit", beaconlimit.value);
            form_data.append("fastturn", fastturn.value);
            form_data.append("slowturn", slowturn.value);
        }
        else {
            form_data.append("beaconing", "false");
            form_data.append("objectbeaconing", "false");
        }

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
                document.getElementById("configurationsettings_error2").innerHTML = "<mark>Settings saved.</mark>";
                setTimeout(function() {
                    document.getElementById("configurationsettings_error").innerHTML = "";
                    document.getElementById("configurationsettings_error2").innerHTML = "";
                }, 3000);
                getConfiguration();
            },
            error: function (jqXHR, textStatus, errorThrown) {
            }
        });
        return false;
    }



    /***********
    * displayKioskData function
    *
    * This function queries the track.eoss.org system for the flight, tracker, launchsite, and frequency configuration.
    * It will use that information to populate an HTML table along with cancel or accept buttons for the user. 
    ***********/
    function displayKioskData() {

        // Get the configuration
        $.get("getconfiguration.php", function(data) {
            var keys = Object.keys(data);
            var i;

            //console.log("keys: " + JSON.stringify(keys));

            // The div we want to insert our table into
            var tablediv = document.getElementById("syncup-div");

            // Create a table and rows to hold our JSON data
            var table = document.createElement("TABLE");
            table.setAttribute("class", "packetlist");
            table.setAttribute("style", "width: auto; margin-left: 30px;");
            tablediv.innerHTML = "";

            // Create the header row
            var headerRow = table.insertRow(-1);
            var headerCell0 = headerRow.insertCell(-1);
            headerCell0.setAttribute("class", "packetlistheader");
            headerCell0.innerHTML = "Proposed Changes (from the kiosk system at track.eoss.org)";
            headerRow.appendChild(headerCell0);

            // Now build the flight rows
            if ("flights" in data) {
                var flights = data["flights"];
                var flightsHeaderRow = table.insertRow(-1);
                var flightsHeaderCell0 = flightsHeaderRow.insertCell(-1);
                flightsHeaderCell0.setAttribute("class", "packetlist-highlight");
                flightsHeaderCell0.innerHTML = "Flights";
                flightsHeaderRow.appendChild(flightsHeaderCell0);

                var row = table.insertRow(-1);
                var flightCell = row.insertCell(0);
                flightCell.setAttribute("class", "packetlist");
                //flightCell.setAttribute("style", "font-family:  'Lucida Console', Monaco, monospace;");
                flightCell.setAttribute("style", "font-size: 1.1em;");
                var flighthtml = "<table class=\"packetlist\"><tr><th class=\"packetlistheader\">Flightid</th><th class=\"packetlistheader\">Status</th><th class=\"packetlistheader\">Beacons</th></tr>";


                //Add the data rows.
                for (i = 0; i < flights.length; i++) {
    
                    var flight = flights[i];
    
                    beacons = []
                    if ("flightmap" in data) {
                        var flightmap = data["flightmap"];
                        var j;
                        for (j = 0; j < flightmap.length; j++) {
                            if (flightmap[j].flightid == flight.flightid)
                                beacons.push(flightmap[j].callsign + " (" + flightmap[j].freq.toFixed(3) + " MHz)");
                        }
                    }


                    var activeInactive;
                    if (flight.active == true) 
                        activeInactive = " <font style=\"color: #ffbf00;\">(tracking) </font> ";
                    else
                        //activeInactive = " <font style=\"color: #ffbf00;\">(tracking) </font> ";
                        activeInactive = " (inactive) ";
                    flighthtml = flighthtml + "<tr><td class=\"packetlist\">" + flight.flightid + "</td><td class=\"packetlist\">" + activeInactive + "</td><td class=\"packetlist\">";
                    var firsttime = 0;
                    for (b in beacons) {
                        if (firsttime == 1)
                            flighthtml = flighthtml + ", ";
                        firsttime = 1;
                        flighthtml = flighthtml + beacons[b];
                    }
                    flighthtml = flighthtml + "</td></tr>";

                    //if (flight.active == true)
                    //    flightCell.setAttribute("style", "font-family:  'Lucida Console', Monaco, monospace; color: #ffbf00;");
                    //else
                }
                flightCell.innerHTML = flighthtml + "</table>";
                row.appendChild(flightCell);
            }



            if ("launchsites" in data) {
                // {"launchsite":"Deer Trail","lat":39.61,"lon":-104.042,"alt":5200}
                var launchsites = data["launchsites"];
                var launchsiteHeaderRow = table.insertRow(-1);
                var launchsiteHeaderCell0 = launchsiteHeaderRow.insertCell(-1);
                launchsiteHeaderCell0.setAttribute("class", "packetlist-highlight");
                launchsiteHeaderCell0.innerHTML = "Launch Sites";
                launchsiteHeaderRow.appendChild(launchsiteHeaderCell0);

                var row = table.insertRow(-1);
                var siteCell = row.insertCell(0);
                siteCell.setAttribute("class", "packetlist");
                //siteCell.setAttribute("style", "font-family:  'Lucida Console', Monaco, monospace;");
                siteCell.setAttribute("style", "font-size:  1.1em;");
                var launchsitehtml = "<table class=\"packetlist\"><tr><th class=\"packetlistheader\">Launch Site</th><th class=\"packetlistheader\">Coordinates</th><th class=\"packetlistheader\">Elevation</th></tr>";


                //Add the data rows.
                for (i = 0; i < launchsites.length; i++) {
                    var site = launchsites[i];

                    launchsitehtml = launchsitehtml + "<tr><td class=\"packetlist\">" + site.launchsite + "</td><td class=\"packetlist\">" + (site.lat * 10 / 10).toFixed(4) + ", " + (site.lon * 10 / 10).toFixed(4) + "</td><td class=\"packetlistright\">" + site.alt.toLocaleString() + " ft</td></tr>";
                }

                siteCell.innerHTML = launchsitehtml + "</table>";
                row.appendChild(siteCell);
            }


            if ("trackers" in data) {
                // trackers: {"callsign":"J3FF-4","tactical":"ZZ-Not Active","notes":"SDFSDF"}
                // teams:  {"tactical":"Delta","flightid":null}
                var trackers = data["trackers"];

                var trackersRow = table.insertRow(-1);
                var trackersHeaderCell = trackersRow.insertCell(-1);
                trackersHeaderCell.setAttribute("class", "packetlist-highlight");
                trackersHeaderCell.innerHTML = "Trackers";
                trackersRow.appendChild(trackersHeaderCell);

                var row = table.insertRow(-1);
                var trackersCell = row.insertCell(0);
                trackersCell.setAttribute("class", "packetlist");
                //trackersCell.setAttribute("style", "font-family:  'Lucida Console', Monaco, monospace;");
                trackersCell.setAttribute("style", "font-size:  1.1em;");
                var trackershtml = "<table class=\"packetlist\"><tr><th class=\"packetlistheader\">Team</th><th class=\"packetlistheader\">Callsign</th><th class=\"packetlistheader\">Notes</th></tr>";


                //Add the data rows.
                for (i = 0; i < trackers.length; i++) {
                    var tracker = trackers[i];
                    trackershtml = trackershtml + "<tr><td class=\"packetlist\">" + tracker.tactical + "</td><td class=\"packetlist\">" + tracker.callsign + "</td><td class=\"packetlist\">" + tracker.notes + "</td></tr>";
                }
                trackersCell.innerHTML = trackershtml + "</table>";
                row.appendChild(trackersCell);
            }


            if ("freqs" in data) {
                // {"freq":145.045}
                var freqs = data["freqs"];

                var freqRow = table.insertRow(-1);
                var freqHeaderCell = freqRow.insertCell(-1);
                freqHeaderCell.setAttribute("class", "packetlist-highlight");
                freqHeaderCell.innerHTML = "Frequencies";
                freqRow.appendChild(freqHeaderCell);

                var row = table.insertRow(-1);
                var freqCell = row.insertCell(0);
                freqCell.setAttribute("class", "packetlist");
                freqCell.setAttribute("style", "font-size:  1.1em;");
                var freqhtml = "<table class=\"packetlist\"><tr><th class=\"packetlistheader\">Frequency</th></tr>";
                freqhtml = freqhtml + "<tr><td class=\"packetlist\">144.390 MHz (standard)</td></tr>";


                //Add the data rows.
                for (i = 0; i < freqs.length; i++) {
                    var freq = freqs[i];
                    freqhtml = freqhtml + "<tr><td class=\"packetlist\">" + (freq.freq * 10 / 10).toFixed(3) + " MHz</td></tr>";
                }
                freqCell.innerHTML = freqhtml + "</table>";
                row.appendChild(freqCell);
            }

            // The Apply an Cancel buttons
            var buttonHeaderRow = table.insertRow(-1);
            var buttonHeaderCell = buttonHeaderRow.insertCell(-1);
            buttonHeaderCell.setAttribute("class", "packetlistheader");
            buttonHeaderCell.setAttribute("style", "text-align: center");
            buttonHeaderCell.innerHTML = "Confirmation";
            buttonHeaderRow.appendChild(buttonHeaderCell);

            var buttonRow = table.insertRow(-1);
            var buttonCell = buttonRow.insertCell(-1);
            buttonCell.setAttribute("class","packetlist");
            buttonCell.setAttribute("style", "text-align: center");
            buttonCell.innerHTML = "<form name=\"apply-syncup\" id=\"apply-syncup\">"
                + "<input class=\"submitbutton\" style=\"margin: 5px; font-size: 1.4em;\" type=\"submit\" value=\"Apply Changes\" form=\"apply-syncup\" onclick=\"applySyncup(); return false;\">"
                + " &nbsp; " 
                + "<input class=\"submitbutton\" style=\"margin: 5px; font-size: 1.4em;\" type=\"submit\" value=\"Cancel\" form=\"apply-syncup\" onclick=\"cancelSyncup(); return false;\">";
            buttonRow.appendChild(buttonCell);


            tablediv.appendChild(table);


        });
    }

    /***********
    * syncData function
    *
    * This function queries the track.eoss.org system for the flight, tracker, launchsite, and frequency configuration.
    * It will use that information to populate an HTML table along with cancel or accept buttons for the user. 
    ***********/
    function syncData() {

        $.get("syncconfiguration.php", function(data) {

            var color = (data.result > 0 ? "lightgreen" : "yellow");
            var statushtml = "<mark style=\"background-color: " + color + ";\">" + data.error + "</mark>";

            document.getElementById("syncup-status").innerHTML = statushtml;

            // Get predict files automatically
            getPredictFiles();

            // Refresh all data on the page
            refreshPage();

            setTimeout(function() {
                document.getElementById("syncup-status").innerHTML = "";
            }, 3000);

        });
    }

    /***********
    * syncPackets function
    *
    * This function queries the track.eoss.org system for the APRS packets from active flights.
    ***********/
    function syncPackets() {

        $.get("syncpackets.php", function(data) {

            var color = (data.result > 0 ? "lightgreen" : "yellow");
            var statushtml = "<mark style=\"background-color: " + color + ";\">" + 
                (data.result > 0 ? (data.packets > 0 ? "Packets added to local system: &nbsp; [ <strong> " + data.packets + " </strong> ]" : "No packets needed.") : data.error) + 
                "</mark>";

            document.getElementById("syncpackets-status").innerHTML = statushtml;

            setTimeout(function() {
                document.getElementById("syncpackets-status").innerHTML = "";
            }, 5000);

        });
    }

    /***********
    * refreshPage function
    *
    * This function will refresh all data on the setup page
    ***********/
    function refreshPage() {
        getTrackers();
        getFlights();
        getPredictions();
        getLaunchSites();
        getFrequencies();
	    getTimeZones();
	    getConfiguration();
    }
