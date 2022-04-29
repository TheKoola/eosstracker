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


    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();
    
    // For future use...
    $prediction_type = "predicted"; 
    
    
    // Check the flightid HTML GET variable
    $formerror = false;
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true;


    // If the flightid wasn't given then exit.
    if ($formerror == true) {
        printf ("[]");
        return 0;
    }

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## Determine how many seconds have elapsed since the last packet from the flight.
    $query = "select
        f.flightid,
        extract(epoch from (now() - max(a.tm))) as secs

        from
        packets a,
        flights f,
        flightmap fm

        where
        f.flightid = $1
        and fm.flightid = f.flightid
        and a.callsign = fm.callsign
        and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)

        group by
        f.flightid
    ;";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($get_flightid),
        sql_escape_string($config["lookbackperiod"] . " minute")
    ));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $rows = sql_fetch_all($result);
    $seconds_since_last_packet = $rows[0]['secs'];

    # If the last packet from the flight is older than the lookback period, then we just return.  
    # We don't want to display landing predictions for older stuff.
    if ($seconds_since_last_packet > $config["lookbackperiod"] * 60) {
        printf ("[]");
        sql_close($link);
        return 0;
    }

    
    ## get the latest time to live
    $query = "select distinct 
            dt.thetime,
            extract(epoch from now() - dt.thetime) as lastsecs,
            dt.flightid,
            dt.callsign,
            lp.ttl
 
        from (
            select
                fl.flightid,
                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                a.callsign, 
                a.symbol, 
                rank () over (
                    partition by fl.flightid order by 
                        case
                            when a.raw similar to '%[0-9]{6}h%' then 
                                date_trunc('second', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                            else
                                date_trunc('second', a.tm)::time without time zone
                        end desc
                    ) as rank
        
            from 
                packets a,
                flightmap fm,
                flights fl
        
            where 
                a.location2d != ''
                and a.altitude > 0
                and fm.flightid = fl.flightid
                and a.callsign = fm.callsign 
                and fl.active = 't'
                and fl.flightid = $2 
                and a.tm > (now() - (to_char(($3)::interval, 'HH24:MI:SS'))::time)  
                
        ) as dt 
        left outer join
        (
            select
                max(l.tm) as thetime,
                l.flightid,
                l.callsign,
                l.ttl
                
            from
                landingpredictions l

            where
                l.tm > now() - time '00:05:00'
                and l.ttl is not null

            group by
                l.flightid,
                l.callsign,
                l.ttl

            order by
                thetime,
                l.flightid,
                l.callsign

        ) as lp
        on dt.flightid = lp.flightid and dt.callsign = lp.callsign

        where rank = 1

        order by
            dt.flightid,
            dt.thetime desc,
            dt.callsign
        limit 1; ";
    $result = pg_query_params($link, $query, array(
        sql_escape_string($config['timezone']),
        sql_escape_string($get_flightid), 
        sql_escape_string($config["lookbackperiod"] . " minute")));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $firsttimeinloop = 1;
    while ($row = sql_fetch_array($result)) {
        $thetime = $row['thetime'];
        $flightid = $row['flightid'];
        $lastsecs = $row['lastsecs'];

        # If it's been > 120 seconds since the last heard packet, then we subtract that time from the time-to-live value. 
        # This accounts for the case where we haven't heard a packet from a beacon for xx minutes, but obviously the flight is still descending.
        $ttl = $row['ttl'] - ($lastsecs > 120 ? $lastsecs : 0);
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
        printf ("{ \"flightid\" : %s, \"time\" : %s, \"ttl\" : %s }", 
            json_encode($flightid), 
            json_encode($thetime), 
            json_encode(($ttl <= 0 ? "n/a" : floor($ttl/60.0)))
        ); 
    }

    if (sql_num_rows($result) <= 0)
        printf("[]");

    sql_close($link);


?>
