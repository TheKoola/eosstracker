<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2023 Jeff Deaton (N6BA)
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

    function startup() {


        // backend url
        let backendurl = "ssestream.php";

        // Create new SSE source
        let packetsource = new EventSource(backendurl);

        console.log("SSE Started.");

        // listen for generic messages
        packetsource.addEventListener("message", function(event) {

            // Parse the incoming json
            const jsondata = event.data;

            // Add the output to the "data" element
            let data = document.getElementById("heartbeats");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", " + jsondata + "</pre>";
        });


        // listen for new positions
        packetsource.addEventListener("new_position", function(event) {

            // Parse the incoming json
            const jsondata = event.data;
            //console.log("new_position: ", event);

            // Add the output to the "data" element
            let data = document.getElementById("positionupdates");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", " + jsondata + "</pre>";
        });

        // listen for new packets
        packetsource.addEventListener("new_packet", function(event) {

            // Parse the incoming json
            const jsondata = event.data;

            // Add the output to the "data" element
            let data = document.getElementById("packetupdates");
            let ts = new Date(Date.now());
            data.innerHTML += "<pre>" + ts.toLocaleString() + ", " + jsondata + "</pre>";
        });

    }



    // starting point for everything 
    document.addEventListener("DOMContentLoaded", startup);
</script>
<hr>
<h2>Keep Alive Messages</h2>
<hr>
<div id="heartbeats">
</div>
<hr>
<h2>Position Updates</h2>
<hr>
<div id="positionupdates">
</div>
<hr>
<h2>Packet Updates</h2>
<hr>
<div id="packetupdates">
<hr>
</div>
</body>
</html>
