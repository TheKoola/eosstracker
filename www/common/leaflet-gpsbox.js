/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020 Jeff Deaton (N6BA)
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

/********** GPS status box on the map ***********/

L.Control.Gpsbox = L.Control.extend({
    options: {
        position: 'topright'
    },

    onAdd: function (map) {
        this._container = L.DomUtil.create('div', 'leaflet-control-gpsbox');
        return this._container;
    },

    show: function (message) {
        var elem = this._container;
        elem.innerHTML = message;
        elem.style.display = 'block';
    }
});

L.Map.mergeOptions({
    gpsbox: false
});

L.Map.addInitHook(function () {
    if (this.options.gpsbox) {
        this.gpsbox = new L.Control.Gpsbox();
        this.addControl(this.gpsbox);
    }
});

L.control.gpsbox = function (options) {
    return new L.Control.Gpsbox(options);
};
