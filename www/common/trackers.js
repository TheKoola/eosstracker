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

/* Routines here are centric to the functionality of the tracker data entry screens on the setup pages
*
*
*/



    /***********
    * addTracker function
    *
    * This function will add the specified tracker.
    ***********/
    function addTracker() {
        var call = document.getElementById("newtrackercall").value;
        var notes = document.getElementById("newtrackernotes");
        var team = document.getElementById("newtrackerteam")
        var selectedTeam = team.options[team.selectedIndex].value;
        var newtrackercall = document.getElementById("newtrackercall");
       
        if (!newtrackercall.checkValidity()) {
            throw newtrackercall.validationMessage;
            return false;
        }

        if (!notes.checkValidity()) {
            throw notes.validationMessage;
            return false;
        }

        $.get("addtracker.php?callsign=" + call + "&notes=" + notes.value + "&team=" + selectedTeam, function(data) {
            var trackerJson = JSON.parse(data);
 
            if (trackerJson.result == 0)
                document.getElementById("newtrackererror").innerHTML = "<mark>" + trackerJson.error + "</mark>"; 
            else
                document.getElementById("newtrackererror").innerHTML = "";
            getTrackers();
            document.getElementById("newtrackercall").value = "";
            document.getElementById("newtrackernotes").value = "";
            document.getElementById("newtrackerteam").selectedIndex = 25;
        });
        return false;
    }

    /***********
    * deleteTracker function
    *
    * This function will delete the specified tracker.
    ***********/
    function deleteTracker(call) {
        var returnValue = confirm("Do you want to delete " + call + "?");         
        if (returnValue == true) { 
            $.get("deletetracker.php?callsign=" + call, function(data) {
                document.getElementById("newtrackererror").innerHTML = "";
                getTrackers();
            });
        }
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

            $("#newtrackerteam").html("");
            for (t in teamsJson) {
                teams.push(teamsJson[t].tactical);
                $("#newtrackerteam").append($("<option></option>").val(teamsJson[t].tactical).html(teamsJson[t].tactical));
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
                table.setAttribute("style", "width: auto");
 
                //The columns
                var columns = ["Team and Flight Assignment", "Callsign", "Notes", "Move to This Team"];
     
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
                        teamcell.setAttribute("style", "background-color: lightsteelblue;"); 
 
 
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
         
                    teamcell.innerHTML = "<span style=\"font-size: 1.3em;\"><strong>" + trackerJson[i].tactical + "</strong></span><br>" + html;
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
                        cellCallsign.innerHTML = "<img src=\"/images/graphics/trashcan.png\" style=\"width: 22px; height: 22px;\" onclick=\'deleteTracker(\"" + trackers[j].callsign + "\")\'> &nbsp; " + trackers[j].callsign;
    
                        var cellNotes = row.insertCell(-1);
                        cellNotes.setAttribute("class", "trackerlist");
                        cellNotes.setAttribute("style", "white-space: normal; word-wrap: break-word;"); 
                        if (i % 2)
                            cellNotes.setAttribute("style", "background-color: lightsteelblue; white-space: normal; word-wrap: break-word;"); 
                        cellNotes.innerHTML = trackers[j].notes;
    
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

