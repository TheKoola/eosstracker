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

    ###  This will query the database for the n most recent packets.  
    header("Content-Type:  application/json;");
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();


    ## function to calculate the speed betwen two points.
    function calc_speed($lat1, $lon1, $lat2, $lon2, $start, $end) {
        $p = pi()/180;
        $a = 0.5 - cos(($lat2 - $lat1) * $p)/2 + cos($lat1 * $p) * cos($lat2 * $p) * (1 - cos(($lon2 - $lon1) * $p))/2;
        $dist = (12742 * asin(sqrt($a)))*.6213712;

        $time1 = date_create($start);
        $time2 = date_create($end);
        $diff = date_diff($time2, $time1);
        $time_delta = $diff->h + (($diff->i * 60) + $diff->s)/3600; 
        
        // in MPH.. 
        if ($time_delta > 0)
            $speed = abs($dist / $time_delta);
        else
            $speed = 312;
    
        return $speed;
    }



    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    # SQL to determine if the dw_packets table exists
    $dw_packets_sql = "select exists(select * from information_schema.tables where table_name='dw_packets');";

    # We assume that the dw_packets table does not exist by default
    $dw_packets = false;

    # Execute the SQL statement and make sure there wasn't an error
    $result = pg_query($link, $dw_packets_sql);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    # Get the number of rows return...there should be just one.
    $num_rows = pg_num_rows($result);

    # If the number of rows was > 0 then grab them, and check the result
    if ($num_rows > 0) {
        $rows = sql_fetch_all($result);

        # Check of the dw_packets table exists
        if ($rows[0]['exists'] == 't')
            $dw_packets = 1;
        else
            $dw_packets = 0;
    }
    

    # We assume that the receive_level data is not being populated by direwolf
    $use_receive_level = False;

    # if the dw_packets table exists, then check for the existance of the 'receive_level' column
    if ($dw_packets) {
        $query = "select column_name from information_schema.columns where table_name='dw_packets' and column_name='receive_level';";
        $result = sql_query($query);

        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        if (sql_num_rows($result) > 0)
            $use_receive_level = True;
        else
            $use_receive_level = False;
    }

    if ($dw_packets) {
        ## query the last packets from stations...
        $query = "
            select distinct
            g.thetime,
            g.packet_time,
            g.sourcename as callsign,
            g.heardfrom,
            g.comment, 
            g.symbol, 
            g.bearing,
            g.speed_mph,
            g.altitude, 
            g.latitude, 
            g.longitude,
            g.temperature_k,
            g.pressure_pa,
            g.ptype,
            g.freq,
            g.receive_level

            from
            (
                select distinct
                f.thetime,
                f.packet_time,
                f.sourcename,
                f.comment, 
                f.symbol, 
                f.bearing,
                f.speed_mph,
                f.altitude, 
                f.latitude, 
                f.longitude,
                f.temperature_k,
                f.pressure_pa,
                f.ptype,
                f.heardfrom,
                f.freq,
                f.receive_level,
                row_number () over (partition by f.sourcename order by f.thetime desc)

                from 
                (
                        select distinct on (a.hash)
                        a.hash,
                        date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                        case
                            when a.raw similar to '%[0-9]{6}h%' then 
                                date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                            else
                                date_trunc('milliseconds', a.tm)::time without time zone
                        end as packet_time,
                        a.sourcename, 
                        a.comment, 
                        a.source_symbol as symbol, 
                        a.bearing,
                        a.speed_mph,
                        round(a.altitude) as altitude, 
                        round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
                        round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
                        case 
                            when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                            else
                                NULL
                        end as temperature_k,
                        case 
                            when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%%' then
                                round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                            else
                                NULL
                        end as pressure_pa,
                        case
                            when position(':' in a.raw) > 0 then
                                substring(a.raw from position(':' in a.raw) + 1 for 1)
                            else
                                NULL
                        end as ptype, 
                        a.heardfrom, 
                        round(a.freq / 1000000.0,3) as freq, 
                        dense_rank () over (partition by a.hash, date_trunc('minute', a.tm) order by cast(a.sourcename = a.heardfrom as int) desc), 
                        " . 
                        ($use_receive_level == True ?  " case when a.heardfrom = a.sourcename then a.receive_level else -1 end as receive_level" : "-1 as receive_level")
                        . "

                        from 
                        dw_packets a

                        where 
                        a.location2d != '' 
                        and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time) 
                        
                        --group by a.hash, packet_time, a.sourcename, a.comment, a.source_symbol, a.bearing, a.speed_mph, altitude, latitude, longitude, temperature_k, pressure_pa, ptype, a.heardfrom, freq

                        order by
                        a.hash, 
                        a.channel
                ) as f
                left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on f.sourcename = b.callsign
                left outer join (select t.callsign from trackers t order by t.callsign) as c 
                    on case
                       when c.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                           f.sourcename  = c.callsign
                       else 
                           f.sourcename like c.callsign || '-%'
                    end

                where 
                    b.callsign is null
                    and c.callsign is null
                    and f.symbol != '/_'
                    and f.dense_rank = 1

                order by 
                f.thetime asc,
                f.sourcename
            ) as g
            left outer join (
                select
                max(tm) as thetime,
                callsign

                from
                packets

                where
                tm > (now() - (to_char(($3)::interval, 'HH24:MI:SS'))::time)

                group by
                callsign

                order by
                thetime
            ) as p on p.callsign = g.sourcename

            where 
            g.row_number = 1
            and (p.callsign is null or p.thetime - g.thetime < interval '00:00:30')

            order by
            g.thetime asc,
            g.sourcename
            ;
        ";

        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["timezone"]), 
            sql_escape_string($config["lookbackperiod"] . " minute"),
            sql_escape_string($config["lookbackperiod"] . " minute")
        ));
    } 

    /* Otherwise, we just query the packets table */
    else {

        # read in the status JSON file from the habtracker-daemon
        $ray = array();
        $ray["active"] = 0;
        $ray["rf_mode"] = 0;
        $ray["timezone"] = $config["timezone"];
        $ray["direwolfcallsign"] = $config["callsign"];

        $d = mktime(00, 00, 00, 1, 1, 2000);
        $ray["starttime"] = date("Y-m-d H:i:s", $d);
        $defaultStatusJSON = json_encode($ray);

        $statusJsonFile = "daemonstatus.json";
        $s = file_get_contents($documentroot . "/" . $statusJsonFile);
        if ($s === false)
            $status = $ray;
        else {
            $status = json_decode($s, true);
            if (!array_key_exists("starttime", $status))
                $status["starttime"] = $ray["starttime"];
            if (!array_key_exists("timezone", $status))
                $status["timezone"] = $ray["timezone"];
            if (!array_key_exists("direwolfcallsign", $status))
                $status["direwolfcallsign"] = $ray["direwolfcallsign"];
        }
        
        if ($status["direwolfcallsign"] == "")
            $mycallsign = "E0SS";
        else 
            $mycallsign = $status["direwolfcallsign"];


        $query = "
            select distinct
            date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
            case
                when a.raw similar to '%[0-9]{6}h%' then
                    date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                else
                    date_trunc('milliseconds', a.tm)::time without time zone
            end as packet_time,
            a.callsign,
            '' as heardfrom,
            a.comment, 
            a.symbol, 
            a.bearing,
            a.speed_mph,
            round(a.altitude) as altitude,
            round(cast(ST_Y(a.location2d) as numeric), 6) as latitude,
            round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
            case
                when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P%%' then
                    round(273.15 + cast(substring(substring(substring(a.raw from ' [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                else
                    NULL
            end as temperature_k,
            case
                when a.raw similar to '%% [-]{0,1}[0-9]{1,6}T[0-9]{1,6}P%%' then
                    round(cast(substring(substring(a.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0, 2)
                else
                    NULL
            end as pressure_pa,
            a.ptype,
            'n/a' as freq,
            'n/a' as receive_level

            from
            packets a
            left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign
            left outer join (select t.callsign from trackers t order by t.callsign) as c 
                on case
                   when c.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                       a.callsign  = c.callsign
                   else 
                       a.callsign like c.callsign || '-%'
                end

            where
            a.location2d != ''
            and b.callsign is null
            and c.callsign is null
            and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)
            and a.symbol != '/_'
            and a.raw like '%qAO," . $mycallsign . "%:%'

            order by
            thetime asc,
            a.callsign
            ;";

        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["timezone"]), 
            sql_escape_string($config["lookbackperiod"] . " minute")
        ));
    }


    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    $positioninfo = [];
    $features = [];
    while ($row = sql_fetch_array($result)) {

        $thetime = $row['thetime'];
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $speed = $row['speed_mph'];
        $heardfrom = $row['heardfrom'];
        $frequency = ($row['freq'] == "" ? "ext radio" : ($row['freq'] != "n/a" ? $row['freq'] : ""));
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $rl = round($row['receive_level']);
        if ($rl > 100)
            $rl = 100;

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing, $rl, $speed, $heardfrom, $frequency);
            else {
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing, $rl, $speed, $heardfrom, $frequency);
    }    



/* this is for the FeatureCollection preamble */
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"APRS Objects\" }, \"features\" : [ ");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
       
        /* This prints out the GeoJSON object for this station */
        printf ("{ \"type\" : \"Feature\",\n");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s, \"bearing\" : %s, \"speed\" : %s, \"heardfrom\" : %s, \"frequency\" : %s },\n", 
            json_encode($callsign), 
            json_encode($callsign), 
            json_encode($positioninfo[$callsign][0]), 
            json_encode($positioninfo[$callsign][1]), 
            json_encode($positioninfo[$callsign][4]), 
            json_encode(($positioninfo[$callsign][5] == "" ? "" : $positioninfo[$callsign][5] . ($positioninfo[$callsign][7] > 0 ? "<br>" : "")) . ($positioninfo[$callsign][7] > 0 ? "Audio level: <label><meter value=" . $positioninfo[$callsign][7] . " min=0 low=40 high=100 max=100></meter> " . $positioninfo[$callsign][7] . "</label>" : "")), 
            json_encode($callsign),
	    json_encode($callsign),
	    json_encode($config["iconsize"]),
	    json_encode($positioninfo[$callsign][6]),
	    json_encode($positioninfo[$callsign][8]),
	    json_encode(($positioninfo[$callsign][9] == $callsign ? "direct" : $positioninfo[$callsign][9])),
	    json_encode($positioninfo[$callsign][10])
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}\n", $positioninfo[$callsign][3], $positioninfo[$callsign][2]);
        printf ("}");
        if (count($ray) > 1 && $config["plottracks"] == "on") {
            printf (", ");
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s },", json_encode($callsign . "_path"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }\n", json_encode($linestring));
            unset ($linestring);
        }
    }

/* This is for the ending of a FeatureCollection */
    printf ("] }");

    sql_close($link);


?>
