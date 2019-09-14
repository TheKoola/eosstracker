# Revision History #

## Version 1.2 - August 2019 ##

### New Features: ###

- Added the ability to edit the list of frequencies used by beacons.  There is a new section on the Setup screen that allows for adding/deleting from this list of frequencies.  They must be within 144MHz and 146MHz.
  In addition, it is now possible to specifically select 144.390 MHz as the frequency for a beacon.  

- Added a new Dashboard feature that will pop-out a new browser pane that will display incoming packets in very large font.  This also allowed for consolidation 
  of the performance graph onto the Data screen.

- Callsigns without an SSID are now allowed for beacons on a flight.  This was limited to the form of "callsign-ssid", but this update allows for either form:  "callsign" or "callsign-ssid".

- Landing predictions will now plot the predicted flight path on the map during the flight in addition to the usual, "+ marks the spot".  During the ascent, this will only occur if a valid predict file has been uploaded.  Once descending the flight path is calculated based on the landing algorithm and will be displayed on the map regardless if a predict file has been uploaded or not.

- Changed the "All other stations" layer on the map so that bundles of APRS stations are grouped together in "bubbles".  This clustering reduces the number of icons that are on that layer, improves web browser performance, and provides a cleaner view of the map.

- Updated the data entry fields for flight identifiers and callsigns allowing for more descriptive names.  Fields allow for longer identifiers as well as relaxed restrictions on Ham callsign formats.

- Added the ability to choose which "EOSSx" string to add to the APRS path for APRS position transmissions when the brick is connected to an external radio.  The string is now placed at the front of the APRS path instead of being appended to the end.

- Time-to-live values (in minutes) are not displayed for each flight on the left side, slideout bar.  When a flight is descending the number of estimated minutes until landing is displayed.

- The absolute bearing (relative to N) is now displayed along side the distance to a balloon on the map within the Relative Position section of the sidebar.

- Added additional graphs/charts to display RF packet information that leverages a customized Dire Wolf instance.


### Bugs Fixed: ###

- Updates to the flight instrument panel so that the units of degrees are properly displayed with the "˚" symbol instead of "deg".

- Updated copyright info so that it is properly displayed at the bottom of every page and is visible on the map.  Also added the GNU GPL reference to that footer section.

- Adjustments to the Settings pane within the Map screen to allow for dynamic settings changes (instead of a page reload) when hitting the "Save Settings" button.  

- Adjustment to the callsign used for the APRS-IS packet filter used when connecting to the locally running aprsc daemon.  This prevents the filter from including packets from igates that use the same callsign as the EOSS Tracker user, but a different SSID.  The aprsc filter now uses the callsign as well as the ssid.  

- Much improved GPS status reporting on the main web, home page.  The GPS monitoring thread improved to withstand GPS devices being removed/added.

- Corrected an error with an out of bounds array index when choosing the color for balloon tracks.

- Fixed some incorrect HTML that could cause popups on the map for balloon icons to render incorrectly.

- Changed how updates occur for the map so that calls to the backend web server are consolidated to reduce the amount of unecessary browser churn.  Flight gauges, tables, and charts are now only updated when new data for a flight is available.  This significantly reduces data pulls from the backend webserver.

- Fixed an issue where the MarkerCluster Leaflet plugin was installed incorrectly.

- Updated landing predictions so that the algorithm floor was adjusted to use the original launch location as the floor if the GPS location of the SDR system was greater than 35miles from the flight.  The prior threshold was set to 75miles which was a bit too far away.

- Corrected an issue where the Packet Performance graph would display gaps when data would cross a day boundary.

- Fixed a bug in the landing predictor process that would cause predictions to fail. It would attempt to calculate a landing prediction even if no packets from a flight's ascent were available.


## Version 1.1 - April 2019 ##

### New Features: ###

