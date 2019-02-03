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

############################################
# Parameters... edit these...
############################################
## callsign:  Enter your callsign here WITHOUT any sort of SSID
#
# A note about the callsign here...
#     If you don't replace this with your callsign, then the system will use "E0SS" (as below).  Now this is just fine and dandy.
#     As a) nothing is transmitted over the air with this system, and b) nothing is transmitted to APRS-IS over the internet.
#     In the future the mechanism for one's callsign will change for the better, but for now, it's just this one hardcoded 
#     line in this script. ;)
#
CALLSIGN="E0SS"


# This is the elevation at the predicted landing location.  This doesn't need to be exact. It represents the altitude floor
# below which the prediction algorithm will no longer attempt to calculate.  Consequently, this needs to be set at or around
# ground level at the landing location.
GROUNDLEVEL=4900
############################################



######################################
########### script below ###########
###### nothing to edit below #######
######################################

# Locations of things
HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
HABTRACKERCMD=${BINDIR}/habtracker-daemon.py
LOGFILE=${LOGDIR}/start_session.log
STDERR=${LOGFILE}.stderr


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
echo "Starting habtracker-daemon.py..." >> ${LOGFILE}
nohup ${HABTRACKERCMD} --callsign=${CALLSIGN} --algoFloor=${GROUNDLEVEL} >> ${LOGFILE} 2>${STDERR} &

