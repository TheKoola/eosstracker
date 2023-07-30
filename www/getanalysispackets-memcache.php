<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2023 Jeff Deaton (N6BA)
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
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();


    ## Function to get all of the packets for a bunch of flights.
    function getAnalysisPackets() {

        ## Connect to the database
        $link = connect_to_database();
        if (!$link) {
            db_error(sql_last_error());
            return 0;
        }

        # Get the URL
        $flightlist_url = 'flightlist.json';
        $url_data = file_get_contents($flightlist_url);
        $jsondata = json_decode($url_data, True);

        ## get any packets from active flights over the past several hours.
        $query = "select 
            array_to_json(array_agg(k)) as json

        from (

            select distinct on (h.info)
                h.info,
                h.thetime as tm,
                h.callsign,
                h.raw

            from (
                select
                    date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                    a.callsign,
                    substring(a.raw from position(':' in a.raw)+1) as info,
                    a.raw

                from 
                    packets a

                where 
                    a.location2d != '' 
                    and a.tm > $1 and a.tm < $2
                    and a.altitude > 0
                    and a.callsign = any ($3)

                order by 
                    a.tm asc
                ) as h

            order by 
                h.info

            ) as k
        ;"
        ;

        $json_result = [];


        foreach ($jsondata as $datarow) {

            $starttime = $datarow["day"] . " 00:00:00";
            $endtime = $datarow["day"] . " 23:59:59";
            $callsign_list = "{" . implode(", ", $datarow["beacons"]) . "}";
            $flightname = $datarow["flight"];
            $flightid = strtolower(str_replace("-", "", $flightname));

            $result = pg_query_params($link, $query, array($starttime, $endtime, $callsign_list))
                or die(pg_last_error());

            $numrows = sql_num_rows($result);
            if ($numrows > 0) {
                $rows = sql_fetch_all($result);

                $json_result[$flightid] = array(
                    "flightname" => $flightname,
                    "flightid" => $flightid,
                    "packets" => json_decode($rows[0]["json"])
                );
            }
        }

        // close the database connection
        sql_close($link);

        return $json_result;
    }


    ####################################################
    # main code
    ####################################################

    // where we hold our results
    $js = [];

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the process_status key from memcache
        $getresult = $memcache->get('analysispackets');

        // If the key was found in memcache, then we'll just use that.
        if ($getresult) {
            $js = json_decode($getresult);
        }
        else {
            // cache miss.  Now get the status of the backend processes
            $js = getAnalysisPackets();

            // now add this to memcache with a TTL of 300 seconds
            $memcache->set('analysispackets', json_encode($js), false, 10);
        }
    } catch (Exception $e) {
        // Connect to the backend and run the python script to determine process status
        $js = getAnalysisPackets();
    }

    // print out results
    printf("%s", json_encode($js));
?>

