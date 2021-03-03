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
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    # This is the context...set this to "false" for using self signed certs.
    $context = stream_context_create( [
        'ssl' => [
        'verify_peer' => true,   # Set to false for testing with self-signed certs
        'verify_peer_name' => true,   # Set to false for testing with self-signed certs
        ],
    ]);
    

/*********************
 *
 * Function to download full packet data.
 *
 *********************/
function getPacketData($packets_url) {

    global $context;

    # Get the URL
    $url_data = file_get_contents($packets_url, false, $context);

    # Check the returned value
    if ($url_data === False) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"No data returned from track.eoss.org\"}");
        return 0;
    }

    # decode the JSON
    $jsondata = json_decode($url_data, True);

    # Check the JSON validity
    if (json_last_error() != JSON_ERROR_NONE) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"Invalid data returned from track.eoss.org: %s\"}", json_last_error_msg());
        return 0;
    }

    # Make sure the returned data is an array...we're expecting an array of packets to be returned.
    if (!is_array($jsondata)) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"Invalid data returned from track.eoss.org: %s\"}", json_last_error_msg());
        return 0;
    }


    if (count($jsondata) > 0) {

        ## Connect to the database
        $link = connect_to_database();
        if (!$link) {
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode("Unable to connect to the backend database: " . sql_last_error()));
            return 0;
        }

        $droptable = "drop table if exists incoming;";
        $createtable = "create table incoming as table packets with no data; alter table incoming add primary key (tm, source, channel, callsign, hash);";

        $drop_result = pg_query($link, $droptable);
        if (!$drop_result) {
            #db_error(sql_last_error());
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        $create_result = pg_query($link, $createtable);
        if (!$create_result) {
            #db_error(sql_last_error());
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        $insert = "insert into incoming(
            tm,
            callsign,
            symbol,
            speed_mph,
            bearing,
            altitude,
            comment,
            location2d,
            location3d,
            raw,
            ptype,
            hash,
            source,
            channel,
            frequency)
           
            values(
                 $1, 
                 $2, 
                 nullif($3, ''),
                 $4, 
                 $5, 
                 $6, 
                 nullif($7, ''),
                 case when $8 = '' then
                     null
                 else
                     st_geomfromtext($9, 4326)
                 end,
                 case when $10 = ''  then
                     null
                 else
                     st_geomfromtext($11, 4326)
                 end,
                 nullif($12, ''),
                 nullif($13, ''),
                 nullif($14, ''),
                 nullif($15, ''),
                 -1,
                 NULL
            )
        ;";
 
        foreach ($jsondata as $datarow) {
            $insert_result = pg_query_params($link, $insert, array(
                pg_escape_string($datarow["tm"]),
                pg_escape_string($datarow["callsign"]),
                pg_escape_string($datarow["symbol"]),
                $datarow["speed_mph"],
                $datarow["bearing"],
                $datarow["altitude"],
                pg_escape_string($datarow["comment"]),
                pg_escape_string($datarow["location2d"]),
                pg_escape_string($datarow["location2d"]),
                pg_escape_string($datarow["location3d"]),
                pg_escape_string($datarow["location3d"]),
                pg_escape_string($datarow["raw"]),
                pg_escape_string($datarow["ptype"]),
                pg_escape_string($datarow["hash"]),
                pg_escape_string($datarow["source"])
            ));

            if (!$insert_result) {
                db_error(sql_last_error());
                printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }

        }

        // Now run the query to insert rows from "incoming" into packets
        $update_query = "
            insert into packets
            select 
            i.* 

            from
            incoming i left outer join packets a on i.callsign = a.callsign and i.hash = a.hash and i.tm::date = a.tm::date

            where
            a.callsign is null

            order by
            i.tm asc

            on conflict do nothing
            ;
        ";

        $update_result = pg_query($link, $update_query);
        if (!$update_result) {
            #db_error(sql_last_error());
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        // Number of rows that were inserted
        $affected_rows = pg_affected_rows($update_result);

        // success
        printf ("{ \"result\" : 1, \"packets\" : %s, \"error\": \"Database updated with %d packets.\" }", json_encode($affected_rows), json_encode($affected_rows));
        sql_close($link);
    }
    else
        printf ("{ \"result\" : 0, \"packets\" : 0, \"error\": \"no data returned from track.eoss.org\" }");
}

