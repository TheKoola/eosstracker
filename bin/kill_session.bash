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
LOGFILE=${LOGDIR}/kill_session.log

echo > ${LOGFILE}
echo "########" >> ${LOGFILE}
date >> ${LOGFILE}
echo "########" >> ${LOGFILE}
echo "Shutting down the habtracker-daemon processes..." >> ${LOGFILE}

# now try and kill the processes for the habtracker-daemon script
ps -ef | grep "habtracker-daemon" | grep -v grep > /dev/null
if [ $? -eq 0 ]; then
    echo "Killing lead habtracker-daemon process..." >> $LOGFILE
    leadproc=$(ps -ef | grep "habtracker-daemon" | grep -v grep | awk 'BEGIN {s = 999999} { if ($2 < s) s=$2;} END {print s}')
    kill $leadproc >> ${LOGFILE}

    # wait for 12 seconds looping each time to see if there are any remaining processes
    let num_procs=$(ps -ef | grep "habtracker-daemon" | grep -v grep | wc -l)
    let i=0
    while [ $num_procs -gt 0 ] && [ $i -lt 12 ]
    do
        echo "Waiting/checking for habtracker-daemon processes to die...${i}" >> ${LOGFILE}
        let num_procs=$(ps -ef | grep "habtracker-daemon" | grep -v grep | wc -l)
        let i=$i+1
        sleep 1
    done   

    # if there are any remaining try to kill the leadproc again
    let num_procs=$(ps -ef | grep "habtracker-daemon" | grep -v grep | wc -l)
    if [ $num_procs -gt 0 ]; then
        kill $leadproc >> ${LOGFILE}
    fi

    # Last resort, kill -9 all remaining processes
    sleep 2
    let num_procs=$(ps -ef | grep "habtracker-daemon" | grep -v grep | wc -l)
    if [ $num_procs -gt 0 ]; then
        echo "Kill -9'ing remaining habtracker-daemon processes..." >> ${LOGFILE}
        pkill -9 habtracker-daemon >> ${LOGFILE}
    fi
fi
exit

# first kill aprsc because we have to use sudo...
ps -ef | grep aprsc | grep -v grep > /dev/null
if [ $? -eq 0 ]; then
    echo "killing aprsc..." >> ${LOGFILE}
    sudo pkill aprsc >> ${LOGFILE}
fi


# Now kill direwolf
ps -ef | grep direwolf | grep -v grep > /dev/null
if [ $? -eq 0 ]; then
    echo "killing direwolf..." >> ${LOGFILE}
    pkill direwolf >> ${LOGFILE}
fi

echo "#####################" >> $LOGFILE
echo >> $LOGFILE


