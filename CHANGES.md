# Revision History #

## Version 1.3 - Under Development ##

### New Features: ###

- On the Setup page, there is a new section for synchronizing one's local SDR system to the kiosk version running at https://track.eoss.org.  This will mirror flights, trackers, launch sites, and frequencies from the kiosk system onto the local system potentially saving the user signficant time in having to add those configuration items themselves.

- Much more mobile device friendly as all web pages including the map now make much better allowances for the small screens of mobile devices (ex. phones, tablets, etc.).  The map sidebar will now shrink the gauges to allow for smaller screens, but if the screen is even smaller (ex. small phones), the gauges are replaced with text indicating the usual Altitude, Veritical Rate, Heading, and Speed.

- All web pages now have new styling to be "darker" and much more attractive.

- There is a new Dashboard page that opens under a new browser tab.  It will display the three most recently heard APRS packets in large font for quick identification.

- Audio Alerts:  A synthesized voice will announce flight details/events when a flight is selected from the Dashboard page.  Audio anouncements will occur ever 30 seconds or upon special events (ex. burst, etc.) and include:  regular flight altitude and distance, time-to-live anouncements when the flight is descending, distance to predicted landing location, and loss of signal.

- Initial prep for to the map screens (i.e. underlying Javascript) to enable future accommodation of vector map tile sources.  This includes adding in the Mapbox GL Leafletjs shim as well as the Mapbox GL Javascript library.  This will make it easier (i.e. small code updates) when porting the system to use different map sources.

- The landing predictor will now query the predicted landing area for nearby stations (ex. < 30 miles) that are reporting an altitude/elevation in an attempt to determine the elevation near the landing area.  This uses a weighted exponential average of so that those stations closer to the predicted landing weight more heavily on the elevation computed.  Ultimately the aim of this feature is to improve prediction accuracy by having better knowledge of the landing elevation.

- There are additional layers added to the map for weather stations and those stations heard directly over RF.  There are now three categories (i.e. map layers) for "other stations":  Weather Stations, Other Stations (RF-only), and Other Stations (Internet Only).  Each of these layers uses "clustering" to group nearby stations into a single "bubble" that can be expanded upon when clicked.  

- Breadcrumbs are added to the predicted flight path displayed on the map.  Each breadcrumb shows the altitude of the fight at that point.

- For the last few thousand feet before landing, the landing predictor will now take into account the current direction of the flight as it descends through 4500ft AGL and adjust the predicted landing location accordingly.  The idea being that as the flight is descending into surface winds it will being to change course (obivously), so the landing predictor will now being to "blend in" the current flight's course and speed as it descends through 4500ft AGL.  Once the fligh the flight is below 2500ft AGL, the predictor will assume it is 100% under the influence of surface winds.

- The landing predictor will query the database to search for weather stations near the predicted landing area and use an exponential weighted average to estimate surface winds.  These are used to aid in prediction accuracy.  If surface wind values were available, the landing prediction icon will show "(wind adjusted)" on the map and the icon's popup will display the wind speed and direction.

- The system will attempt to connect to cwop.aprs.net using a radius filter that encompasses the current flight's location and any predicted landing area's.  This ensures that weather data is added to the backend database to aid the landing predictor in estimating surface winds when calculating landing predictions.  This connection will auto-reconnect if no packets have been seen from cwop.aprs.net in the prior 10mins.

- Simplified charts on the "Data" web page in addition to new charts to display temperature and pressure that new firmware on the KC0D payloads will be transmitting.

- If availble, temperature and pressure values transmitted from the new firmware on KC0D payloads is displayed in popups for balloon and breadcrumb icons on the map.

- Large rewrites of the backend Python code to be more modular, class oriented, and better positioned for future changes/additions.

- The landing prediction process now runs every 10secs instead of every 20secs.

- The map page will now dictate a full update of all map data every 30secs (was 90secs) in addition to improved polling routines.

- Remove the algoFloor command line argument for the Python backend as it was unused.  The prediction floor is now completely automatically determined.

- Calculations for determinging vertical rate of flights now use millisecond precision to increase accuracy (i.e. trying to avoid rounding issues).

- There is a new category for Trackers, ZZ-Not Active.  When a tracker is placed on this team, they will not be displayed on the map.  The idea is that for trackers that are on the "bench" for a mission, they can be placed on the ZZ-Not Active team instead of deleted altogether.
  
- The Trackers sidebar content on the map is now a read-only list of trackers and team assignments in order to better faciliate code sharing between the code branches.  

- The Live Packets sidebar content on the map is no longer available.  This was of limited use on the map.  The functionality, however, is still available on the "Data" page.

- New feature on the Data web page that shows packet counts (i.e. direct, digipeated, etc.) heard over RF from trackers in tablulated format.

