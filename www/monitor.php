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

$pagetitle="APRS: Monitor";
session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';
$config = readconfiguration();

?>
<script>
    // This grabs the session variables
    var chart;

    function coord_distance(lat1, lon1, lat2, lon2) {
        var p = 0.017453292519943295;    // Math.PI / 180
        var c = Math.cos;
        var a = 0.5 - c((lat2 - lat1) * p)/2 + 
                c(lat1 * p) * c(lat2 * p) * 
                (1 - c((lon2 - lon1) * p))/2;

        return Math.round((12742 * Math.asin(Math.sqrt(a)))*.6213712 * 100)/100; // 2 * R; R = 6371 km
    }


    function createchart (jsondata, columns) {
        chart = c3.generate({
            bindto: '#chart1',
            size: { width: 800, height: 350 },
            data: { empty : { label: { text: "No Data Available / Processes Not Running" } }, type: 'area', json: jsondata, xs: columns, xFormat: '%H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { format: '%H:%M:%S' }  }, y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }
    

    function updatechart (jsondata, columns) {
         chart.load ({ json:  jsondata });
    }
    

    function getchartdata(chartupdatefunction) {
        $.get("getpacketperformance.php", function(data) {
            var jsonOutput = JSON.parse(data);
            var mycolumns = {};
            var i = 0;
            var thekeys = Object.keys(jsonOutput);
            for (i = 0; i < thekeys.length; i++) {
                if (! thekeys[i].startsWith("tm-")) {
                    mycolumns[thekeys[i]] = "tm-" + thekeys[i];
                }
            }
            //document.getElementById("debug1").innerHTML = JSON.stringify(mycolumns, null, 4);
            //document.getElementById("debug2").innerHTML = flightlist;
            chartupdatefunction(jsonOutput, mycolumns);
        });
    }

    $(document).ready(function () {
        getchartdata(createchart);
        setInterval(function() { getchartdata(updatechart); }, 10000);
    });

    
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Packet Performance 
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $config["lookbackperiod"] / 60, (  ($config["lookbackperiod"] / 60.0) - floor($config["lookbackperiod"] / 60) ) * 60) ; 
?>
            </p>
	    <p class="normal-italic">These packet counts show from what source a given packet was discovered (Internet vs. RF).  For example, 
            the RF packet count series shows the number of packets that were heard over RF that were <strong>not</strong> already known 
            through an APRS-IS connection.
            </p>
            <p class="normal-black"><div id="chart1"></div></p>
            <p class="normal-black"><div id="debug1"></div></p>
            <p class="normal-black"><div id="debug2"></div></p>
            <p class="normal-black"><div id="debug3"></div></p>
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
