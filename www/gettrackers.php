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

    // Check the flightid HTML GET variable
    //$get_flightid = "";
    //if (isset($_GET["flightid"])) 
    //    $get_flightid = strtoupper(check_string($_GET["flightid"], 20));


    /************
     * getTrackers
     *
     * Read from the backend database to get a list of tactical teams and the trackers associated with them.
     *
     * Arguments:  
     *     accepts an optional flightid argument that will narrow the returned results to those trackers that are 
     *     assigned to that particular flight.
     ***********/
    function getTrackers(string $flightid = null): ?object {

        // Connect to the database
        $link = connect_to_database();
        if (!$link) {
            db_error(sql_last_error());
            return 0;
        }

        // SQL query to get the list of trackers and teams
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
         tm.tactical = t.tactical " .
         ($flightid == "" ? "" : " and t.flightid = $1 ")  .

         "order by 
         t.tactical asc,
         tm.callsign asc
         ;";

        if ($flightid == "")
            $result = sql_query($query);
        else 
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));

        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);

            // upon error return an empty array
            return Array();
        }

        // close the db connection
        sql_close($link);

        $trackerjson = [];
        $teams = [];
        while ($row = sql_fetch_array($result)) {
            $trackers[$row["tactical"]][] = array("tactical" => $row['tactical'], "callsign" => $row['callsign'], "notes" => $row['notes']);
            $teams[$row["tactical"]] = $row["flightid"];
        }

        foreach ($trackers as $tactical => $ray) {

            $trackers = [];
            foreach ($ray as $k => $list) {

                // add this tracker entry to the trackers list
                $trackers[] = Array(
                    //"tactical" => $list["tactical"],
                    "callsign" => $list["callsign"],
                    "notes" => ($list["notes"] == "" ? "n/a" : $list["notes"])
                );
            }

            // add entry to json array
            $trackerjson[] = Array(
                "tactical" => $tactical,
                "flightid" => $teams[$tactical],
                "trackers" => $trackers
            );
        }

        $json = Array(
            "timestamp" => microtime(true),
            "trackers" => $trackerjson
        );
        return (object) $json;
    }




     /************
     * main code below
     ***********/

    // where we'll store the results
    $js = new stdClass();

    // status of our memcache attempt
    $cache_status = null;

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the key from memcache
        $getresult = $memcache->get('trackers');
        if ($getresult) {

            // convert the returned JSON to a PHP object
            $js = json_decode($getresult, false);
            $cache_status = "cache hit";
        }
        else {
            // cache miss.  Now get the list of trackers from the backend
            $js = getTrackers();
            $cache_status = "cache miss";

            // now add this to memcache with a TTL of 900 seconds.
            $memcache->set('trackers', json_encode($js), false, 900);
        }

        // close the memcache connection.
        $memcache->close();

    } catch (Exception $e) {

        // close the memcache object, just in case
        $memcache->close();

        // get the list of trackers from the backend
        $js = getTrackers();
        $cache_status = "exception:  " . $e;
    }

    // add the cache status key/value pair
    $js->memcache_status = $cache_status;

    // print out results
    printf("%s", json_encode($js));

?>
