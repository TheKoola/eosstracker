#!/usr/bin/python3

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



########################
# getProcStatus
# searches for the processes listed in 'query' among all procs running on the system.  It returns a list of of those found
########################
def getProcStatus(query: list)->list:

    # where we store the processes and their status
    procstatus = []

    # Pre-populate the processes by looping through those in the 'query' list
    for p in query:
        procstatus.append({"process": p, "status": 0, "cmdline": None })

    # Iterate over all running processes, searching for those in 'procstatus'
    for proc in psutil.process_iter():

       try:
           # Get process detail as dictionary
           pInfoDict = proc.as_dict(attrs=['pid', 'ppid', 'name', 'exe', 'memory_percent', 'cmdline' ])

       except (psutil.NoSuchProcess, psutil.AccessDenied):
           # we just skip over those processes that we're not allowed to see or if they no longer exist.
           pass

       else:
           # for everyother process, we check if it's one of those that we're looking for
           # loop over each process in procstatus checking if the current OS process is a match.  When a match is found we break out of the loop.
           for p in procstatus:
               if pInfoDict["name"] and pInfoDict["cmdline"]:
                   if p["process"] in pInfoDict["name"].lower() or p["process"] in pInfoDict["cmdline"]:
                       p["cmdline"] = pInfoDict["cmdline"]
                       p["status"] = 1  
                       break
    return procstatus



########################
# isProcRunning
# loop through the list of processes to get the status (is is running or not) of the given process name
########################
def isProcRunning(procs: list, name: str)->bool:

    # loop through each process, looking for the process so we can determine if it's running or not
    for p in procs:

        # we want to single out if the process is running
        if p["process"] == name:
            return True if p["status"] > 0 else False

    # we didn't find the process
    return None


########################
# readJSONFile
# read the JSON from a file and return an object with its contents
########################
def readJSONFile(jsonfile: str)->dict:

    # where we'll store the JSON contents
    content = {}

    # Get the JSON from the file
    try:
        with open(jsonfile) as json_data:
            content = json.load(json_data)
    except Exception as err:
        pass

    return content



########################
# main
# everything starts here
########################
def main():

    ######
    # defaults, locations, process lists, etc.
    ######

    # Location of the daemonstatus file.  The habtracker-daemon.py process will create/update this file.
    daemonstatusfile = "/eosstracker/www/daemonstatus.json"

    # Location of the gpsstatus file.  This is updated regularly from the gpspoller.py process.
    gpsstatusfile = "/eosstracker/www/gpsstatus.json"

    # default/blank GPS status
    defaultgpsjson = { 
        "utc_time": "n/a",
        "mode": 0,
        "host": "n/a",
        "status": "n/a",
        "devicepath": "n/a",
        "lat": 0.0,
        "lon": 0.0,
        "satellites": [],
        "bearing": 0.0,
        "speed_mph": 0.0,
        "altitude": 0.0,
        "error": "n/a" 
    }

    # The name of the habtracker-daemon.py process
    habproc = "habtracker-d"

    # the list of processes that we're interested in
    procs_of_interest = ["direwolf", "gpsd", habproc, "aprsc"]



    ######
    # get process status, read JSON files, etc.
    ######

    # get the status of our processes
    processes = getProcStatus(procs_of_interest)

    # the status of the habtracker-daemon.py process(es)
    habproc_isrunning = isProcRunning(processes, habproc)

    # read in the JSON from the habtracker-daemon.py process status file
    statusjson = readJSONFile(daemonstatusfile)

    # read in the JSON from the gpsstatus.json file
    gpsjson = readJSONFile(gpsstatusfile)



    #######
    # Now form up the status JSON that we'll ultimately return (i.e. print out) for the caller
    ######

    # Build the status object from our list of processes
    status = {}
    status["processes"] = processes

    # the GPS status
    status["gps"] = gpsjson if gpsjson else defaultgpsjson

    # update with elements from the JSON status file for the habtracker-daemon.py process
    status.update(statusjson)

    # we need to determine if the habtracker-daemon.py process is active.  We do this by looking for the 'active' JSON key.  We'll use this to perform out sanity check (below).
    active = True if "active" in statusjson and statusjson["active"] > 0 else False

    # sanity check.  If the status file indicates that the processes are active, but we we're unable to find habtracker in the list of processes from the operating system, then 
    # nothing is actually running (duh).  We can't change the daemonstatusfile, because normally this script is run under the www-data user, not the eosstracker user.  The 
    # daemonstatusfile is created/saved/updated by the backend process, habtracker-daemon.py, which is invoked through 'sudo' as the eosstracker user.  So we can only update the
    # status we send back (i.e print out) to the caller
    if not habproc_isrunning and active:

        # set the "active" JSON key to 0...because the backend processes are not running
        status["active"] = 0

        # set the GPS status to default/blank
        status["gps"] = defaultgpsjson

    # Finally, print out JSON for the status
    print(json.dumps(status))


## Call the main function 
if __name__ == '__main__':
    main()
