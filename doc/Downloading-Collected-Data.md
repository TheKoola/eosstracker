# Downloading GPS and Flight Data #

All data collected for flights is available for download from the SDR system through the web-based user interface.  In addition
the GPS logs, assuming the SDR system was installed within a vehicle, are also available for download.  All data is in comma
delimited format (CSV).


#### Example Flight Data ####

| datetime | flightid | callsign | aprs_symbol | speed_mph | bearing | altitude_ft | lat | lon | comment | md5_hash | raw_packet |
| -------- | -------- | -------- | ----------- | --------- | ------- | ----------- | --- | --- | ------- | -------- | ---------- |
| 2019-03-10 08:30:02 | EOSS-283 | KC0D-14 | /O | 0 | 0 | 4929 | 40.473633 | 104.962767 | EOSS BALLOON | a8dbaa71615941b0faebdbea74fdc2d1 | KC0D-14>APZEOS,EOSS,qAO,N2XGL01:/143000h4028.41N/10457.76WO000/000!W86!/A=004929 EOSS BALLOON |
| 2019-03-10 08:30:02 | EOSS-283 | KC0D-2 | /O | 1.15 | 18 | 4918 | 40.473667 | 104.962833 | EOSS BALLOON | 1e5f091ebfcb7ae441dca248f370a43a | KC0D-2>APZEOS,EOSS,qAO,N2XGL04:/143000h4028.42N/10457.77WO018/001/A=004918 EOSS BALLOON |
| 2019-03-10 08:30:04 | EOSS-283 | KC0D-14 | | 0 | 0 | 0 | 0 | 0 | | 5bd3a11240dc2396837bff3ec8106776 | KC0D-14>APZEOS,EOSS,qAO,N2XGL01:>143000 Lk=3Diff/14 Itemp=59F bAlt=4792Ft Rel:7.5V 8.0V |
| 2019-03-10 08:30:11 | EOSS-283 | AE0SS-13 | /O | 0 | 0 | 4942 | 40.473867 | 104.962817 | EOSS Baloon | 518a58a8c20fc42d46f6bf9c3f580fba | AE0SS-13>APTT4,EOSS,qAO,N2XGL00:/143010h4028.43N/10457.76WO000/000EOSS Baloon/A=004942!W29! |


#### Example GPS Data ####

| datetime | speed_mph | bearing | altitude_ft | lat | lon |
| -------- | --------- | ------- | ----------- | --- | --- |
| 2019-03-10 08:30:01 | 58 | 24 | 4221 | 40.293141 | -103.593831 |
| 2019-03-10 08:30:03 | 58 | 17 | 4221 | 40.293579 | -103.593626 |
| 2019-03-10 08:30:05 | 58 | 9  | 4222 | 40.294036 | -103.593495 |