- Changed how the RAW prediction file is uploaded for a given flight.  Data entry method now uses a file upload process instead of the prior, cut/paste of a URL to the RAW prediction file.  This allows for offline addition of the RAW prediction file to the system (assuming one has the RAW predict file on their laptop/tablet/etc).

- Added an "About" screen.

- Added the ability to download GPS position and flight records.

- Timezone support.

- Added igating support so that aprsc will upload packets to noam.aprs2.net.

- Added APRS beaconing support (through Dire Wolf).  Uses tracker, smart beaconing.

- Added ability to select APRS symbol, optionally add EOSS to APRS beaconing path, and include an APRS comment.

- First portion of the Dire Wolf logs added to the home page.

- When igating is enabled, internet beaconing will be enabled through Dire Wolf.  This is in addition to any RF beaconing the user may have selected.

- Cosmetic:  Updated the layer selection widget (upper right corner of the map screen) so that categories are underlined for better visibilty.

- Waypoint markers available as an option on the map.  Markers can be placed at any location, updated with custom popup text, and are movable.

- GPS state data is now available on the Home page of the app.  This is only updated while the system processes are running.

- The system will now use multiple USB SDRs if attached to the system. So in the case of multi-antenna, multi-SDR setups, all SDRs will be used to listen on the same frequencies.  When there is a desire to have a high gain antenna for horizon level sensitivity as well as a lower gain antenna for vertical sensitivity, the backend daemon will detect each USB SDR and have each listen to the same set of frequencies.  Aka, having the best of both worlds.  

- Added a new section in the sidebar on the map screen that displays the source of the prior 10 APRS packets from the beacons for a flight.  This will help the user to determine at a glance, where the packets for a beacon were sourced from (i.e. from RF or Internet connections).

- The landing prediction algorithm now attempts to use the current GPS determined elevation of the system as the landing prediction floor if the flight is < 75 miles from the system's current location.


### Bugs Fixed: ###

- Check for the existance of system log files prior to reading and displaying them on the Home page (under Stdout and Stderr).

- Allowances for graceful handling of errors like NoSuchProcess and AccessDenied when getting the status of various UNIX processes.

- PHP session variables were not getting set correctly.

- Updated packet sorting for the live packet screens to account for day boundaries.

- Fixed issue where map screens were creating two update events for each incoming packet instead of just one.

- Issue where a flight's launch site wasn't being accounted for when querying data from downloaded prediction RAW files.  This would cause concatenation of prediction paths when launch sites are changed for flights.

- Issue where prediction file uploads (eg. the RAW file from [EOSS Predict Page](https://www.eoss.org/predict)) were not getting
added to the database properly.  The first few lines were getting skipped.

- When uploading a prediction file, the first few lines would end up with incorrectly calculated ascent/descent rates.

- Issue where the sort order for landing predictions was causing those predictions to be plotted in the wrong locations on the map.

- Fixed issues with the landing prediction functions in that descent times were not being tabulated correctly resulting in incorrect lat/lon predictions.

- Fixed an issue where sleep functions were being used instead of event wait calls within habtracker-daemon.py.

- Changed the serverID that aprsc will use to pad random numbers to at the end of one's callsign (or the default callsign if one isn't entered) so that it's always 9 characters in length.  This avoids naming collisions where the same aprsc serverID might be used across several different systems.

- Fixed an issue where the FM demodulation was using a maximum deviation of 2.5KHz which is a bit too small if systems are transmitting with a higher deviation.  This fix changes the max deviation for FM demodulation.

- Corrected an issue with the Performance graph with how it was splitting out packet counts for RF vs. Internet.

- Updated the way the habtracker-daemon status was being saved to create a file, daemonstatus.json.  Which fixes some latency issues in getting the daemon's status updated within various sections on web pages.

- Fixed an issue where the "Tracking" checkbox wasn't being honored when adding a new flight.

- Fixed an issue with the landing predictor function in that an initial loop was allowed to run unchecked causing landing predictions to no longer run.


----------

## Version 1.0 -- February 2019 ##
Initial release.
