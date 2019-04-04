#!/usr/bin/python

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

import psutil
import sys
import os
import json

myprocname = os.path.basename(sys.argv[0].lower()).split(".")[0]
daemonstatusfile = "/eosstracker/www/daemonstatus.json"

listOfProcesses = list()

habproc = "habtracker-d"

procs = ["direwolf", "aprsc", "gpsd", habproc]
procstatus = []
for p in procs:
    procstatus.append({"process": p, "status": 0})

# Iterate over all running processes
isrunning = 0
for proc in psutil.process_iter():
   # Get process detail as dictionary
   try:
       pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent', 'cmdline' ])
   except (psutil.NoSuchProcess, psutil.AccessDenied):
       pass
   else:
       for p in procstatus:
           if p["process"] in pInfoDict["name"].lower() or p["process"] in pInfoDict["cmdline"]:
               listOfProcesses.append(pInfoDict)
               p["status"] = 1  
               break

for p in procstatus:
    isrunning += p["status"]

# Default status
a = {"antennas": [], "rf_mode": 0, "active": 0}

# Get the JSON status output from the most recent invocation of habtracker-daemon.py
try:
    with open(daemonstatusfile) as json_data:
        a = json.load(json_data)
except Exception as err:
    pass

# Build the status object
status = {}
status["processes"] = procstatus
status.update(a)


# Print out JSON for the status
print json.dumps(status)
