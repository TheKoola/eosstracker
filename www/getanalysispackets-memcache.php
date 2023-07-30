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
            select 
                h.thetime as tm,
                h.callsign,
                h.info,
                h.raw

            from (
            select distinct on (y.info)
                y.info,
                y.thetime,
                y.packet_time,
                y.callsign,
                y.source,
                y.raw

                from 
                (
                    select
                        c.thetime,
                        c.packet_time,
                        c.callsign,
                        c.altitude,
                        c.comment,
                        c.symbol,
                        c.speed_mph,
                        c.bearing,
                        c.location2d,
                        c.lat,
                        c.lon,
                        c.temperature_k,
                        c.pressure_pa,
                        c.ptype, 
                        c.hash,
                        substring(c.raw from position(':' in c.raw)+1) as info,
                        c.raw,
                        lag(c.altitude, 1) over(order by c.packet_time)  as previous_altitude,
                        lag(c.lat, 1) over (order by c.packet_time) as previous_lat,
                        lag(c.lon, 1) over (order by c.packet_time) as previous_lon,
                        extract ('epoch' from (c.packet_time - lag(c.packet_time, 1) over (order by c.packet_time))) as delta_secs,
                        extract ('epoch' from (now()::timestamp - c.thetime)) as elapsed_secs,
                        c.sourcename,
                        case when array_length(c.path, 1) > 0 then
                            c.path[array_length(c.path, 1)]
                        else
                            c.sourcename
                        end as heardfrom,
                        c.freq,
                        c.channel,
                        c.source

                        from (
                                select 
                                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                                case
                                    when a.raw similar to '%[0-9]{6}h%' then
                                        date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone 'America/Denver')::time)::time without time zone
                                    else
                                        date_trunc('milliseconds', a.tm)::time without time zone
                                end as packet_time,
                                a.callsign, 
                                a.altitude,
                                a.comment, 
                                a.symbol, 
                                a.speed_mph,
                                a.bearing,
                                a.location2d,
                                cast(ST_Y(a.location2d) as numeric) as lat,
                                cast(ST_X(a.location2d) as numeric) as lon,
                                case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%%' then
                                    split_part(a.raw, '>', 1)
                                else
                                    NULL
                                end as sourcename,
                                round(a.frequency / 1000000.0,3) as freq, 
                                a.channel,

                                -- The temperature (if available) from any KC0D packets
                                case when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                    round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                                else
                                    NULL
                                end as temperature_k,

                                -- The pressure (if available) from any KC0D packets
                                case
                                    when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                        round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                                    else
                                        NULL
                                end as pressure_pa,
                                a.ptype,
                                a.hash,
                                a.raw,
                                a.source,
                                dense_rank () over (partition by 
                                    a.hash,
                                    date_trunc('minute', a.tm)

                                    order by 
                                    a.tm asc,
                                    cast(
                                        cardinality(
                                            (
                                                array_remove(
                                                string_to_array(
                                                    regexp_replace(
                                                        split_part(
                                                            split_part(a.raw, ':', 1),
                                                            '>',
                                                            2),
                                                        ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)',
                                                        '',
                                                        'g'),
                                                    ',',''),
                                                NULL)
                                            )[2:]
                                    ) as int) asc,
                                    a.channel desc
                                ),
                                case when a.raw similar to '%>%:%' then
                                    (array_remove(string_to_array(regexp_replace(
                                                    split_part(
                                                        split_part(a.raw, ':', 1),
                                                        '>',
                                                        2),
                                                    ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)',
                                                    '',
                                                    'g'),
                                                ',',''), NULL))[2:]
                                else
                                    NULL
                                end as path

                                from 
                                packets a

                                where 
                                a.location2d != '' 
                                and a.tm > $1 and a.tm < $2
                                and a.altitude > 0
                                and a.callsign = any ($3)

                                order by a.tm asc

                        ) as c

                        where
                        c.dense_rank = 1
                        and abs(extract('epoch' from (c.thetime::time - c.packet_time::time))) < 120

                    ) as y
                where 
                    case when y.delta_secs > 0 then
                        abs((y.altitude - y.previous_altitude) / y.delta_secs)
                    else
                        0
                    end < 1000
                    and case when y.delta_secs > 0 then
                        abs((y.lat - y.previous_lat) / y.delta_secs)
                    else
                        0
                    end < .04
                    and case when y.delta_secs > 0 then
                        abs((y.lon - y.previous_lon) / y.delta_secs)
                    else
                        0
                    end < .04

                order by
                    y.info
                ) as h

                order by 
                h.thetime asc
            ) as k

            ;
        "; 

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
            $memcache->set('analysispackets', json_encode($js), false, 290);
        }
    } catch (Exception $e) {
        // Connect to the backend and run the python script to determine process status
        $js = getAnalysisPackets();
    }

    // print out results
    printf("%s", json_encode($js));
?>

