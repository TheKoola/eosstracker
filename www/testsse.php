<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2025 Jeff Deaton (N0JD)
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

    $pagetitle="Testing SSE";
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];

    include $documentroot . '/common/header-testmap.php';
?>
<script>

    let eventsource;

    function startup() {

        let ts = new Date(Date.now());
        let err = document.getElementById("errors");
        err.innerHTML += "<pre>" + ts.toLocaleString() + ", Starting up...</pre>";

        initializeSSE();

        //console.log("SSE Started.");

    }

    function initializeSSE(url) {
        let theurl = "/sse";
        if (url)
            theurl = url;

        // if a prior eventsource exists, close it
        if (eventsource)
            eventsource.close();

        // setup sse
        setupsse(theurl);
    }


    function setupsse(url) {

        // new event source
        eventsource = new EventSource(url);

        // listen for generic messages
        eventsource.addEventListener("message", function(event) {

            // Parse the incoming json
            const jsondata = event.data;

            // Add the output to the "data" element
            let data = document.getElementById("heartbeats");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", " + jsondata + "</pre>";
        });

        // listen for flight configuration data
        eventsource.addEventListener("configuration", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("configdata");
            let ts = new Date(Date.now());
            let type = "n/a";
            if (jsondata && jsondata.type) {
                type = jsondata.type;
            }

            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + type + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for packet application telemetry
        eventsource.addEventListener("packet_statistics", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("apptelemetry");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + jsondata.name + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for db application telemetry
        eventsource.addEventListener("database_statistics", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("apptelemetry");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + jsondata.name + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for aprsis application telemetry
        eventsource.addEventListener("aprsis_statistics", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("apptelemetry");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + jsondata.name + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for aprsis application telemetry
        eventsource.addEventListener("gpsd_statistics", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("apptelemetry");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + jsondata.name + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for new positions
        eventsource.addEventListener("gpsstatus", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("positionupdates");
            let ts = new Date(Date.now());
            let lat = 0;
            let lon = 0;
            if (jsondata && jsondata.features && jsondata.features[0].geometry && jsondata.features[0].geometry.coordinates) {
                lat = jsondata.features[0].geometry.coordinates[1];
                lon = jsondata.features[0].geometry.coordinates[0];
            }
            data.innerHTML = "<pre>" + ts.toLocaleString() + ", [" + lat + ", " + lon + "]  " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for new packets
        eventsource.addEventListener("packets", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("packetupdates");
            let ts = new Date(Date.now());

            let callsign = "n/a";
            let raw = "n/a";
            if (jsondata && jsondata.features && jsondata.features[0].properties) {
                callsign = jsondata.features[0].properties.callsign;
                raw = jsondata.features[0].properties.raw;
            }

            data.innerHTML += "<pre>" + ts.toLocaleString() + ", [" + callsign + "]  " + raw + "   " + JSON.stringify(jsondata) + "</pre>";
        });

        // listen for direwolf output
        eventsource.addEventListener("direwolf", function(event) {

            // Parse the incoming json
            const jsondata = JSON.parse(event.data);

            // Add the output to the "data" element
            let data = document.getElementById("direwolf");
            let ts = new Date(Date.now());


            //data.innerHTML += "<pre>" + ts.toLocaleString() + ":  " + JSON.stringify(jsondata) + "</pre>";
            if (jsondata.type && jsondata.data) {
                let dwoutput = jsondata.data;
                let dw_type = jsondata.type;
                data.innerHTML += "<pre>" + ts.toLocaleString() + " [" + dw_type + "]:  " + dwoutput + "</pre>";
            }
            
        });
        // listen for error events
        eventsource.addEventListener("error", function(event) {
            let err = document.getElementById("errors");
            let ts = new Date(Date.now());
            err.innerHTML = "<pre>" + ts.toLocaleString() + ", Error with EventSource</pre>";

            // close the event source
            eventsource.close();

            // restart after waiting for a few seconds
            setTimeout(initializeSSE, 1000);
        });

        // listen for open events
        eventsource.addEventListener("open", function(event) {
            let err = document.getElementById("errors");
            let ts = new Date(Date.now());
            err.innerHTML += "<pre>" + ts.toLocaleString() + ", EventSource opened</pre>";
        });
    }


    // starting point for everything 
    document.addEventListener("DOMContentLoaded", startup);

    // and a restart'inator so that javascript will restart upon browser coming back into focus
    document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === 'visible') {
            // Restart SSE operations
            let err = document.getElementById("errors");
            let ts = new Date(Date.now());
            err.innerHTML += "<pre>" + ts.toLocaleString() + ", Restarting SSE operations</pre>";

            initializeSSE();
        }
    });


</script>
<hr>
<h2>Errors</h2>
<hr>
<div id="errors">
</div>
<hr>
<h2>Keep Alive Messages</h2>
<hr>
<div id="heartbeats">
</div>
<hr>
<h2>Application Telemetry</h2>
<hr>
<div id="apptelemetry">
</div>
<hr>
<h2>Position Updates</h2>
<hr>
<div id="positionupdates">
</div>
<hr>
<h2>Config Updates</h2>
<hr>
<div id="configdata">
</div>
<hr>
<h2>Direwolf output</h2>
<hr>
<div id="direwolf">
</div>
<hr>
<h2>Packet Updates</h2>
<hr>
<div id="packetupdates">
<hr>
</div>
</body>
</html>