# This will download only packet hashes and then compare with the existing packet data to determine if there are gaps.
# Returns:  true if there are packets missing
#           false if all packets are present in the database or some other error occured
function checkPacketData($hashurl) {

    global $context;

    # Get the URL
    $url_data = file_get_contents($hashurl, false, $context);
    #printf ("\nGetting contents from, %s:  %s\n", $hashurl, $url_data);

    # Check the returned value
    if ($url_data === False) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"No data returned from track.eoss.org\"}");
        return 0;
    }

    # decode the JSON
    $jsondata = json_decode($url_data, True);

    # Check the JSON validity
    if (json_last_error() != JSON_ERROR_NONE) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"Invalid data returned from track.eoss.org: %s\"}", json_last_error_msg());
        return 0;
    }

    # Make sure the returned data is an array...we're expecting an array of packets to be returned.
    if (!is_array($jsondata)) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"Invalid data returned from track.eoss.org: %s\"}", json_last_error_msg());
        return 0;
    }

    if (count($jsondata) > 0) {

        ## Connect to the database
        $link = connect_to_database();
        if (!$link) {
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode("Unable to connect to the backend database: " . sql_last_error()));
            return 0;
        }

        $droptable = "drop table if exists incoming;";
        $createtable = "create table incoming (tm timestamp with time zone, callsign text, hash text); alter table incoming add primary key (tm, callsign, hash);";

        $drop_result = pg_query($link, $droptable);
        if (!$drop_result) {
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        $create_result = pg_query($link, $createtable);
        if (!$create_result) {
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        $insert = "insert into incoming(
            tm,
            callsign,
            hash
            )
           
            values(
                 $1, 
                 $2, 
                 nullif($3, '')
            )
        ;";
 
        foreach ($jsondata as $datarow) {
            $insert_result = pg_query_params($link, $insert, array(
                pg_escape_string($datarow["tm"]),
                pg_escape_string($datarow["callsign"]),
                pg_escape_string($datarow["hash"])
            ));

            if (!$insert_result) {
                printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }

        }

        // Now run the query to check rows from "incoming" compared packets
        $check_query = "
            select 
            i.* 

            from
            incoming i left outer join packets a on i.callsign = a.callsign and i.hash = a.hash and i.tm::date = a.tm::date

            where
            a.callsign is null

            order by
            i.tm asc
            ;
        ";

        $check_result = pg_query($link, $check_query);
        if (!$check_result) {
            printf ("{\"result\": 0, \"packets\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        # Close the database connection
        sql_close($link);

        return sql_num_rows($check_result);

    }
    else {
        printf ("{ \"result\" : 0, \"packets\" : 0, \"error\": \"no data returned from track.eoss.org\" }");
        return 0;
    }
}


    # The URL
    $hashes_url = "https://track.eoss.org/getpackethashes.php";
    $fullpackets_url = "https://track.eoss.org/getpackets.php";

    # Get HTML headers by trying to load the URL 
    $file_headers = get_headers($hashes_url, 0, $context);

    # Check if successful
    if(!$file_headers || $file_headers[0] == 'HTTP/1.1 404 Not Found') 
        $exists = false;
    else 
        $exists = true;

    if (!$exists) {
        printf ("{\"result\": 0, \"packets\": 0, \"error\": \"Unable to contact track.eoss.org\"}");
        return 0;
    }

    # Determine if there are packets missing
    $ret = checkPacketData($hashes_url);

    # if there are packets missing then download the full data and update this database
    if ($ret)  {
        $r = getPacketData($fullpackets_url);
    }

?>


