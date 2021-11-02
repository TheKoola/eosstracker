/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2021 Jeff Deaton (N6BA)
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

/********** Heads up display (HUD) for single flight telemetry on the map ***********/

L.Control.FlightHud = L.Control.extend({
    options: {
        position: 'bottomright',
    },

    displayHeader: false,
    currentFlightId: null,
    _flightdata: [],
    _flightlist: [],
    _cutoff: 180,
    _isRunning: false,
    _onTheMap: null,
    _alerting: false,
    
    // this is in ft/min.  It's the descent rate alerting threshold.  This should always be a positive value (comparisons within _updateDisplay() will adjust for 
    // descent rates being negative.
    _vrateThreshold: 10000, 

    elements: { 
        flist: null,
        flightid: null,
        lastheard: null,
        counter: null,
        beacon: null,
        ttl:  null,
        vrate:  null,
        altitude:  null,
        speed_direction: null
    },

    initialize:  function(options) {
        L.setOptions(this, options);
        //this._createDom(flightlist);
        this._flightlist = (options.flights ? options.flights : null);
        this._cutoff = (options.cutoff ? options.cutoff : 180);
        this._vrateThreshold = (options.vrateThreshold ? options.vrateThreshold : 10000);

        // set the flightid that we'll montior to the first one in the list (if it exists)
        if (this._flightlist.length > 0) {
            this.currentFlightId = this._flightlist[0].flightid;
        }
    },

    isAlerting: function() {
        return this._alerting;
    },

    setCutoff: function(c) {
        var priorCutoff = this._cutoff;

        this._cutoff = c * 1.0;


        // If we're increasing the cutoff value, the Hud is not running (i.e. the timer isn't running) AND the HUD is on the map,
        // then try and start the timer to "restart" the HUD.  startTimer will be able to determine if there is any data to display.
        if (c * 1.0 > priorCutoff && !this._isRunning && this._onTheMap) 
            this.startTimer();
    },

    getCutoff: function() {
        return this._cutoff;
    },

    setVerticalRateThreshold: function(v) {
        
        // We convert this to the absolute value to elemenate negative numbers.  The _updateDisplay() function accounts for the fact
        // that descent rates are actually negative.
        this._vrateThreshold = Math.abs(v) * 1.0;

        // If the HUD is running on the map, then update the display after we change the vrate threshold value and reset the alerting flag.
        if (this._isRunning && this._onTheMap) {

            // set the alerting flag to false
            this._alerting = false;

            // Clear the alerting CSS from the vertical rate display.  If the flight is still above the threshold, then the _updateDisplay() function will add that back.
            this.elements.vrate.classList.remove("alert");

            // update the HUD's display
            this._updateDisplay();
        }
    },

    getVerticalRateThreshold: function() {
        return this._vrateThreshold;
    },

    resetHUD:  function() {
        if (this.elements) {
            if (this.elements.flightid) this.elements.flightid.innerHTML = (this.currentFlightId ? this.currentFlightId : "None");
            if (this.elements.lastheard) this.elements.lastheard.innerHTML = "Last: n/a";
            if (this.elements.counter) this.elements.counter.innerHTML = "";
            if (this.elements.beacon) this.elements.beacon.innerHTML = "";
            if (this.elements.ttl) this.elements.ttl.innerHTML = "";
            if (this.elements.vrate) {
                this.elements.vrate.innerHTML = "No Data";

                // set the alerting flag to false
                this._alerting = false;

                // Clear the alerting CSS from the vertical rate display.  If the flight is still above the threshold, then the _updateDisplay() function will add that back.
                this.elements.vrate.classList.remove("alert");
            }
            if (this.elements.altitude) this.elements.altitude.innerHTML = "";
            if (this.elements.speed_direction) this.elements.speed_direction.innerHTML = "";
        }
    },

    purgeFlight: function(f) {
        var k;
        var idx;

        // Loop through the flightdata looking for this flight.
        for (k in this._flightdata) {
            if (typeof(this._flightdata[k].name) != "undefined") {
                if (this._flightdata[k].name == name)
                    idx = k;
            }
        } 

        // if the index of the flight we're looking for was found, then remove it 
        if (idx) {
            this._flightdata.splice(idx, 1);
        }
    },

    // Create the HTML structure for the flight HUD
    _createDom:  function() {

        var container = L.DomUtil.create('div', 'leaflet-control-flighthud');
        var table = L.DomUtil.create('table', 'leaflet-control-flighthud-table', container);

        // the top row (for the flightid heading)
        var toprow = table.insertRow(-1);
        var topRowCell = toprow.insertCell(-1);
        topRowCell.setAttribute('colspan', '3');
        var headerInnerTable = L.DomUtil.create('table', 'leaflet-control-flighthud-table', topRowCell);
        var headerInnerRow = headerInnerTable.insertRow(-1);
        var flist = headerInnerRow.insertCell(-1);
        var flightid = headerInnerRow.insertCell(-1);
        var lastheard = headerInnerRow.insertCell(-1);

        // Second row
        var row1 = table.insertRow(-1);
        var row1Cell = row1.insertCell(-1);
        row1Cell.setAttribute('colspan', '3');
        var innerTable = L.DomUtil.create('table', 'leaflet-control-flighthud-table', row1Cell);
        var innerRow = innerTable.insertRow(-1);
        var counter = innerRow.insertCell(-1);
        var speed_direction = innerRow.insertCell(-1);
        var ttl = innerRow.insertCell(-1);
        //ttl.setAttribute('colspan', '2');

        // the bottom row
        var row2 = table.insertRow(-1);
        var beacon = row2.insertCell(-1);
        var vrate = row2.insertCell(-1);
        var altitude = row2.insertCell(-1);


        // Set class attribute for each cell
        flist.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-flist');
        flightid.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-flightid');
        lastheard.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-lastheard');
        counter.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-counter');
        beacon.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-beacon');
        vrate.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-vrate');
        ttl.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-ttl');
        altitude.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-alt');
        speed_direction.setAttribute('class', 'leaflet-control-flighthud-cell leaflet-control-flighthud-cell-speed');

        // ID's for each element
        flightid.setAttribute('id', 'leaflet-control-flighthud-cell-flightid');
        lastheard.setAttribute('id', 'leaflet-control-flighthud-cell-lastheard');
        counter.setAttribute('id', 'leaflet-control-flighthud-cell-counter');
        beacon.setAttribute('id', 'leaflet-control-flighthud-cell-beacon');
        vrate.setAttribute('id', 'leaflet-control-flighthud-cell-vrate');
        ttl.setAttribute('id', 'leaflet-control-flighthud-cell-ttl');
        altitude.setAttribute('id', 'leaflet-control-flighthud-cell-alt');
        speed_direction.setAttribute('id', 'leaflet-control-flighthud-cell-speed');

        // set to blank
        flightid.innerHTML = "None";
        lastheard.innerHTML = "Last: n/a";
        counter.innerHTML = "";
        beacon.innerHTML = "";
        ttl.innerHTML = "";
        vrate.innerHTML = "No Data";
        altitude.innerHTML = "";
        speed_direction.innerHTML = "";

        // Update our object structure with these elements
        this.elements.flightid = flightid;
        this.elements.lastheard = lastheard;
        this.elements.counter = counter;
        this.elements.beacon = beacon;
        this.elements.ttl = ttl;
        this.elements.vrate = vrate;
        this.elements.altitude = altitude;
        this.elements.speed_direction = speed_direction;

        // Update the dropdown with a list of flights
        if (this._flightlist.length > 0) {
            var flist_div = L.DomUtil.create('div', '', flist );
            var form = L.DomUtil.create('form', '', flist_div);
            var select = L.DomUtil.create('select', '', form);
            select.setAttribute('id', "flighthud_flightid_selector");

            // add flightids as the selections within the dropdown
            for (f in this._flightlist) {
                var fid = this._flightlist[f].flightid;
                var o = L.DomUtil.create('option', '', select);
                o.value = fid;
                o.innerHTML = fid;

                if (fid == this.currentFlightId) {
                    o.selected = true;
                    flightid.innerHTML = fid;
                }
            }

            // bind "this" to our functions
            var updateflight = this.setFlightId.bind(this);
            var start = this.startTimer.bind(this);
            var stop = this._clearTimers.bind(this);
            var reset = this.resetHUD.bind(this);

            // The function that will be called with the flight list dropdown is changed.
            var changeFunction = function() {
                var e = document.getElementById("flighthud_flightid_selector");
                var selected_flight = e.options[e.selectedIndex].value;

                if (selected_flight) {
                    stop();
                    reset();
                    updateflight(selected_flight);
                    start();
                }
            };

            // Set the onchange function to be our changeFunction
            select.onchange = changeFunction;

        }
        else {
            flist.innerHTML = "flightlist here";
        }

        return container;
    },

    onAdd: function (map) {

        // the map
        this._onTheMap = map;

        // check if the prior flightid was saved in browser session storage and reset that
        var storage = window.sessionStorage;
        var f = storage.getItem("flightid_hud");

        // if there was a value for the flightid saved in session storage
        if (f) {
            // Verify that it's a flightid in our original list of flights
            fid = this.getFlight(f);

            // If this was a valid flight, then set the flightid to this flight
            if (fid) 
                this.setFlightId(fid.flightid);
        }

        // Create the HTML
        this._container = this._createDom();

        // Display flight telemetry
        this.startTimer();

        return this._container;
    },

    /************
     * setFlightId
     *
     * Used to set the flightid that the HUD will display
     */
    setFlightId:  function(f) {
        // update our variable that tracks which flightid we monitor
        this.currentFlightId = f;

        // change the title on the HUD
        if (this.elements.flightid)
            this.elements.flightid.innerHTML = f;

        // set this in session storage so when the user reloads the page or adds/removes the HUD from the map it is restored
        var storage = window.sessionStorage;
        storage.setItem("flightid_hud", f);
    },


    // clear all timers
    _clearTimers: function() {
        var i;

        for (i in this._flightdata) {
            if (this._flightdata[i].timer) {
                clearInterval(this._flightdata[i].timer);
                this._flightdata[i].timer = null;
            }
        }
        this._isRunning = false;
    },


    /************
     * update
     *
     * This function will update the HUD's data stucture with new data for a given flight's telemetry data. 
     *
     * Feature is a GeoJSON object.
     ************/
    update:  function(feature) {

        var fid;

        // If nothing was provided then just return
        if (!feature) 
            return;

        if (typeof(feature.properties.flightid) != "undefined") {
            // Find the flightid for this feature and check if it's in the list of rows in this HUD
            fid = this.getFlightData(feature.properties.flightid);

            // We couldn't find an entry in the HUD for this flight so we create a new one and add it to the list.
            if (!fid) {

                fid = { 
                    name: feature.properties.flightid,
                    lastupdate: new Date("1970-01-01T00:00:00"),
                    lastpacket: new Date("1970-01-01T00:00:00"),
                    timer: null,
                    count: 0,
                    feature: feature,
                    callsigns: []

                };

                // check this feature to make sure the callsign and timestamp exist then build an object for the callsign + timestamp
                if (this.checkFeature(feature)) {
                    var callsign = { callsign: feature.properties.callsign, lastpacket: this.parseDate(feature.properties.time)};

                    // Add this callsign/timestamp to the callsigns array within this fid.
                    fid.callsigns.push(callsign);
                }

                this._flightdata.push(fid);
            }
            // Otherwise we update the telemetry for this flight IF the data is newer
            else {
                if (this.checkFeature(feature)) {
                    // Get the last timestamp for this flightid
                    var lastpacket = fid.lastpacket;

                    // The time stamp for "this" incoming data
                    var thispacket = this.parseDate(feature.properties.time);

                    // The callsign
                    var call = feature.properties.callsign;

                    // If this is newer info that what's currently saved for this flight, then we update the data
                    if (thispacket > lastpacket) {
                        fid.lastpacket = thispacket;
                        fid.feature = feature;
                    }

                    // Now loop through the existing callsigns for this flight until we find this one and update it's timestamp (assuming it's a later timestamp)
                    var callsigns = fid.callsigns;
                    var foundOne = false;
                    callsigns.forEach(function(c) {
                        if (c.callsign == call) {
                            if (thispacket > c.lastpacket) {
                                c.lastpacket = thispacket;
                            }
                            foundOne = true;
                        }
                    });

                    // If this is the first time seeing this callsign, then added to the flight data.
                    if (!foundOne) {
                        var callsign = { callsign: feature.properties.callsign, lastpacket: thispacket};

                        // Add this callsign/timestamp to the callsigns array within this fid.
                        fid.callsigns.push(callsign);
                    }
                }
            }

        }
        
        // Without a flightid we cannot proceed
        else {
            return;
        }
    },

    checkFeature:  function(feature) {

        var check = false;

        if (feature) {
            if (typeof(feature.properties.altitude)    != "undefined" && 
                typeof(feature.geometry.coordinates)   != "undefined" &&
                typeof(feature.properties.bearing)     != "undefined" &&
                typeof(feature.properties.speed)       != "undefined" &&
                typeof(feature.properties.verticalrate)!= "undefined" &&
                typeof(feature.properties.flightid)    != "undefined" &&
                typeof(feature.properties.callsign)    != "undefined" &&
                typeof(feature.properties.time)        != "undefined" &&
                typeof(feature.properties.source)      != "undefined" &&
                typeof(feature.geometry.coordinates)   != "undefined" &&
                typeof(feature.properties.myheading)   != "undefined" &&
                typeof(feature.properties.rel_angle)   != "undefined" &&
                typeof(feature.properties.rel_bearing) != "undefined" &&
                typeof(feature.properties.ttl)         != "undefined" &&
                typeof(feature.properties.rel_distance)!= "undefined") {
                check = true;
            }
        }

        return check;
    },

    createCountString: function(count) {
        var count_string = "&nbsp;";

        if (count < 60)
            count_string = count + "s";
        else if (count >= 60 && count < 3600) {
            var mins = Math.floor(count / 60);
            var secs = count - (mins * 60);
            count_string = mins + "m " + secs + "s";
        }
        else if (count >= 3600) {
            var hrs = Math.floor(count / 3600);
            var mins = Math.floor((count - hrs * 3600) / 60);
            var secs = count - hrs * 3600 - mins * 60;
            count_string = hrs + "hr " + mins + "m " + secs + "s";
        }

        if (count >= 40 && count < 120) 
            count_string = "<mark style=\"background-color: #ffff80;\"> &nbsp; " + count_string + " &nbsp; </mark>";
        else if (count >= 120)
            count_string = "<mark style=\"background-color: #e26969;\"> &nbsp; " + count_string + " &nbsp; </mark>";

        return count_string;
    },

    readyToShow: function() {
        var fid = null;

        // Make sure we're set to track a specific flight
        if (this.currentFlightId) {

            // Find the flight telemetry for the currentFlightId and check if it's in the list this HUD is tracking
            fid = this.getFlightData(this.currentFlightId);
        }

        return fid;
    },

    /************
     * show
     *
     * This will display the current flight telemetry for the current flight 
     *
     */
    startTimer:  function() {

        // get the feature that we're suppose to update the HUD with
        var fid = this.readyToShow();
        var feature = (fid ? fid.feature : null);

        // Only display the HUD if the incoming flightid matches what we're currently set to monitor
        if (feature) {

            // Make sure we've got valid values for this packet before we try to update the HUD
            if (this.checkFeature(feature)) {

                // Get the last timestamp and counters for the this flightid
                var lastpacket = fid.lastpacket;
                var count = fid.count;

                // The time stamp for "this" packet
                var thispacket = this.parseDate(feature.properties.time);

                // How long has it been in wall clock seconds since the packet occured?
                var timeDelta =  Math.floor((new Date() - thispacket) / 1000);

                // Clear timers
                this._clearTimers();

                // The number of seconds elapsed since we heard this packet
                fid.count = timeDelta; 

                // Reference to the HTML elements
                var elems = this.elements;

                // check if the time delta is already longer than our cutoff.  If so, we just return as we don't want to start a timer.
                if (timeDelta / 60 > this._cutoff) {
                    return;
                }

                // bind 'this' so that we can call the createCountString function from within the 'timerFunction' below.
                var getstring = this.createCountString.bind(this);
                var telem = this._updateDisplay.bind(this);
                var pd = this.parseDate.bind(this);
                var cutoff = this.getCutoff.bind(this);;
                var start = this.startTimer.bind(this);
                var stop = this._clearTimers.bind(this);
                var reset = this.resetHUD.bind(this);
                var purge = this.purgeFlight.bind(this);

                // use this function to update the time elapsed counter
                var timerFunction = function() {
                    var f = fid;

                    var lastpacket = f.lastpacket;
                    var lastupdate = f.lastupdate;

                    // How long has it been in wall clock seconds since the packet occured?
                    var td = Math.floor((new Date() - lastpacket) / 1000);

                    if (lastpacket > lastupdate) {
                        f.lastupdate = new Date();
                        f.count = td;
                        telem();
                    }
                    else {
                        // Update the counter field with this new value
                        f.count = f.count + 1;
                    }

                    // check if we're over the cutoff time period (i.e. too long)
                    c = cutoff();
                    if (f.count / 60 > c) {
                        stop();
                        reset();
                    }
                    else  {
                        // Update the counter HTML element
                        elems.counter.innerHTML = getstring(f.count);
                    }
                };

                // Update the elapsed time field
                this.elements.counter.innerHTML = this.createCountString(fid.count);

                // Update the HUD display with current telemetry
                this._updateDisplay();

                // Now set the timer to run every second to update the elapsed timer field on the HUD
                var x = setInterval(timerFunction, 1000);
                fid.timer = x;
                this._isRunning = true;
            }
        }
    },

    _updateDisplay:  function() {

        // get the feature that we're suppose to update the HUD with
        var fid = this.readyToShow();
        var feature = (fid ? fid.feature : null);

        // Only display the HUD if the incoming flightid matches what we're currently set to monitor
        if (feature) {

            // Make sure we've got valid values for this packet before we try to update the HUD
            if (this.checkFeature(feature)) {

                // The flightid
                var flightid = feature.properties.flightid;

                // The callsign
                var callsign = feature.properties.callsign;

                // Telemetry
                var myheading = feature.properties.myheading * 1.0;
                var rel_bearing = feature.properties.rel_bearing * 1.0;
                var bearing = feature.properties.bearing * 1.0;
                var angle = feature.properties.rel_angle * 1.0;
                var distance = feature.properties.rel_distance * 1.0;
                var lat = feature.geometry.coordinates[1] * 1.0;
                var lon = feature.geometry.coordinates[0] * 1.0;
                var alt = feature.properties.altitude * 1.0;
                var spd = feature.properties.speed * 1.0;
                var ttl = feature.properties.ttl * 1.0;
                var vrate = feature.properties.verticalrate * 1.0;

                // The telemetry values
                var thealtitude = Math.round(alt);
                var theheading = Math.round(bearing);
                var thespeed = Math.round(spd);
                var thevertrate = Math.round(vrate);

                var thousandsdigit = parseInt(alt / 1000);
                var hundredsdigit = parseInt((alt - thousandsdigit * 1000) / 100);

                var textDirection = "";
                if (theheading >= 0 && theheading < 22.5)
                    textDirection = "N";
                else if (theheading >= 22.5 && theheading < 67.5)
                    textDirection = "NE";
                else if (theheading >= 67.5 && theheading < 112.5)
                    textDirection = "E";
                else if (theheading >= 112.5 && theheading < 157.5)
                    textDirection = "SE";
                else if (theheading >= 157.5 && theheading < 202.5)
                    textDirection = "S";
                else if (theheading >= 202.5 && theheading < 247.5)
                    textDirection = "SW";
                else if (theheading >= 247.5 && theheading < 292.5)
                    textDirection = "W";
                else if (theheading >= 292.5 && theheading < 337.5)
                    textDirection = "NW";
                else if (theheading >= 337.5 && theheading <= 360)
                    textDirection = "N";


                // Figure out how many callsigns from this flight are reporting.  We try to compare that to the _flightList data
                var f;
                var beacon_count_string = "";
                f = this.getFlight(flightid);
                if (f) {
                    var total_beacons = f.callsigns.length;
                    var normal_count = 0;
                    var yellow_count = 0;
                    var red_count = 0;
                    var html_string = ""

                    // now loop through each beacon for this flight determining how long it's been since it last reported
                    var i = 0;

                    fid.callsigns.forEach(function(c) {

                        // How long has it been in wall clock seconds since the packet occured for this callsign?
                        var delta =  Math.floor((new Date() - c.lastpacket) / 1000);

                        // compare how long it's been to the 120s and 60s thresholds for red and yellow status respectively
                        if (delta > 120)
                            red_count += 1;
                        else if (delta > 60)
                            yellow_count += 1;
                        else
                            normal_count += 1;
                    });

                    if (red_count > 0)
                        html_class = "notokay";
                    else if (yellow_count > 0)
                        html_class = "marginal";
                    else
                        html_class = "okay";

                    // the HTML string to display " [ number of beacons reporting normal / total number of beacons on the flight ]".
                    // If any beacon on the flight has gone longer than 120s since we heard a packet, then we mark the entire string "red" (i.e. notokay).
                    // If there are any beacons that have reported in greater than 60s but less than 120s then display that as "yellow" (i.e. marginal).
                    // Else, if everything is normal then just display that as "green" (i.e. okay).
                    beacon_count_string = " &nbsp; <mark class=\"" + html_class + "\">[ " + normal_count + " / " + total_beacons + " ]</mark>";
                }

                // The time string.  This is the reception time not the time when the packet was transmitted.
                var timeString = "";
                if (feature.properties.time) {
                    var t = parseDate(feature.properties.time);
                    timeString = "<font class=\"leaflet-control-flighthud-cell-time\">" + t.toLocaleTimeString() + "</font>";
                }

                this.elements.flightid.innerHTML = flightid + beacon_count_string;
                this.elements.lastheard.innerHTML = (timeString ? "Last: " + timeString : "") ;
                this.elements.vrate.innerHTML = thevertrate.toLocaleString() + "<br>ft/min";

                // If the vertical descent rate is greater than the alerting threshold (aka it's falling like a brick), then change the background on the vrate cell to flash as an alert.
                // ..note, the flashing is never removed once a descent rate greater than the threshold is observed.
                if (thevertrate <  - this.getVerticalRateThreshold()) {

                    // Flash the background to alert the user to a fast falling flight
                    this.elements.vrate.classList.add("alert");

                    // Set the alerting flag.
                    this._alerting = true;
                }

                var lat = feature.geometry.coordinates[1];
                var lon = feature.geometry.coordinates[0];
                var thedistance;
                if (feature.properties.rel_distance)
                    thedistance = Math.round(distance * 10) / 10 + " mi, ";
                else if (currentLocation) 
                    thedistance = Math.round(distance(currentLocation.lat, currentLocation.lng, lat, lon) * 10) / 10 + " mi, ";
                else
                    thedistance = "";

                var callsignHTML = callsign;

                if (lat && lon && this._onTheMap) {
                    callsignHTML = "<a href=\"#\" class=\"callsignlink\" onclick=\"dispatchPanToEvent('" + lat + "', '" + lon + "');\">" +  callsign + "</a>"
                }


                // Only try to display an "icon" if there was a symbol provided
                var filename = null;
                if (typeof(feature.properties.symbol) != "undefined") {

                    // Determine the file path to the PNG icon that represents this symbol
                    if (feature.properties.symbol.startsWith('\\') || feature.properties.symbol.startsWith('\/') || feature.properties.symbol.startsWith('1x')) 
                        filename = "/images/aprs/" + symbols[feature.properties.symbol].tocall + ".png";                
                    else 
                        filename = "/images/aprs/" + feature.properties.symbol.charAt(0) + "-" + symbols["\\" + feature.properties.symbol.charAt(1)].tocall + ".png";
                    this.elements.beacon.innerHTML = "<img src=\"" + filename + "\" class=\"leaflet-control-flighthud-cell-image\">" + callsignHTML;
                }
                else {
                    this.elements.beacon.innerHTML = callsignHTML;
                }

                var statushtml = "";
                var ascending   = "<mark style=\"background-color: #00a933;\"><font style=\"font-variant: small-caps; color: white;\"> &nbsp; Ascending &nbsp; </font></mark>";
                var descending  = "<mark style=\"background-color: #ff0000;\"><font style=\"font-variant: small-caps; color: white;\"> &nbsp; Descending &nbsp; </font></mark>";
                var ontheground = "<mark style=\"background-color: #bfbfbf;\"><font style=\"font-variant: small-caps; color: black;\"> &nbsp; On The Ground &nbsp; </font></mark>"; 
                var los         = "<mark style=\"background-color: black;\"><font style=\"text-transform: uppercase;  color: white;\"> &nbsp; LOS &nbsp; </font></mark>"; 
                if (thevertrate > 300)  {
                    this.elements.altitude.innerHTML = "<img src=\"/images/graphics/up-green-arrow.png\" class=\"leaflet-control-flighthud-cell-image\"><font style=\"font-size: 1.3em; color: black; font-weight: bold;\">" + thousandsdigit + "</font><font style=\"color: blue; font-size: .5em;\">" + hundredsdigit + "</font> <font style=\"font-size: .5em;\"> kft</font>";
                    statushtml = ascending;
                    //statushtml = "<mark style=\"background-color: #00a933;\"><font style=\"font-variant: small-caps; color: white;\"> &nbsp; Ascending @ " + thevertrate.toLocaleString() + " ft/min </font></mark>";
                    this.elements.speed_direction.innerHTML = textDirection + " (" + theheading + "&deg;) at " + thespeed + " mph";
                }
                else if (thevertrate < -300) {
                    this.elements.altitude.innerHTML = "<img src=\"/images/graphics/down-red-arrow.png\" class=\"cleaflet-control-flighthud-cell-image\"><font style=\"font-size: 1.3em; color: black; font-weight: bold;\">" + thousandsdigit + "</font><font style=\"color: blue; font-size: .5em;\">" + hundredsdigit + "</font> kft";
                    statushtml = descending;
                    //statushtml = "<mark style=\"background-color: #ff0000;\"><font style=\"font-variant: small-caps; color: white;\"> &nbsp; Descending @ " + thevertrate.toLocaleString() + " ft/min </font></mark>";
                    this.elements.speed_direction.innerHTML = textDirection + " (" + theheading + "&deg;) at " + thespeed + " mph";
                }
                else {
                    this.elements.altitude.innerHTML = "<img src=\"/images/graphics/horiz-gray-bar.png\" class=\"leaflet-control-flighthud-cell-image\"><font style=\"font-size: 1.3em; color: black; font-weight: bold;\">" + thousandsdigit + "</font><font style=\"color: blue; font-size: .5em;\">" + hundredsdigit + "</font> kft";
                    statushtml = ontheground; 
                    this.elements.speed_direction.innerHTML = textDirection + " (" + theheading + "&deg;) at " + thespeed + " mph";
                }

                // Did we lose contact with the flight?
                var now = new Date();
                var last = (feature.properties.time ? parseDate(feature.properties.time) : fid.lastpacket);
                var delta = now - last;
                delta /= 1000;

                // If it's been less than 5mins since the last packet then we update status appropriately
                if (delta < 300) {
                    if (ttl > 0)
                        this.elements.ttl.innerHTML = (ttl == 1 ? "TTL: &nbsp; " + ttl + " min" : "TTL: &nbsp; " + ttl + " mins");
                    else
                        this.elements.ttl.innerHTML = statushtml;
                }

                // If it's been longer than 5mins but less than 20mins...
                else if (delta >= 300 && delta < 1200) {
                    if (ttl > 0 && delta/60.0 > ttl) 
                        this.elements.ttl.innerHTML = ontheground;
                    else 
                        this.elements.ttl.innerHTML = statushtml;
                }

                // If it's been longer than 20mins, then we're assuming LOS (loss of signal)
                else if (delta >= 1200) 
                    this.elements.ttl.innerHTML = los;


                // Flash the background to red, then back to white.
                var container = this._container;
                container.classList.add("redToBlack");
                setTimeout(function() {
                    container.classList.remove("redToBlack");
                }, 5000);
            }
        }
        else {
            if (this.currentFlightId) {
                this.elements.flightid.innerHTML = this.currentFlightId;
                this.elements.beacon.innerHTML = "No Data Available";
                this.elements.beacon.setAttribute("style", "font-size: 2em; text-align: center;");
            }
        }
    },

    onRemove:  function(m) {
        // clear the on the map variable
        this._onTheMap = null;

        this._clearTimers();
    },

    onMap:  function() {
        return (this._onTheMap ? true : false);
    },

    getFlightData: function(name) {
        var k;

        for (k in this._flightdata) {
            if (typeof(this._flightdata[k].name) != "undefined") {
                if (this._flightdata[k].name == name)
                    return this._flightdata[k];
            }
        } 
        return null;
    },

    getFlight: function(name) {
        var k;
        var rows = this._flightlist;

        for (k in rows) {
            if (rows[k].flightid == name)
                return rows[k];
        } 
        return null;
    },


    /************
     * parseDate
     *
     * This function will parse a date string from PostgeSQL and return a new Date object
     ************/
    parseDate:  function(d) {

        var thisdate = null;

        if (typeof(d) != "undefined") {

            // Only process this if the string provided is of proper length
            if (d.length > 18) {

                // Split the datetime on the space.  ex.  2020-05-14 18:57:29.8292
                var datetime = d.split(' ');

                if (datetime.length == 2) {

                    // Split out the date portion
                    var dateparts = datetime[0].split('-');

                    if (dateparts.length == 3) {
                        var year = dateparts[0];
                        var month = dateparts[1] - 1;
                        var day = dateparts[2];

                        // Split out the time portion
                        var timeparts = datetime[1].split(':');

                        if (timeparts.length == 3) {
                            var hour = timeparts[0];
                            var minute = timeparts[1];
                            var second = timeparts[2];
                            var millisecond = 0;

                            // Account for milliseconds if the time value includes it.
                            if (timeparts[2].indexOf(".") !== -1) {
                                millisecond = timeparts[2].split('.')[1];
                                second = timeparts[2].split('.')[0];
                            }

                            // new Date object
                            thisdate = new Date(year, month, day, hour, minute, second, millisecond);
                        }
                    }
                }
            }
        }
        return thisdate;
    }

});


L.Map.mergeOptions({
    flighthud: false
});

L.Map.addInitHook(function () {
    if (this.options.flighthud) {
        this.flighthud = new L.Control.FlightHud();
        this.addControl(this.flighthud);
    }
});

L.control.flighthud = function (options) {
    return new L.Control.FlightHud(options);
};
