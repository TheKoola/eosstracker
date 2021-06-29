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

/********** Heads up display (HUD) status box on the map ***********/

L.Control.Hud = L.Control.extend({
    options: {
        position: 'topright',
        displayHeader: false
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div', 'leaflet-control-hud');
        this._table = L.DomUtil.create('table', 'leaflet-control-hud-table', this._container);
        this._rows = [];

        if (this.options.displayHeader) {
            // Create the header row
            var headerRow = this._table.insertRow(-1);
            var beacon = headerRow.insertCell(-1);
            var flightid = headerRow.insertCell(-1);
            var altitude = headerRow.insertCell(-1);
            var speed = headerRow.insertCell(-1);
            var vrate = headerRow.insertCell(-1);
            var lastpath = headerRow.insertCell(-1);
            var last = headerRow.insertCell(-1);
            var status = headerRow.insertCell(-1);

            var headercells = [ beacon, flightid, altitude, speed, vrate, lastpath, last, status ];
            var k;

            for (k in headercells) {
                headercells[k].setAttribute('class', 'leaflet-control-hud-header');
            }
            beacon.innerHTML = "Beacon";
            flightid.innerHTML = "Flight ID";
            altitude.innerHTML = "Altitude";
            speed.innerHTML = "Speed (mph)";
            vrate.innerHTML = "V. Rate (ft/min)";
            lastpath.innerHTML = "Last Path";
            last.innerHTML = "Last Packet";
            status.innerHTML = "Status";
        }

        return this._container;
    },

    addRow: function(name) {
        var tableRow = this._table.insertRow(-1);
        tableRow.setAttribute('id', name + "_hud");

        var beaconCell = tableRow.insertCell(-1);
        var flightidCell = tableRow.insertCell(-1);
        var altitudeCell = tableRow.insertCell(-1);
        var speedCell = tableRow.insertCell(-1);
        var vrateCell = tableRow.insertCell(-1);
        var lastpathCell = tableRow.insertCell(-1);
        var lastCell = tableRow.insertCell(-1);
        var statusCell = tableRow.insertCell(-1);

        var cells = [ beaconCell, flightidCell, altitudeCell, speedCell, vrateCell, lastpathCell, lastCell, statusCell ];
        var k;

        for (k in cells) {
            cells[k].setAttribute('class', 'leaflet-control-hud-cell');
        }

        /* reset the last packet time */
        $("#" + name + "_hud").data("lastpacket", new Date("1970-01-01T00:00:00"));

        var beaconSpan = document.createElement('span');
        beaconCell.appendChild(beaconSpan);
        var flightidSpan = document.createElement('span');
        flightidCell.appendChild(flightidSpan);
        var altitudeSpan = document.createElement('span');
        altitudeCell.appendChild(altitudeSpan);
        var speedSpan = document.createElement('span');
        speedCell.appendChild(speedSpan);
        var vrateSpan = document.createElement('span');
        vrateCell.appendChild(vrateSpan);
        var lastpathSpan = document.createElement('span');
        lastpathCell.appendChild(lastpathSpan);
        var lastSpan = document.createElement('span');
        lastCell.appendChild(lastSpan);
        var statusSpan = document.createElement('span');
        statusCell.appendChild(statusSpan);

        var thisRow = {
            "beacon"   : beaconSpan,
            "flightid" : flightidSpan,
            "altitude" : altitudeSpan,
            "speed"    : speedSpan,
            "vrate"    : vrateSpan,
            "lastpath" : lastpathSpan,
            "last"     : lastSpan,
            "status"   : statusSpan
        };

        this._rows.push({ "name" : name, "row" : thisRow});

        return thisRow;

    },

    getRow: function(name) {
        var k;
        var rows = this._rows;

        for (k in rows) {
            if (rows[k].name == name)
                return rows[k].row;
        }
        
        return null;
    }
});

L.Map.mergeOptions({
    hud: false
});

L.Map.addInitHook(function () {
    if (this.options.hud) {
        this.hud = new L.Control.Hud();
        this.addControl(this.hud);
    }
});

L.control.hud = function (options) {
    return new L.Control.Hud(options);
};
