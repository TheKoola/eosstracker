<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020, Jeff Deaton (N6BA)
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
*
 */


    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


    function fetchTrackers() {

        ## Connect to the database
        $link = connect_to_database();
        if (!$link) {
            db_error(sql_last_error());
            return 0;
        }


        $query = "select
         t.tactical,
         tm.callsign,
         tm.notes, 
         case
             when t.flightid = '' or t.flightid is null then 'At Large'
             else t.flightid
         end as flightid

         from
         teams t,
         trackers tm
       
         where
         tm.tactical = t.tactical

         order by 
         t.tactical asc,
         tm.callsign asc
         ;";

        $result = sql_query($query);

        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }

        $trackers = [];
        $teams = [];
        $trackerjson = [];

        while ($row = sql_fetch_array($result)) {
            $trackers[$row["tactical"]][] = array("tactical" => $row['tactical'], "callsign" => $row['callsign'], "notes" => $row['notes']);
            $teams[$row["tactical"]] = $row["flightid"];
        }

        foreach ($trackers as $tactical => $ray) {
            $trackerlist = [];
            foreach ($ray as $k => $list) {
                $trackerlist[] = array(
                    "tactical" => $list["tactical"],
                    "callsign" => $list["callsign"],
                    "notes" => $list["notes"]
                );
            }

            $trackerjson[] = array(
                "tactical" => $tactical,
                "flightid" => $teams[$tactical],
                "trackers" => $trackerlist
            );
        }

        sql_close($link);

        return $trackerjson;
    }



    #######################################################
    # main code
    #######################################################

    // where we'll store the results
    $js = [];

    try {

	//phpinfo();

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
	$connectionresult = $memcache->connect('localhost', 11211);
	if (!$connectionresult) 
	    throw new Exception("memcache fail");

        // attempt to get the tracker_definitions key from memcache
        $getresult = $memcache->get('tracker_definitions');
        if ($getresult) {
            $js = json_decode($getresult);
        }
        else {
            // cache miss.  Now get the tracker definitions from the backend database
            $js = fetchTrackers();

            // now add this to memcache with a TTL of 300 seconds
            $memcache->set('tracker_definitions', json_encode($js), false, 310);
        }
    } catch (Exception $e) {
        // Connect to the database and get the tracker definition list
        $js = fetchTrackers();
    }


    // print out results
    printf("%s", json_encode($js));

?>


