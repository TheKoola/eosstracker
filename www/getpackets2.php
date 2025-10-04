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
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    // query to return a list of packets for all active flight beacons as well as the latest packets from any trackers
    function getPackets($dblink, $lookback) {

        // where we'll store the output
        $output = null;

        // check that the lookback period is something valid...should be a text value indicating the number of minutes 
        if (!$lookback)
            $lookback = "180";

        // query packets from flights, trackers, etc...
        $query = "
            select 
                jsonb_build_object(
                    'type', 'FeatureCollection',
                    'features', jsonb_agg(st_asgeojson(j.*, 'location2d')::jsonb)
                ) as features
            from 
                (
                select 
                    b.*

                from 
                (
                   (
                   select 
                        p.*,
                        null as dense_rank
                    
                    from 
                        packets p,
                        flights f,
                        flightmap fm

                    where
                        p.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                        and p.raw != ''
                        and fm.flightid = f.flightid
                        and p.callsign = fm.callsign
                        and f.active = 'y'

                        --p.tm > '2025-03-23 00:00:00' 
                        --and p.tm < '2025-03-23 10:00:00' 
                        --and p.tm < '2025-03-23 08:15:00'
                        --and p.tm < '2025-03-23 08:07:00'
                        --and p.tm < '2025-03-23 07:49:00'
                        --and p.raw != ''
                        --and p.callsign in ('KC0D-3', 'AE0SS-4')
                        --and fm.flightid = f.flightid
                        --and p.callsign = fm.callsign
                        --and f.flightid = 'EOSS-369'

                    order by
                        p.tm asc
                    )

                    union

                    (
                    select 
                    q.*

                    from (
                        select 
                            a.*,
                            dense_rank() over (partition by a.callsign order by a.tm desc)

                        from 
                            packets a
                            left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign,
                            teams t,
                            trackers tr

                        where
                            b.callsign is null
                            and a.location2d != ''
                            and a.raw != ''
                            and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                            and case
                                when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                                    a.callsign  = tr.callsign
                                else
                                    a.callsign like tr.callsign || '-%'
                            end
                            and t.tactical != 'ZZ-Not Active'
                            and tr.tactical = t.tactical 

                        order by 
                            a.tm asc
                        ) as q

                    where
                        q.dense_rank = 1

                    order by
                        q.tm asc
                    )

                )  as b

                order by 
                    b.tm asc
                ) as j
                ;
        ";

        $result = pg_query_params($dblink, $query, array(
            sql_escape_string($lookback . " minute")
        ));

        if ($result) {
            $rows = pg_fetch_all($result);
            $data = json_decode($rows[0]["features"], false);
            $data->properties = new stdClass();
            $data->properties->name = "recent packets";
            $output = $data;
        }

        return $output;
    }


    // ********************************
    // main 
    // ********************************

    ## Connect to the database
    $link = connect_to_database();

    // get flight and tracker packets
    $packets = getPackets($link, $config["lookbackperiod"]);

    // send JSON to the browser
    if ($packets)
        printf("%s", json_encode($packets));
    else
        printf("{}");

    sql_close($link);
?>
