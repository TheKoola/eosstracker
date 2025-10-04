<?php
/*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2025, Jeff Deaton (N0JD)
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


    //header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include_once $documentroot . '/common/functions.php';

    /************
     * getTrackersFromDB
     *
     * Read from the backend database to get a list of tactical teams and the trackers associated with them.
     *
     * Arguments:  
     *     accepts an optional flightid argument that will narrow the returned results to those trackers that are 
     *     assigned to that particular flight.
     ***********/
    function getTrackersFromDB(string $flightid = null, bool $keep_db_open = false): ?object {

        // connect to the database
        $link = connect_to_database();
        if (!$link) {
            return null;
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
         ($flightid == "" ? "" : " and t.flightid = $1 ") .  

         "order by 
         t.tactical asc,
         tm.callsign asc
         ;";

        if ($flightid == "")
            $result = pg_query($link, $query);
        else 
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));

        if (!$result) {
            db_error(sql_last_error());

            // close the database connection if we weren't provided an existing connection
            if (!$keep_db_open)
                sql_close($link);

            // upon error return an empty array
            return Array();
        }

        // close the db connection if we weren't provided an existing connection.
        if (!$keep_db_open)
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
    * delete memcache key
    ***********/
    function deleteTrackerKey(): ?bool {

        // status
        $status = False;

        try {

            // create a new memcache object and connect to the backend daemon
            $memcache = new Memcache;
            $connectionresult = $memcache->connect('localhost', 11211);
            if (!$connectionresult)
                throw new Exception("memcache fail");

            // delete the key from memcache
            $memcache->delete('trackers');

            // close the memcache connection
            $memcache->close();
            $status = True;

        } catch (Exception $e) {

            // close the memcache object, just in case
            $memcache->close();
        }

        return $status;
    }


    /************
    * Wrapper function that will read the trackers list from memcache if it exists or from the backend postgresql database if not.
    ***********/
    function getTrackers(): ?object {

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
                $js = getTrackersFromDB();
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
            $js = getTrackersFromDB();
            $cache_status = "exception:  " . $e;
        }

        // if there was a timestamp and a trackers key returned...
        if (property_exists($js, "timestamp") && property_exists($js, "trackers")) {

            // add the cache status key/value pair
            $js->memcache_status = $cache_status;

            return $js;
        }
        else
            return null;
    }


    /****************
     * deletes a tracker from the backend trackers database table.
     ****************/
    function deleteTracker($callsign): ?bool {
        // Connect to the database
        $link = connect_to_database();
        if (!$link) {
            return False;
        }

        // delete this callsign from the trackers table 
        $query = "delete from trackers where callsign=$1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($callsign)));
        if (!$result) {
            sql_close($link);
            return False;
        }
        sql_close($link);

        return True;
    }


    /************
     * insertTracker
     *
     * This will insert a tracker into the backend database
     *
     ************/
    function insertTracker(string $callsign, string $team, string $notes): ?object {

        // the object we return
        $obj = new stdClass();
        $obj->result = 0;
        $obj->error = "";

        // Connect to the database
        $link = connect_to_database();
        if (!$link) {
            $obj->error = json_encode(sql_last_error());
            return $obj;
        }

        $query = "insert into trackers (callsign, tactical, notes) values (upper(btrim($1)), $2, $3);";
        $result = pg_query_params($link, $query, array(sql_escape_string($callsign), sql_escape_string($team), sql_escape_string($notes)));
        if (!$result) {
            $obj->error = json_encode(sql_last_error());
            sql_close($link);
            return $obj;
        }

        // if we're here then the insertion was successful.
        $obj->result = 1;
        $obj->error = "";

        // close the DB connection
        sql_close($link);

        return $obj;
    }



    /************
    * update the tactical team that a tracker is assigned too
    ***********/
    function changeTrackerTeam($callsign, $tactical): ?bool {

        // Connect to the database
        $link = connect_to_database();
        if (!$link) {
            return False;
        }

        // update which tactical team this tracker is assigned too
        $query = "update trackers set tactical=$1 where callsign=$2;";
        $result = pg_query_params($link, $query, array(sql_escape_string($tactical), sql_escape_string($callsign)));
        if (!$result) {
            sql_close($link);
            return False;
        }

        // close the DB connection
        sql_close($link);

        return True;
    }

?>
