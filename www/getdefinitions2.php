<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019-2025 Jeff Deaton (N0JD)
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
    include_once $documentroot . '/common/functions.php';
    //include_once $documentroot . '/common/trackers.php';

    $config = readconfiguration();

    // query to return an object with active tracker definitions
    function getTrackers($dblink) {

        // where we'll store the output
        $output = new stdClass();

        // query flight definitions
        $query = "
            select 
                jsonb_agg(p.*) as trackers

            from 
            (
                select
                    tm.tactical,
                    tm.callsign,
                    tm.notes

                from
                    trackers tm 

                where
                    tm.tactical != 'ZZ-Not Active'

                order by 
                    tm.tactical asc,
                    tm.callsign asc
            ) as p;";

        // execute the query
        $result = pg_query($dblink, $query);

        // if the query was successful
        if ($result) {
            $rows = sql_fetch_all($result);
            $data = json_decode($rows[0]["trackers"], false);
            $output->type = "trackers";
            $output->data = $data;
        }

        return $output;
    }


    
    // query to return an object with flight definitions
    function getFlights($dblink) {

        // where we'll store the output
        $output = new stdClass();

        // query flight definitions
        $query = "
            select 
                jsonb_agg(p.*) as flights

            from 
            (
                select 
                    f.flightid, 
                    fm.callsign, 
                    fm.location as beacon_location, 
                    fm.freq as frequency, 
                    f.active, 
                    f.description,
                    f.launchsite,
                    l.lat as launch_latitude,
                    l.lon as launch_longitude,
                    l.alt as launch_altitude

                from 
                flights f left outer join flightmap fm 
                    on fm.flightid = f.flightid,
                    launchsites l

                where 
                    l.launchsite = f.launchsite
                    and f.active = true

                order by 
                    f.active desc,
                    f.flightid desc, 
                    f.thedate desc, 
                    fm.callsign asc

                ) as p
                ;
        "; 

        // execute the query
        $result = pg_query($dblink, $query);

        // if the query was successful
        if ($result) {
            $rows = sql_fetch_all($result);
            $data = json_decode($rows[0]["flights"], false);
            $output->type = "flights";
            $output->data = $data;
        }

        return $output;
    }


    // ********************************
    // main 
    // ********************************

    ## Connect to the database
    $link = connect_to_database();

    if ($link) {

        // get flight and tracker packets
        $flights = getFlights($link);
        $trackers = getTrackers($link);

        // merge the results
        $results = new stdClass();
        $results->flights = $flights;
        $results->trackers = $trackers;

        // send JSON to the browser
        printf("%s", json_encode($results));

        sql_close($link);
    }
?>
