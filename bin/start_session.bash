#!/bin/bash
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


###
# This script will start an APRS monitoring session
###

######################################
########### script below ###########
###### nothing to edit below #######
######################################

# A note about the default callsign here...
#     This is the catch-all default callsign when operating in read-only (Internet) and receive-only (RF) mode.  It is NOT used
#     when a user has entered their callsign through the web setup screens (ex. under Setup-->System Configuration).  This doesn't
#     need to be edited.
CALLSIGN="E0SS"

# Locations of things
HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
HABTRACKERCMD=${BINDIR}/habtracker-daemon.py
LOGFILE=${LOGDIR}/start_session.log
STDERR=${LOGFILE}.stderr

# Location of the planet time file.  Setting this file to an "old" date will prevent the apache module, mod_tile, from re-rendering the tile.  This removes
# a tremendous amount of processing load when the user zooms/pans the map as the backend will happily serve the tile without trying to re-render it.
MAPSDIR=/eosstracker/maps
ALTMAPSDIR=/var/lib/mod_tile
ALTMAPSDIR2=/eosstracker/maps/tiles
PLANETFILE=planet-import-complete

if [ -d ${MAPSDIR}/maps ]; then
    touch -t 200001010000 ${MAPSDIR}/${PLANETFILE}
elif [ -d ${ALTMAPSDIR}/maps ]; then
    touch -t 200001010000 ${ALTMAPSDIR}/${PLANETFILE}
elif [ -d ${ALTMAPSDIR2}/maps ]; then
    touch -t 200001010000 ${ALTMAPSDIR2}/${PLANETFILE}
fi

# Check if things are running:
let num_procs=$(${BINDIR}/procstatus.py  | python3 -m json.tool | awk '/"status":/ { s+=$2;} END {print s}')

# Check if it's just GPSD that is still running
if [ $num_procs -eq 1 ]; then
    ps -ef | grep gpsd | grep -v grep > /dev/null
    if [ $? -gt 0 ]; then
        exit 
    fi
fi

# if more then one process is running then we abort
if [ $num_procs -gt 1 ]; then
    exit
fi

echo > ${LOGFILE}
echo "###################" >> ${LOGFILE}
date >> ${LOGFILE}
echo "###################" >> ${LOGFILE}

rm -f ${LOGDIR}/direwolf.out


# remove the old stderr file (if any)
rm -f ${STDERR}
touch ${STDERR}


# the configuration for this system
CONFIG=/eosstracker/www/configuration/config.txt

# Check if we're supposed to be igating or not
IGATING=$(/usr/bin/jq '.igating' --raw-output ${CONFIG})
if [ ${IGATING} == "true" ]; then

    # update the igate.conf file with our particulars.
    ##
    ##
    ##
    IGATECONF=/etc/radio/igate.conf

    echo "AX25=ax25.local" > ${IGATECONF}
    SSID=$(/usr/bin/jq '.ssid' --raw-output ${CONFIG})
    if [ -z "${SSID}" ] || [ "${SSID}" == "0" ]; then
        CALL=$(/usr/bin/jq '.callsign' --raw-output ${CONFIG})
    else
        CALL=$(/usr/bin/jq '.callsign' --raw-output ${CONFIG})"-"${SSID}
    fi

    echo "CALL=${CALL}" >> ${IGATECONF}
    echo "SERVER=127.0.0.1" >> ${IGATECONF}

    ibeacon=$(/usr/bin/jq '.ibeacon' --raw-output ${CONFIG})
    if [ "${ibeacon}" == "true" ]; then
        echo "BEACONING=1" >> ${IGATECONF}
    else
        echo "BEACONING=0" >> ${IGATECONF}
    fi

    gpsdhost=$(/usr/bin/jq '.gpshost' --raw-output ${CONFIG})
    if [ ! -z "${gpsdhost}" ]; then
        echo "GPSDHOST=\"-H ${gpsdhost}\"" >> ${IGATECONF}
    else
        echo "GPSDHOST=\"-H localhost\"" >> ${IGATECONF}
    fi

    # default lat/lon/alt
    echo "LAT=\"\"" >> ${IGATECONF}
    echo "LON=\"\"" >> ${IGATECONF}
    echo "ALT=\"\"" >> ${IGATECONF}


    symbol=$(/usr/bin/jq '.symbol' --raw-output ${CONFIG} | /usr/bin/sed 's/\\/\\\\/g')
    if [ ! -z "${symbol}" ]; then
        echo "SYMBOL=\"${symbol}\"" >> ${IGATECONF}
    else
        # if no symbol then just use a red dot
        echo "SYMBOL=\"//\"" >> ${IGATECONF}
    fi

    overlay=$(/usr/bin/jq '.overlay' --raw-output ${CONFIG} | /usr/bin/sed 's/\\/\\\\/g')
    if [ ! -z "${overlay}" ]; then
        echo "OVERLAY=\"-O ${overlay}\"" >> ${IGATECONF}
    else
        echo "OVERLAY=\"\"" >> ${IGATECONF}
    fi

    comment=$(/usr/bin/jq '.comment' --raw-output ${CONFIG})
    if [ ! -z "${comment}" ]; then
        echo "COMMENT=\"${comment}\"" >> ${IGATECONF}
    else
        # if no symbol then just use a red dot
        echo "COMMENT=\"${CALL}\"" >> ${IGATECONF}
    fi

    mobile=$(/usr/bin/jq '.mobilestation' --raw-output ${CONFIG})
    if [ ! -z "${mobile}" ]; then
        echo "MOBILE=1" >> ${IGATECONF}
    else
        # if no symbol then just use a red dot
        echo "MOBILE=0" >> ${IGATECONF}
    fi

    echo "Starting igate..." >> ${LOGFILE}
    sudo /bin/systemctl enable igate.service >> ${LOGFILE} 2>>${STDERR}
    sudo /bin/systemctl start igate.service >> ${LOGFILE} 2>>${STDERR} 
    #sudo /bin/systemctl status igate.service >> ${LOGFILE} 2>${STDERR} 
fi

# startup the powerlogger service
echo "Starting powerlogger..." >> ${LOGFILE}
sudo /bin/systemctl enable powerlogger.service >> ${LOGFILE} 2>>${STDERR}
sudo /bin/systemctl start powerlogger.service >> ${LOGFILE} 2>>${STDERR}
#sudo /bin/systemctl status powerlogger.service >> ${LOGFILE} 2>>${STDERR}

# startup the 2m FM recording service
echo "Starting 2m FM recorder..." >> ${LOGFILE}
sudo /bin/systemctl enable recordings@2m-fm.service >> ${LOGFILE} 2>>${STDERR}
sudo /bin/systemctl start recordings@2m-fm.service >> ${LOGFILE} 2>>${STDERR}
#sudo /bin/systemctl status recordings@2m-fm.service >> ${LOGFILE} 2>>${STDERR}

# startup the 2m FM packet recording service
echo "Starting 2m FM packet recorder..." >> ${LOGFILE}
sudo /bin/systemctl enable recordings@packet-fm.service >> ${LOGFILE} 2>>${STDERR}
sudo /bin/systemctl start recordings@packet-fm.service >> ${LOGFILE} 2>>${STDERR}
#sudo /bin/systemctl status recordings@packet-fm.service >> ${LOGFILE} 2>>${STDERR}

# Finally start up the habtracker software
echo "Starting habtracker-daemon.py..." >> ${LOGFILE}
nohup ${HABTRACKERCMD} --callsign=${CALLSIGN} >> ${LOGFILE} 2>>${STDERR} &
