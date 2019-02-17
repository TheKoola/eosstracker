# Revision History #


## Version 1.1 -- currently under development ##


### New Features: ###

- Changed how the RAW prediction file is uploaded for a given flight.  Data entry method now uses a file upload process instead of the prior, cut/paste of a URL to the RAW prediction file.  This allows for offline addition of the RAW prediction file to the system (assuming one has the RAW predict file on their laptop/tablet/etc).

- Added an "About" screen.

- Added the ability to download GPS position and flight records.

- Timezone support

- Added igating support so that aprsc will upload packets to noam.aprs2.net

- Added APRS beaconing support (through Dire Wolf).  Uses tracker, smart beaconing.

- Added ability to select APRS symbol, optionally add EOSS to APRS beaconing path, and include an APRS comment.

- First portion of the Dire Wolf logs added to the home page.


### Bugs Fixed: ###

- Check for the existance of system log files prior to reading and displaying them on the Home page (under Stdout and Stderr).

- Allowances for graceful handling of errors like NoSuchProcess and AccessDenied when getting the status of various UNIX processes.

- PHP session variables were not getting set correctly.

- Updated packet sorting for the live packet screens to account for day boundaries.

- Fixed issue where map screens were creating two update events for each incoming packet instead of just one.



----------

## Version 1.0 -- February 2019 ##
Initial release.
