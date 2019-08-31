<?php
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


session_start();
$pagetitle="APRS:  Data";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';
$config = readconfiguration();
?>
<script>
    // The variables for the charts.
    var chart;
    var chart2;
    var chart3;
    var chart4;
    

    function coord_distance(lat1, lon1, lat2, lon2) {
        var p = 0.017453292519943295;    // Math.PI / 180
        var c = Math.cos;
        var a = 0.5 - c((lat2 - lat1) * p)/2 + 
                c(lat1 * p) * c(lat2 * p) * 
                (1 - c((lon2 - lon1) * p))/2;

        return Math.round((12742 * Math.asin(Math.sqrt(a)))*.6213712 * 100)/100; // 2 * R; R = 6371 km
    }


    // This is the APRS-IS packet counts chart.
    function createchart (jsondata, columns) {
        chart = c3.generate({
            bindto: '#chart1',
            size: { width: 800, height: 350 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, type: 'area', json: jsondata, xs: columns, xFormat: '%Y-%m-%d %H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { format: '%H:%M:%S' }  }, y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }

    // This is the Winds Aloft chart.
    function createchart2 (jsondata, columns) {
        chart2 = c3.generate({
            bindto: '#chart2',
            size: { width: 800, height: 350 },
            data: { empty : { label: { text: "No Data Available / No Active Flights" } }, type: 'bar', json: jsondata, xs: columns, labels: { format: function (v, id, i, j) { return Math.round(v * 10) / 10; } }  },
            axis: { x: { label: { text: 'Altitude (ft)', position: 'outer-center' } }, y: { label: { text: 'Average Speed (MPH)', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }
    
    // This is the Direwolf RF Packets chart.
    function createchart3 (jsondata, columns) {
        chart3 = c3.generate({
            bindto: '#chart3',
            size: { width: 800, height: 350 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, type: 'area', json: jsondata, xs: columns, xFormat: '%Y-%m-%d %H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { format: '%H:%M:%S' }  }, y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }

    // This is the RF Packets vs. Altitude chart
    function createchart4 (jsondata, columns) {
        chart4 = c3.generate({
            bindto: '#chart4',
            size: { width: 800, height: 350 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, type: 'area', json: jsondata, xs: columns, labels: { format: function (v, id, i, j) { return Math.round(v * 10) / 10; } }  },
            axis: { x: { label: { text: 'Altitude (ft)', position: 'outer-center' } }, y: { label: { text: 'Packets Heard Direct', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }
    
    function updatechart (jsondata, columns) {
         chart.load ({ json:  jsondata, xs: columns });
    }
    
    function updatechart2 (jsondata, columns) {
         chart2.load ({ json:  jsondata, xs: columns });
    }

    function updatechart3 (jsondata, columns) {
         chart3.load ({ json:  jsondata, xs : columns});
    }

    function updatechart4 (jsondata, columns) {
         chart4.load ({ json:  jsondata, xs: columns });
    }

    function getchartdata(chartupdatefunction, url) {
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
            chartupdatefunction(jsonOutput, mycolumns);
        });
    }

    
    // This grabs the session variables
    var selectedFlight;
    var packetdata;
    var updatePacketsEvent;
    var flightlist;
    var currentflight;
    var packetcount;

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
    
    function getIndicesOf(searchStr, str, caseSensitive) {
        var searchStrLen = searchStr.length;
        if (searchStrLen == 0) {
            return [];
        }
        var startIndex = 0, index, indices = [];
        if (!caseSensitive) {
            str = str.toLowerCase();
            searchStr = searchStr.toLowerCase();
        }
        while ((index = str.indexOf(searchStr, startIndex)) > -1) {
            indices.push(index);
            startIndex = index + searchStrLen;
        }
        return indices;
    }

    function displaypackets () {
        //document.getElementById("debug4").innerHTML = "packetdata: " + JSON.parse(packetdata).length;
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


    function selectedflight() {
        var radios = document.getElementsByName("flight");
        var selectedValue;

        for(var i = 0; i < radios.length; i++) {
            if(radios[i].checked) selectedValue = radios[i].value;   
        }
        return selectedValue;
    }

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
                //html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" " + (i == 0 ? "checked" : "") + " > " + flight + "&nbsp &nbsp";
                html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" > " + flight + "&nbsp; &nbsp;";
                i += 1;
                
            }
            html = html + "</form></p>";
           
            document.getElementById("flights").innerHTML = html;
 
            //if (keys.length > 0)
            //    currentflight = jsondata[0].flightid;
            currentflight = "allpackets";
            $('input[type="radio"]').on('click change', function(e) {
                currentflight = selectedflight();
                //document.getElementById("debug3").innerHTML = "event called:  " + currentflight;
                getrecentdata();
            });

            getrecentdata();
        });
        //document.getElementById("debug").innerHTML = flightlist;
    }


    function getrecentdata() {
      var url;
 
      if (currentflight == "allpackets")
          url = "getallpackets.php";
      else
          url = "getpackets.php?flightid=" + currentflight;
      //document.getElementById("debug2").innerHTML = "getrecentdata:  " + currentflight + ", url=" + url;
      packetdata = {};
      $.get(url, function(data) { 
          packetdata = data;
          //document.getElementById("debug").innerHTML = "got packets:  " + JSON.parse(data).length;
          updatepackets(); 
      });
    }

    function updatepackets () {
        document.body.dispatchEvent(updatePacketsEvent);
    }

 
    function clearfields() {
        document.getElementById("searchfield").value = "";
        document.getElementById("searchfield2").value = "";
        document.getElementById("operation").selectedIndex = 0;
        document.getElementById("packetdata").innerHTML = "";
        document.getElementById("packetcount").innerHTML = "0";
        updatepackets();
    }


    function downloadData () {
	var data_beginning = document.getElementById("data_beginning");
	var data_ending = document.getElementById("data_ending");
	var data_type_selection = document.getElementById("data_type_selection");

        //document.getElementById("data_download_error").innerHTML = "and p.tm >= " + data_beginning.value + " and p.tm <= " + data_ending.value; 
        if (!data_beginning.checkValidity()) {
            throw data_beginning.validationMessage;
            return false;
        }

        if (!data_ending.checkValidity()) {
            throw data_ending.validationMessage;
            return false;
        }
	

	var url="downloaddata.php?datatype=" + data_type_selection.options[data_type_selection.selectedIndex].value + "&beginning=" + data_beginning.value + "&ending=" + data_ending.value;
	//document.getElementById("data_download_error").innerHTML = url;
        document.getElementById("data_beginning").value = "";
        document.getElementById("data_ending").value = "";
        initializeDataSelection();
        document.getElementById("data_type_selection").selectedIndex = 0;
        window.open(url, "_blank");

	return false;
    }


    function initializeDataSelection() {
        $.get("getflights.php", function(data) {
            var flightsJson = JSON.parse(data);

	    // blank out the list of flightids for the prediction form
            $("#data_type_selection").html("");
            $("#data_type_selection").append($("<option></option>").val("gps").html("GPS Position Log"));

            for (f in flightsJson) {
                $("#data_type_selection").append($("<option></option>").val("flight_" + flightsJson[f].flight).html("Flight:  " + flightsJson[f].flight));
            }

	});

    }

    $(document).ready(function () {
        updatePacketsEvent = new CustomEvent("updatepackets");
        document.body.addEventListener("updatepackets", displaypackets, false);
        
        var e = document.getElementById('searchfield');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('searchfield2');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('operation');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        initialize();
    	initializeDataSelection();
        getchartdata(createchart, "getpacketperformance.php");
        getchartdata(createchart2, "getspeedvsaltitude.php");
        getchartdata(createchart3, "getdirewolfperformance.php");
        getchartdata(createchart4, "getdirewolfperformance2.php");
        setInterval(function() { getrecentdata(); getchartdata(updatechart, "getpacketperformance.php"); getchartdata(updatechart2, "getspeedvsaltitude.php"); getchartdata(updatechart3, "getdirewolfperformance.php"); getchartdata(updatechart4, "getdirewolfperformance2.php"); }, 5000);
    });
    
    
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Data Downloads
            </p>
            <p class="normal-black">
                Download a variety of data sets for a selected date and time range.
            </p>
            <p class="normal-black"><span id="data_download_error"></span></p>
            <p class="normal-black">
                <form name="data_download_form" id="data_download_form">
                <table class="packetlist" style="margin-left: 30px; width:  75%;" cellpadding=0 cellspacing=0 border=0>
                <tr><th class="packetlistheader">Action</th><th class="packetlistheader">Data Selection</th><th class="packetlistheader">Beginning Date/Time</th><th class="packetlistheader">Ending Date/Time</th></tr>
		<tr><td class="packetlist">
                    <input type="submit" form="data_download_form" onclick="downloadData(); return false;" value="Download">
<!--<input type="image" form="data_download_form" src="/images/graphics/download.png" style="width: 22px; height: 22px;" onclick="downloadData(); return false;" > -->
                    </td> 
                    <td class="packetlist">
                        <select form="data_download_form" id="data_type_selection">
                        </select>
                    </td>
            <td class="packetlist"><input type="text"  form="data_download_form" name="data_beginning" id="data_beginning" placeholder="mm/dd/yyyy HH:MM:SS" 
                autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" title="enter date/time value using, mm/dd/yyyy HH:MM:SS"></td>
            <td class="packetlist"><input type="text"  form="data_download_form" name="data_ending" id="data_ending" placeholder="mm/dd/yyyy HH:MM:SS" 
                autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off" required="required" 
                pattern="\d{1,2}/\d{1,2}/\d{4}\s*([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]" title="enter date/time value using, mm/dd/yyyy HH:MM:SS"></td>
                </tr>
                </table>
                </form>
            </p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                APRS-IS Packets
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
   	        <p class="normal-italic">These packet counts show from what source a given packet was discovered (Internet vs. RF).  For example, 
            the RF packet count shows the number of packets that were heard over RF that were <strong>not</strong> already known 
            through an APRS-IS connection - it's a subtle distinction not to be confused with absolute packet counts <strong>heard</strong> over an RF channel.
            </p>
            <p class="normal-black"><div id="chart1"></div></p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                RF Packets
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
            <p class="normal-italic">This chart shows total RF packet count (every packet decoded by Dire Wolf) for each SDR/Frequency combination currently running.  
            These statistics are only available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
            </p>
            <p class="normal-black"><div id="chart3"></div></p>

            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                RF Packets vs. Altitude
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
            <p class="normal-italic">This chart shows RF packet count vs. altitude for every packet decoded by Dire Wolf that has reported an altitude and also heard 
            directly (i.e. not digipeated).  These statistics are only available when running a custom direwolf instance which is normally included in the EOSS SDR distribution.
            Altitude values are rounded to the nearest 500ft.  For example, a packet with an altitude of 7,201ft would be counted with the 7,000ft point.
            </p>
            <p class="normal-black"><div id="chart4"></div></p>
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Flight Speed vs. Altitude
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
            <p class="normal-italic">This chart displays the average speed of a flight, as reported through APRS packets, for each 5000ft altitude strata.  
            Although not perfectly correlated (flight speed vs. wind speed), it can provide a general indicator as to wind strength at higher altitude levels.  
            Altitude values for a flight are rounded to the nearest 5000ft.  For example, a speed value at an altitude of 33,000ft would be counted with the 35,000ft bar.
            </p>
            <p class="normal-black"><div id="chart2"></div></p>


            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Live APRS Packets
            </p>
            <p class="normal-black"><span id="debug"></span></p>
            <p class="normal-black"><span id="debug2"></span></p>
            <p class="normal-black"><span id="debug3"></span></p>
            <p class="normal-black"><span id="debug4"></span></p>
            <p class="normal-black">
                <span id="flights"></span>
            </p>
            <p class="normal-black">
               Search:  
               <input type="text" size="20" maxlength="128" name="searchfield" id="searchfield" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <select id="operation">
                   <option value="and" selected="selected">And</option>
                   <option value="or">Or</option>
                   <option value="not">Not</option>
               </select>
               <input type="text" size="20" maxlength="128" name="searchfield2" id="searchfield2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <button onclick="clearfields();">Clear</button>
            </p>
            <p class="normal-black">
                Number of Packets: 
                <mark><span id="packetcount"></span></mark>
            </p>
            <div class="packetdata"><pre class="packetdata"><span id="packetdata"></span></pre></div>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>
</div>

</div>
</div>
</div>
</div>
</div>
</body>
</html>
