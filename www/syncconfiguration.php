<?php
/*
*
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
*
 */

    header("Content-Type:  application/json;");
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    # This section determines if the track.eoss.org is accessible.
    # Specify that we don't care about self-signed SSL certs
    $context = stream_context_create( [
        'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        ],
    ]);

    # The URL
    $track_url = "https://track.eoss.org/getconfiguration.php";

    # Get HTML headers by trying to load the URL 
    $file_headers = get_headers($track_url, 0, $context);

    # Check if successful
    if(!$file_headers || $file_headers[0] == 'HTTP/1.1 404 Not Found') 
        $exists = false;
    else 
        $exists = true;

    if (!$exists) {
        printf ("{\"result\": 0, \"error\": \"Unable to contact track.eoss.org\"}");
        return 0;
    }

    # Get the URL
    $url_data = file_get_contents($track_url);

    # Check the returned value
    if ($url_data === False) {
        printf ("{\"result\": 0, \"error\": \"No data returned from track.eoss.org\"}");
        return 0;
    }

    # decode the JSON
    $data = json_decode($url_data, True);

    # Check the JSON validity
    if (json_last_error() != JSON_ERROR_NONE) {
        printf ("{\"result\": 0, \"error\": \"Invalid data returned from track.eoss.org: %s\"}", json_last_error_msg());
        return 0;
    }

    # Reset the execution time limit
    set_time_limit(30);

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }


    ###### Loop through each record and update the database ####
    #
    #
    #
    if (array_key_exists("flights", $data)) {
        # Flights table:
        #                  Table "public.flights"
        #   Column    |  Type   | Collation | Nullable | Default
        #-------------+---------+-----------+----------+---------
        # flightid    | text    |           | not null |
        # description | text    |           |          |
        # thedate     | date    |           |          |
        # active      | boolean |           |          |
        # launchsite  | text    |           |          |
        #

        # SQL for setting all flights to inactive
        $update_sql = "update flights set active=false;";

        # Execute the query
        $result = pg_query($link, $update_sql);
        if (!$result) {
            printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }

        # Loop through each item
        foreach ($data["flights"] as $flight) {
            
            # SQL for inserting or updating the record
            $insert_sql = "insert into flights (flightid, description, thedate, active, launchsite) values ($1, $2, $3, $4, $5)
               on conflict (flightid) do update
               set description = $2, thedate = $3, active = $4, launchsite = $5;";
            
            # if the active value is null, then it to "false"
            if ($flight["active"] == "")
                $flight["active"] = "false";

            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($flight["flightid"]),
                sql_escape_string($flight["description"]),
                sql_escape_string($flight["thedate"]),
                sql_escape_string($flight["active"]),
                sql_escape_string($flight["launchsite"]),
            ));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }

    if (array_key_exists("flightmap", $data)) {
        #
        #              Table "public.flightmap"
        #  Column  |  Type   | Collation | Nullable | Default
        #----------+---------+-----------+----------+---------
        # flightid | text    |           | not null |
        # callsign | text    |           | not null |
        # location | text    |           |          |
        # freq     | numeric |           |          |

        # Loop through each item
        foreach ($data["flightmap"] as $flight) {
            
            # SQL for inserting or updating the record
            $insert_sql = "insert into flightmap (flightid, callsign, location, freq) values ($1, $2, $3, $4)
               on conflict (flightid, callsign) do update
               set location = $3, freq = $4;";
            
            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($flight["flightid"]),
                sql_escape_string($flight["callsign"]),
                sql_escape_string($flight["location"]),
                sql_escape_string($flight["freq"])
            ));
            #printf ("%s\n", pg_result_status($result, PGSQL_STATUS_STRING));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }

    if (array_key_exists("freqs", $data)) {
        #
        # Loop through each item
        foreach ($data["freqs"] as $freq) {
            
            # SQL for inserting or updating the record
            $insert_sql = "insert into freqs (freq) values ($1)
               on conflict (freq) do nothing;";
            
            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($freq["freq"])
            ));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }

    if (array_key_exists("launchsites", $data)) {
        #
        #      Table "public.launchsites"
        #   Column   |  Type   | Collation | Nullable | Default
        #------------+---------+-----------+----------+---------
        # launchsite | text    |           | not null |
        # lat        | numeric |           |          |
        # lon        | numeric |           |          |
        # alt        | numeric |           |          |

        # Loop through each item
        foreach ($data["launchsites"] as $site) {
            
            # SQL for inserting or updating the record
            $insert_sql = "insert into launchsites (launchsite, lat, lon, alt) values ($1, $2, $3, $4)
               on conflict (launchsite) do update
               set lat = $2, lon = $3, alt = $4;";
            
            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($site["launchsite"]),
                sql_escape_string($site["lat"]),
                sql_escape_string($site["lon"]),
                sql_escape_string($site["alt"])
            ));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }


    if (array_key_exists("teams", $data)) {
        #
        #               Table "public.teams"
        #  Column  | Type | Collation | Nullable | Default
        #----------+------+-----------+----------+---------
        # tactical | text |           | not null |
        # flightid | text |           |          |

        # Loop through each item
        foreach ($data["teams"] as $team) {
            
            # SQL for inserting or updating the record
            $insert_sql = "insert into teams (tactical, flightid) values ($1, NULLIF($2, ''))
               on conflict (tactical) do update
               set flightid = NULLIF($2, '');";

            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($team["tactical"]),
                sql_escape_string($team["flightid"])
            ));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }


    if (array_key_exists("trackers", $data)) {
        #
        #             Table "public.trackers"
        #  Column  | Type | Collation | Nullable | Default
        #----------+------+-----------+----------+---------
        # callsign | text |           | not null |
        # tactical | text |           |          |
        # notes    | text |           |          |

        # Move all trackers to the ZZ-Not Active team.
        if (sizeof($data["trackers"]) > 0) {

            # SQL for setting each tracker to have a tactical of 'ZZ-Not Active'
            $reset_sql = "update trackers set tactical='ZZ-Not Active';";

            # Execute the SQL query
            $result = pg_query($reset_sql);

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }

        # Loop through each item
        foreach ($data["trackers"] as $tracker) {

            # SQL for inserting or updating the record
            $insert_sql = "insert into trackers (callsign, tactical, notes) values ($1, $2, NULLIF($3, ''))
               on conflict (callsign) do update
               set tactical = $2, notes = NULLIF($3, '');";

            # execute the query
            $result = pg_query_params($link, $insert_sql, array(
                sql_escape_string($tracker["callsign"]),
                sql_escape_string($tracker["tactical"]),
                sql_escape_string($tracker["notes"])
            ));

            # Check the result
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
        }
    }

    printf ("{\"result\": 1, \"error\": \"Update successful\"}");


    sql_close($link);

?>
