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

    ############################################
    ## function to determine if a given date is under daylight saving time, returns true or false
    # arguments:
    # $somedate - string in a typical format, Y-m-d
    function isDaylightSaving($somedate) {

        $thedate = date('Y-m-d HH:MM:SS', strtotime($somedate));
        $year = date('Y', strtotime($somedate));
        $start_of_dst = date('Y-m-d 02:00:00', strtotime('Second Sunday Of March ' . $year));
        $end_of_dst = date('Y-m-d 02:00:00', strtotime('First Sunday Of November ' . $year));

        if ($thedate > $start_of_dst && $thedate < $end_of_dst)
            return True;

        return False;
    }

    ############################################
    ## Function to compare two packet array rows
    function comparePacket($a, $b) {

        if ($a->receivetime > $b->receivetime)
            return 1;
        else if ($a->receivetime < $b->receivetime)
            return -1;
        else
            return 0;
    }



    ############################################
    ## Function to get all of the packets for a bunch of flights.
    function getAnalysisPackets($fid) {

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

        # the number of flights returned
        $num_flights = sizeof($jsondata);

        ## get any packets from flights specified with the JSON file
        $query = "select
            array_to_json(array_agg(k)) as json

        from (

            select distinct on (h.info)
                h.info,
                h.thetime as receivetime,
                h.packet_time as packettime,
                h.callsign,
                h.raw,
                h.bearing,
                h.speed_mph,
                h.altitude as altitude_ft,
                h.latitude as lat_deg,
                h.longitude as lon_deg,
                case when extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) > 0 then
                    round(((h.altitude - h.previous_alt) / extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))))::numeric)
                else
                    0
                end as vert_rate_fts,
                case when extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) > 0 then
                    round((60 * (h.altitude - h.previous_alt) / extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))))::numeric)
                else
                    0
                end as vert_rate_ftmin,
                case when extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) > 0 then
                    round(cast((h.latitude - h.previous_lat) / extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) as numeric), 10)
                else
                    0
                end as lat_rate_deg,
                case when extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) > 0 then
                    round(cast((h.longitude - h.previous_lon) / extract ('epoch' from (h.packet_time - lag(h.packet_time, 1) over (order by h.packet_time))) as numeric), 10)
                else
                    0
                end as lon_rate_deg,
                h.temperature_k,
                round((h.temperature_k - 273.15), 2) as temperature_c,
                round((h.temperature_k - 273.15) * 9 / 5 + 32, 2) as temperature_f,
                h.pressure_pa,
                round(h.pressure_pa / 101325, 4) as pressure_atm

            from (
                select
                    date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                    case
                        when a.raw similar to '%[0-9]{6}h%' then
                            date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                        else
                            date_trunc('milliseconds', a.tm)::time without time zone
                    end as packet_time,
                    a.callsign,
                    substring(a.raw from position(':' in a.raw)+1) as info,
                    a.raw,
                    round(a.bearing) as bearing,
                    round(a.speed_mph,0) as speed_mph,
                    round(a.altitude,0) as altitude,
                    cast(st_y(a.location2d) as numeric(12,8)) as latitude,
                    cast(st_x(a.location2d) as numeric(12,8)) as longitude,
                    lag(cast(st_y(a.location2d) as numeric(12,8)), 1) over (order by a.tm) as previous_lat,
                    lag(cast(st_x(a.location2d) as numeric(12,8)), 1) over (order by a.tm) as previous_lon,
                    lag(round(a.altitude, 0), 1) over (order by a.tm) as previous_alt,
                    case when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                        round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                    else
                        NULL
                    end as temperature_k,
                    case
                        when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                            round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                        else
                            NULL
                    end as pressure_pa

                from
                    packets a

                where
                    a.location2d != ''
                    and a.tm > $2 and a.tm < $3
                    and a.altitude > 0
                    and a.callsign = $4

                order by
                    a.tm asc
                ) as h

            order by
                h.info

            ) as k
        ;"
        ;


        printf("[");
        $first = true;
        foreach ($jsondata as $datarow) {

            $starttime = $datarow["day"] . " 00:00:00";
            $endtime = $datarow["day"] . " 23:59:59";
            $callsign_list = "{" . implode(", ", $datarow["beacons"]) . "}";
            $flightname = $datarow["flight"];
            $flightid = str_replace("EOSS-", "", $flightname);

            # check if there was a specific flightid that we should query, otherwise query all flights 
            if ($fid == "" || strtolower($fid) == strtolower($flightname)) {

                # check if the flight was within daylight saving time when it was flown.  If so, then we set the timezone (for the SQL query)
                # to be 'MDT'.  Otherwise, just use standard time, 'MST'.
                $timezone = "MST";
                if (isDaylightSaving($starttime))
                    $timezone = "MDT";

                # all returned rows for this flight
                $allrows = [];
                
                # Loop through each callsign, getting packets
                foreach ($datarow["beacons"] as $call) {
                    $result = pg_query_params($link, $query, array($timezone, $starttime, $endtime, $call))
                        or die(pg_last_error());

                    $numrows = sql_num_rows($result);
                    if ($numrows > 0) {
                        $rows = sql_fetch_all($result);

                        # the resulting packets for this callsign
                        $ray = json_decode($rows[0]["json"]);

                        # make sure we've got valid data before trying to merge it into the entire batch for the flight
                        if (is_array($ray)) {
                            if (sizeof($ray) > 0)
                                # merge these results with those from other callsigns on this flight.
                                $allrows = array_merge($allrows, $ray);
                        }
                    }
                }

                # only do something if there were rows returned.
                if (sizeof($allrows) > 0) {

                    # if this the first time through the loop, then don't print a comma
                    if ($first)
                        $first = false;
                    else
                        printf(",");

                    # sort the packets
                    usort($allrows, "comparePacket");

                    # construct the array that will be converted to JSON and printed to the browser.
                    $json_result = array(
                        "flightname" => $flightname,
                        "flightnumber" => $flightid,
                        "packets" => $allrows,
                        "timezone" => $timezone,
                        "launchdate" => $datarow["day"],
                        "beacons" => $datarow["beacons"],
                        "balloonsize_gm" => str_replace("gm", "", $datarow["balloonsize"]),
                        "liftfactor" => $datarow["liftfactor"],
                        "h2fill_scf" => $datarow["h2fill"],
                        "weights_lbs" => $datarow["weights"]
                    );

                    # send JSON to the browser
                    printf("%s", json_encode($json_result, JSON_NUMERIC_CHECK));
                }

            } // if ($fid == "" || strtolower($fid) == strtolower($flightname)) {
        }
        printf("]");

        // close the database connection
        sql_close($link);
    }


    ####################################################
    # main code
    ####################################################

    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        $get_flightid = strtoupper(check_string($_GET["flightid"], 20));
    }


    // get the analysis packets
    getAnalysisPackets($get_flightid);

?>

