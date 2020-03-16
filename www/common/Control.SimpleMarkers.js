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
* This is a version of the SimpleMarkers plugin for Leaflet JS that has been modified for use with the EOSS Tracker app.
*
######## SimpleMarkers licensing statement #######
Copyright (c) 2014, Jared Dominguez All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 - Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 - Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
##################################################
*
*
*
*
*/

/* Function to copy text from an element to the clipboard */
  function copyToClipboard (elem) {
      var range = document.createRange();
      var e = document.getElementById(elem);
      
      range.selectNode(e);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand("Copy");
      window.getSelection().removeAllRanges();
      e.setAttribute("class", "blueToWhite");
  }

/* SimpleMarkers class */
  L.Control.SimpleMarkers = L.Control.extend({
    options: {
      //position: 'topleft',
      position: 'topright',
      add_control: true,
      delete_control: true,
      allow_popup: true,
      marker_icon: undefined,
      marker_draggable: false,
      add_marker_callback: undefined,
      before_add_marker_callback: undefined,
      after_add_marker_callback: undefined
    },
    map: undefined,
    markerList: [],
    addModeListener: undefined,
    inDelMode: false,

    onAdd: function(map) {
      "use strict";
      this.map = map;
      var marker_container = L.DomUtil.create('div', 'marker_controls');

      if (this.options.add_control) {
        let that = this
        //this.options.marker_icon.forEach(function(d) {
          //var add_marker_div = L.DomUtil.create('div', d.class, marker_container);
          var add_marker_div = L.DomUtil.create('div', "add_marker_control", marker_container);
          add_marker_div.title = 'Add a marker';
          L.DomEvent.addListener(add_marker_div, 'click', L.DomEvent.stopPropagation)
            .addListener(add_marker_div, 'click', L.DomEvent.preventDefault)
            .addListener(add_marker_div, 'click', that.enterAddMarkerMode.bind(that));
        //})
      }
      if (this.options.delete_control) {
        var del_marker_div = L.DomUtil.create('div', 'del_marker_control', marker_container);
        del_marker_div.title = 'Delete a marker';
        L.DomEvent.addListener(del_marker_div, 'click', L.DomEvent.stopPropagation)
          .addListener(del_marker_div, 'click', L.DomEvent.preventDefault)
          .addListener(del_marker_div, 'click', this.enterDelMarkerMode.bind(this));
      }

      return marker_container;
    },

    enterAddMarkerMode: function() {
      "use strict";

      if (typeof(this.addModeListener) !== "undefined") {
          this.map._container.style.cursor = 'auto';
          this.map.removeEventListener('click', this.addModeListener);
	  this.addModeListener = undefined;
	  document.getElementsByClassName("add_marker_control")[0].style["background-color"] = "#ffffff";
	  return false;
      }

      document.getElementsByClassName("add_marker_control")[0].style["background-color"] = "dodgerblue";
      //if (this.markerList !== '') {
      //if (this.markerList.length > 0) {
        for (var marker = 0; marker < this.markerList.length; marker++) {
          if (typeof(this.markerList[marker].marker) !== 'undefined' && typeof(this.markerList[marker].dlistener) !== "undefined") {
            this.markerList[marker].marker.removeEventListener('click', this.markerList[marker].dlistener);
            delete this.markerList[marker].dlistener;
          }
        }
	
      //}
      this.map._container.style.cursor = 'crosshair';
      this.options.before_add_marker_callback && this.options.before_add_marker_callback()
      this.addModeListener = this.onMapClickAddMarker.bind(this, event.target.className);
      this.map.addEventListener('click', this.addModeListener);
    },

    enterDelMarkerMode: function() {
      "use strict";
      if (this.inDelMode) {
          for (var marker = 0; marker < this.markerList.length; marker++) {
              if (typeof(this.markerList[marker].marker) !== 'undefined' && typeof(this.markerList[marker].dlistener) !== "undefined") {
                  this.markerList[marker].marker.removeEventListener('click', this.markerList[marker].dlistener);
                  delete this.markerList[marker].dlistener;
              }
          }
          this.map._container.style.cursor = 'auto';
	  this.inDelMode = false;
	  document.getElementsByClassName("del_marker_control")[0].style["background-color"] = "#ffffff";
	  return false;
      }
      document.getElementsByClassName("del_marker_control")[0].style["background-color"] = "dodgerblue";
      this.inDelMode = true;
      for (var marker = 0; marker < this.markerList.length; marker++) {
        if (typeof(this.markerList[marker].marker) !== 'undefined') {
          var listener = this.onMarkerClickDelete.bind(this);
	  this.markerList[marker].dlistener = listener;
          this.markerList[marker].marker.addEventListener('click', listener);
          this.map._container.style.cursor = 'crosshair';
        }
      }
    },

    onMapClickAddMarker: function(className, e) {
      "use strict";
      if (typeof(this.addModeListener) !== "undefined") {
          this.map.removeEventListener('click', this.addModeListener);
	  this.addModeListener = undefined;
      }
      this.map._container.style.cursor = 'auto';

      var marker_options = { draggable: this.options.marker_draggable, class: className };
      if (this.options.marker_icon) {
        marker_options.icon = this.options.marker_icon.find(d => d.class === className).icon;
      }
      var marker = L.marker(e.latlng, marker_options);
      if (this.options.allow_popup) {
	
	      // Create a unique id for this marker.  This will also be used to identify the HTML element (eg. a span) so that the popup content can be updated.
          var id = "marker-" + e.latlng.lat.toString() + e.latlng.lng.toString();

	      // Set the initial popup content to just the Latitude, Longitude.
          var popupContent = "<div id=\"" + id + "\">"
              + "<div style=\"text-align: center;\"><table style=\"margin: 0 auto;\"><tr><td><span style=\"text-align: center;\"" + "id=\"" + id + "-coords\">"
              + Math.round(e.latlng.lat * 10000) / 10000 
              + ", " 
              + Math.round(e.latlng.lng * 10000) / 10000 
              + "</span></td>"
              + "<td><img src=\"/images/graphics/clipboard.png\" style=\"height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">"
              + "</td></tr></table></div>"
              + "<div contenteditable=\"true\" style=\"text-align: center;\" id=\"" + id + "-content\">Your text here.</div></div>";

	      // Create the popup
          var the_popup = L.popup({ closeButton: false });

	      // Add this unique ID to the marker itself so we can identify it during a popupclose event.
	      marker.uniqueId = id;

          the_popup.setContent(popupContent);
          marker.bindPopup(the_popup).openPopup();
          marker.on("popupclose", function(e) { 
		      var elemId = e.popup._source.uniqueId;
              var coords = L.DomUtil.get(elemId + "-coords");
              var content = L.DomUtil.get(elemId + "-content");
              var newContent = "<div id=\"" + elemId + "\" >"
                  + "<div style=\"text-align: center;\"><table style=\"margin: 0 auto;\"><tr><td><span style=\"text-align: center;\"" + "id=\"" + elemId + "-coords\">"
                  + coords.innerHTML 
                  + "</span></td>"
                  + "<td><img src=\"/images/graphics/clipboard.png\" style=\"height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">"
                  + "</td></tr></table></div>"
                  + "<div style=\"text-align: center;\" id=\"" + elemId + "-content\" contenteditable=\"true\">" + content.innerHTML + "</div>"
                  + "</div>";
		      e.popup.setContent(newContent);
	      });

          marker.on("moveend", function(e) {
              var elemId = e.target.getPopup()._source.uniqueId;
              e.target.openPopup();
              var root = L.DomUtil.get(elemId);

              var coords = L.DomUtil.get(elemId + "-coords");
              var content = L.DomUtil.get(elemId + "-content");
              var latlon = Math.round(e.target.getLatLng().lat * 10000) / 10000 + ", " + Math.round(e.target.getLatLng().lng * 10000) / 10000;

              var newContent = "<div id=\"" + elemId + "\" >"
                  + "<div style=\"text-align: center;\"><table style=\"margin: 0 auto;\"><tr><td><span style=\"text-align: center;\"" + "id=\"" + elemId + "-coords\">"
                  + latlon
                  + "</span></td>"
                  + "<td><img src=\"/images/graphics/clipboard.png\" style=\"height: 15px; width: 15px;\" onclick=\"copyToClipboard('" + id + "-coords')\">"
                  + "</td></tr></table></div>"
                  + "<div style=\"text-align: center;\" id=\"" + elemId + "-content\" contenteditable=\"true\">" + content.innerHTML + "</div>"
                  + "</div>";
              this.setPopupContent(newContent);
          });

      }
      if (this.options.add_marker_callback) {
        this.options.add_marker_callback(marker);
      }

      marker.addTo(this.map);
      this.markerList.push({ "marker": marker });
      this.options.after_add_marker_callback && this.options.after_add_marker_callback()
      document.getElementsByClassName("add_marker_control")[0].style["background-color"] = "#ffffff";
      return false;
    },

    onMarkerClickDelete: function(e) {
      "use strict";
      this.map._container.style.cursor = 'auto';
      var m;  
      for (m in this.markerList) {
	  if (this.markerList[m].marker == e.target) {
              this.map.removeLayer(e.target);
              //delete this.markerList[m].marker;
              this.markerList.splice(m, 1);
              for (var marker = 0; marker < this.markerList.length; marker++) {
		  if (typeof(this.markerList[marker].marker) !== 'undefined' && typeof(this.markerList[marker].dlistener) !== "undefined") {
                      this.markerList[marker].marker.removeEventListener('click', this.markerList[marker].dlistener);
	              delete this.markerList[marker].dlistener;
                  }
	      }
	  }
      }
      this.inDelMode = false;
      document.getElementsByClassName("del_marker_control")[0].style["background-color"] = "#ffffff";
      return false;
    },
    

  });

