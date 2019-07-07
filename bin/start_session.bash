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
CALLSIGN="AE0SS"


# This is the elevation at the predicted landing location.  This is a starting value as the algorithm will auto-adjust this to
# be equal to the launch site elevation.  This doesn't need to edited.
GROUNDLEVEL=4900


# Locations of things
HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
HABTRACKERCMD=${BINDIR}/habtracker-daemon.py
LOGFILE=${LOGDIR}/start_session.log
STDERR=${LOGFILE}.stderr
APRSRADIUS=400


# Check if things are running:
let num_procs=$(${BINDIR}/procstatus.py  | python -m json.tool | awk '/\"status\":/ { s+=$2;} END {print s}')

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

# Start Pulseaudio daemon if it's not already running
#echo "Starting pulseaudio..." >>${LOGFILE}
#pulseaudio -k >>${LOGFILE}
#pulseaudio --start >>${LOGFILE}
#aplay -l >> ${LOGFILE}

#echo "###################" >> ${LOGFILE}
#echo "###################" >> ${LOGFILE}

echo "Starting habtracker-daemon.py..." >> ${LOGFILE}
nohup ${HABTRACKERCMD} --callsign=${CALLSIGN} --algoFloor=${GROUNDLEVEL} --aprsisRadius=${APRSRADIUS} >> ${LOGFILE} 2>${STDERR} &
