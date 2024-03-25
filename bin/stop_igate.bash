#!/bin/bash
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2024, Jeff Deaton (N6BA)
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

# Locations of things
HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
LOGFILE=${LOGDIR}/igate.log
STDERR=${LOGFILE}.stderr

echo > ${LOGFILE}
echo "###################" >> ${LOGFILE}
date >> ${LOGFILE}
echo "###################" >> ${LOGFILE}

echo "Stopping igate..." >> ${LOGFILE}
sudo /bin/systemctl stop igate.service >> ${LOGFILE} 2>${STDERR} 
sudo /bin/systemctl disable igate.service >> ${LOGFILE} 2>${STDERR}
sudo /bin/systemctl status igate.service >> ${LOGFILE} 2>${STDERR} 

