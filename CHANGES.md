# Revision History #


## Version 1.1 -- currently under development ##


### New Features: ###

- Changed how the RAW prediction file is uploaded for a given flight.  Data entry method now uses a file upload process instead of the prior, cut/paste of a URL to the RAW prediction file.  This allows for offline addition of the RAW prediction file to the system (assuming one has the RAW predict file on their laptop/tablet/etc).


### Bugs Fixed: ###

- Check for the existance of system log files prior to reading and displaying them on the Home page (under Stdout and Stderr).

- Allowances for graceful handling of errors like NoSuchProcess and AccessDenied when getting the status of various UNIX processes.




----------

## Version 1.0 -- February 2019 ##
Initial release.