- APRS icons on the map are now rotated to match their advertised (aka beaconed) bearing.

- Waypoint markers on the map now automatically update their latitude/longitude (within their popup) with their current position after a user drags them to a new location. 

- All popups on the map that have lat/lon coordinates displayed also have a small "copy to clipboard" image to make it easier for users to grab/save/copy those coordinates for other use.

- Adjusted the font size used to display the altitude value on the dashboard for better visibility.

- If the local system (ex. the brick) has dump1090-fa installed for monitoring ADS-B transmissions from aircraft, the web pages will automatically add a link to the menu for connecting to the dump1090-fa web page.

- The system will skip over any RTLSDR USB dongle with a serial number containing 'adsb' (case insensitive) at startup.


### Issues Fixed: ###

- Reordering of the map panes (z-order) so that some icons/layers are "covered" and therefore no longer respond to click events.  Also includes fixes to ensure the z-ordering of the landing prediction 'X' on the map is higher than ordinary stations.

- Adjustments/fixes to the SQL query for finding stations nearby the landing prediction site to use exponential weighting and to filter out flying objects (ex. balloons, flights, etc.).

- Better checking for NULL values when estimating surface wind values to prevent unintended abends.

- Minor issue with parsing timestamp from APRS packet that could cause a +- 4 sec error for web page displayed data.  This did not effect landing prediction calculations.

- Correct an error when parsing times that do not have microsecond accuracy for some of the web page displayed data on the map.

- Fixes to the HTML variable comparisons that occur for the map page

- Strip leading/trailing whitespace from strings when inserting packets into the database from APRS-IS sources.

- Fixes to map markers so that all objects display 4 digits precision for any displayed lat/lon coords.

- Add the '-H' flag to sudo so that the backend daemon starts with a HOME directory for the eosstracker user.

- Changes to the map web page in an attempt to load map elements in parallel to improve initial map page load times.

- Corrections to data displayed on the map for flights to use timestamps included in APRS packets regardless of packet type.  This was formerly limited to balloon objects only.

- Correction to the landing prediction algorithm, to average velocity when stepping through altitude levels (step size is 30ft).

- Fixed an incorrect timezone setting used for database connections.

- The map page was usting incorrect syntax calling javascript math methods within the distance function.  This was a low impact fix, but corrected nonetheless.

- Corrections to the map update/polling routines to now indicate that new data is available when new landing predictions are available.

- Fixed an issue where the map wouldn't update a flight path when multiple flights were being tracked.

- Fixed error with SQL update statement when checking landingprediction table columns.  The landing predictor, upon startup, now correctly looks for required columns for the landingpredictions database table.

- Adjustments to the SQL query for getting TTL times to more correctly display the time-to-live (TTL) for flights as they are descending on the map.

- Fix time delta calculations in some web page data.

- Corrected the map telemetry gauges to properly display NaN for invalid altitude and vertical rate values.

- Update the web page postgresql SQL queries to correctly identify milliseconds when querying the database for recent flight data.

- Fixes to the HTML when clicking on a callsign of a beacon on the map.  The correct action is the link should pan the map to the latest position of that beacon.

- Fixed an issue wher the ending time values for the data downloads section were not being padded with leading zeros.

- Corrected an issue on all web pages (i.e. Home, Data, Setup, etc.) where the GPS position query will occur every 5 seconds to update the Map link in the menubar.  The idea is that the map will start centered on the latest GPS position.

- Update the Leaflet javascript library to v1.6.0.

- Fixes to the footer area on the Dashboard page.

- Fixed an issue where a user was unable to move a tracker to the 'At Large' team.

- Corrected the file extension to be .csv for downloads from the Data page.

- Beacon transmissions, RF or Internet, were being skipped because of incorrect regex and not included in JSON output.

- Update to the wording on the Setup page to ensure a clearer meaning for the EOSS string prepended to outgoing APRS RF beacons.  Only applies to those stations using the brick with an external radio for position beaconing.

- Remvoed a legacy directory from the web page file system /eosstracker/www/images/flightindicators/img.

- Correction to several HTML headers to properly specify character encoding for HTML5.

- Issue corrected where the "prepend EOSS" checkbox was being left in the dropdown as enabled under System Configuration settings.

- Fixed the backend Python code to check for permissions on audio and configuration subdirs at system startup.

- Issue with the backend Python using an incorrect column name for database insert statements.

- Correction to the TTL calculations when contact to the flight has been lost.

- Update the time used on database inserts to include millisecond resolution.

- Changed all database insert statements to correctly identify columns, to hopefully insulate against schema changes causing issues.

- Issue with filtering the Dire wolf log file.  The regular expression being used was not accounting for dates being included in timestamps causing RF or Internet beacon transmissions (from Dire Wolf) to be skipped and not listed on the Home page.


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
