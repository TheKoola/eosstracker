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

/********** Generic status box on the map ***********/

L.Control.Box = L.Control.extend({
    options: {
        position: 'topleft',
    },
    handler: null,
    _innerbox: null,
    _basebox: null,
    _onTheMap: null,
    _lastValue: "0<font style=\"font-size: .2em;\"> mph</font>",

    initialize:  function(options) {
        L.setOptions(this, options);
        this.handler = (options.callback ? options.callback : null);
    },

    onAdd: function (map) {
        var elem = L.DomUtil.create('div', 'leaflet-control-box');
        var textbox = L.DomUtil.create('div', 'leaflet-control-box-textbox', elem);
        var self = this;

        // the map
        this._onTheMap = map;

        textbox.addEventListener('click', function(evt) {
            var f = self.handler;
             
            // If there was a handler, then we toggle the display and call the supplied function.
            if (f) {
                var ret = self._toggle();
                f(ret);
            }
        });

        this._innerbox = textbox;
        this._basebox = elem;

        textbox.innerHTML = this._lastValue;

        return elem;
    },

    show: function (message) {
        var elem = this._innerbox;

        if (elem) 
            elem.innerHTML = message; 

        this._lastValue = message;
    },

    onRemove:  function(m) {

        // Call the callback function with "false"
        if (this.handler)
            this.handler(false);

        // clear the variables
        this._onTheMap = null;
        this._innerbox = null;
        this._basebox = null;

    },

    onMap:  function() {
        return (this._onTheMap ? true : false);
    },

    _toggle: function() {
        // Toggle CSS to the base element so that it glows
        var b = this._basebox;

        if (b)
            return b.classList.toggle("leaflet-control-box-glow");
        else
            return false;
    }
});

L.Map.mergeOptions({
    box: false
});

L.Map.addInitHook(function () {
    if (this.options.box) {
        this.box = new L.Control.Box();
        this.addControl(this.box);
    }
});

L.control.box = function (options) {
    return new L.Control.Box(options);
};
