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
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

    // Check the starttime HTML GET variable
    // Must be > 1/1/2020 01:01:01
    // ...and <  12/31/2037 23:59:59
    $date = new DateTime();
    $get_starttime = $date->getTimestamp() - 60;
    $starttime_supplied = false;
    if (isset($_GET["starttime"])) {
        if (check_number($_GET["starttime"], $get_starttime, 2145916799)) {
            $get_starttime = intval($_GET["starttime"]);
            $starttime_supplied = true;
        }
    }



    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    # Get a list of all active flights
    $flights_query = "
        select
        f.flightid,
        fm.callsign,
        fm.location,
        fm.freq,
        f.active,
        f.description,
        f.launchsite

        from
        flights f left outer join flightmap fm
            on fm.flightid = f.flightid

        where
        f.active = 'y' 

        order by
        f.active desc,
        f.flightid desc,
        f.thedate desc,
        fm.callsign asc;
    ";

    $flights_result = sql_query($flights_query);
    if (!$flights_result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $flightsJSON = [];
    if (sql_num_rows($flights_result) > 0) {
        $beacons = [];
        while($r = sql_fetch_array($flights_result)) {
            $beacons[$r["flightid"]][] = $r["callsign"];
        }

        foreach ($beacons as $f => $b) {
            $flightsJSON[] = array(
                "flightid" => $f,
                "beacons" => $b
            );
        }
    }

    if ($starttime_supplied) {
        ## query the last packets from stations...
        $query = "
            select distinct 
            date_trunc('second', a.tm)::timestamp without time zone as timestamp, 
            a.callsign,
            date_trunc('second', a.tm)::time without time zone || ', ' || a.raw as packet

            from 
            packets a 

            where 
            a.tm > (to_timestamp($1)::timestamp)

            and a.raw != '' 
            order by 1 desc;
        ";

        $result = pg_query_params($link, $query, array(
            $get_starttime
        ));
    }
    else {
        $query = "
            select distinct 
            date_trunc('second', a.tm)::timestamp without time zone as timestamp, 
            a.callsign,
            date_trunc('second', a.tm)::time without time zone || ', ' || a.raw as packet

            from 
            packets a
            left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign

            where 
            a.tm > (to_timestamp($1)::timestamp)
            and b.callsign is null
            and a.raw != '' 

            union

            select distinct 
            date_trunc('second', a.tm)::timestamp without time zone as timestamp, 
            a.callsign,
            date_trunc('second', a.tm)::time without time zone || ', ' || a.raw as packet

            from 
            packets a 
            left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign

            where 
            a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time)
            and a.raw != '' 
            and b.callsign is not null

            order by 1 desc
            ;
        ";

        $result = pg_query_params($link, $query, array(
            $get_starttime,
            sql_escape_string($config["lookbackperiod"] . " minute")
        ));
    }

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $allpackets = [];
    if (sql_num_rows($result) > 0)
        $allpackets = sql_fetch_all($result);

    $outputJSON["packets"] = $allpackets;
    $outputJSON["flights"] = $flightsJSON;

    printf ("%s", json_encode($outputJSON));



    sql_close($link);

?>
