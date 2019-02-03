
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

## This script will shutdown the habtracker backend daemon process, forcefully if need be...



######################################
########### script below ###########
###### nothing to edit below #######
######################################
HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
KILLSESSION=${BINDIR}/kill_session.bash
LOGFILE=${LOGDIR}/killsession_wrapper.log

# Check if a kill script is already running
ps -ef | grep kill_session | grep -v grep > /dev/null
if [ $? -eq 0 ]; then
    exit
fi


# this is a wrapper script so we can start the real one in the background...
nohup ${KILLSESSION} >${LOGFILE} 2>&1 &

