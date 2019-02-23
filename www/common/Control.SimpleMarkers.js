/* jshint plusplus: false */
/* globals L */
/*(function(name, context, factory) {
  // Supports UMD. AMD, CommonJS/Node.js and browser context
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(
      require('leaflet')
    );
  } else if (typeof define === "function" && define.amd) {
    define(['leaflet'], factory);
  } else {
    if (typeof window.L === 'undefined') {
      throw new Error('simpleMarkers must be loaded before the leaflet heatmap plugin');
    }
  }
})("SimpleMarkers", this, function(L) { */
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
        var popupContent = "<span id=\"" + id + "\" contenteditable=\"true\">" + Math.round(e.latlng.lat * 1000) / 1000 + ", " + Math.round(e.latlng.lng * 1000) / 1000 + "</span>";

	// Create the popup
        var the_popup = L.popup({ closeButton: false });

	// Add this unique ID to the marker itself so we can identify it during a popupclose event.
	marker.uniqueId = id;

        the_popup.setContent(popupContent);

        marker.bindPopup(the_popup).on("popupclose", function(e) { 
		var elemId = e.popup._source.uniqueId;
                var content = L.DomUtil.get(elemId);
                var newContent = "<span id=\"" + elemId + "\" contenteditable=\"true\">" + content.innerHTML + "</span>";
		e.popup.setContent(newContent);
	}).openPopup();

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
    }
  });



/*
  return L.Control.SimpleMarkers
});
*/
