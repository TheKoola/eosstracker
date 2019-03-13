# Downloading GPS and Flight Data #

## Overview ##
All data collected for flights is available for download from the SDR system through the web-based user interface.  In addition
the GPS logs, assuming the SDR system was installed within a vehicle, are also available for download.  All data is in comma
delimited format (CSV).


#### Example Flight Data ####

Flight data contains every APRS packet captured by the SDR system from every callsign (i.e. beacon) listed as belonging to
this particular flight.  A number of fields are broken out for convenience as well as the raw APRS packet itself.  Regardless 
of how an APRS packet enters the SDR system (ex. over RF or via an Internet connection to APRS-IS servers), that data is 
available for download.

Scroll to the right as the flight data table below is too wide for most screens ------>

| datetime | flightid | callsign | aprs_symbol | speed_mph | bearing | altitude_ft | lat | lon | comment | md5_hash | raw_packet |
| -------- | -------- | -------- | ----------- | --------- | ------- | ----------- | --- | --- | ------- | -------- | ---------- |
| 2019-03-10 08:30:02 | EOSS-283 | KC0D-14 | /O | 0 | 0 | 4929 | 40.473633 | 104.962767 | EOSS BALLOON | a8dbaa71615941b0faebdbea74fdc2d1 | KC0D-14>APZEOS,EOSS,qAO,N2XGL01:/143000h4028.41N/10457.76WO000/000!W86!/A=004929 EOSS BALLOON |
| 2019-03-10 08:30:02 | EOSS-283 | KC0D-2 | /O | 1.15 | 18 | 4918 | 40.473667 | 104.962833 | EOSS BALLOON | 1e5f091ebfcb7ae441dca248f370a43a | KC0D-2>APZEOS,EOSS,qAO,N2XGL04:/143000h4028.42N/10457.77WO018/001/A=004918 EOSS BALLOON |
| 2019-03-10 08:30:04 | EOSS-283 | KC0D-14 | | 0 | 0 | 0 | 0 | 0 | | 5bd3a11240dc2396837bff3ec8106776 | KC0D-14>APZEOS,EOSS,qAO,N2XGL01:>143000 Lk=3Diff/14 Itemp=59F bAlt=4792Ft Rel:7.5V 8.0V |
| 2019-03-10 08:30:11 | EOSS-283 | AE0SS-13 | /O | 0 | 0 | 4942 | 40.473867 | 104.962817 | EOSS Baloon | 518a58a8c20fc42d46f6bf9c3f580fba | AE0SS-13>APTT4,EOSS,qAO,N2XGL00:/143010h4028.43N/10457.76WO000/000EOSS Baloon/A=004942!W29! |


#### Example GPS Data ####

GPS data is available for download and includes all the usual fields for location and movement data the SDR system 
is experiencing (i.e. when it's installed within a moving vehicle).  Satellite fix status is not currently captured within the
SDR system at this time.  Although GPS latitude and longitude data is saved to a 6-digit resolution, a new GPS log entry is 
only created when the location has changed by greater than approximately 10 meters (or 4 decimal places for lat/lon figures).  
In addition, the frequency that new GPS log entries are created is limited about 2 seconds.

| datetime | speed_mph | bearing | altitude_ft | lat | lon |
| -------- | --------- | ------- | ----------- | --- | --- |
| 2019-03-10 08:30:01 | 58 | 24 | 4221 | 40.293141 | -103.593831 |
| 2019-03-10 08:30:03 | 58 | 17 | 4221 | 40.293579 | -103.593626 |
| 2019-03-10 08:30:05 | 58 | 9  | 4222 | 40.294036 | -103.593495 |



## Downloading Data ##

First task is to click on the "Data" menu option within the user interface:

<p align="center">
<img src="assets/select-data.png" alt="Select Data Menu option" width="800">
</p>


Once on the Data screen there is a form that allows for selection of:
- the type of data one desires to download (ex. GPS logs or flight data)
- a date and time range that includes a beginning date/time and an ending date/time

