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

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();

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
        
    # if the habtracker-daemon is not running then don't return any rows...technically we could return rows, but we dont know 
    # when to start looking at packets as we don't know the prior habtracker-daemon start time.
    if ($status["active"] == 0) {
        printf ("[]");
        return;
    }


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    # Check if the callsign that direwolf is using has been set (presumably to the user's personal call).
    if ($status["direwolfcallsign"] == "")
        $mycallsign = "E0SS";
    else {
        $mycallsign = $status["direwolfcallsign"];
    }


    # The SQL that will grab packet counts for each tracker callsign.
    $query = "
        select
            b.heardfrom || ' (' || b.tactical || ')' as callsign,
            count(b.raw) filter (where b.callsign != b.heardfrom) as digipackets,
            count(b.raw) filter (where b.callsign = b.heardfrom) as nondigipackets,
            count(b.raw) filter (where b.callsign = b.heardfrom or b.callsign != b.heardfrom ) as total_packets

        from
            (
            select distinct on ( 
                date_trunc('minute', a.tm) + cast(round(date_part('seconds', a.tm)/10)*10 || ' seconds' as interval),
                a.hash)
            date_trunc('minute', a.tm) + cast(round(date_part('seconds', a.tm)/10)*10 || ' seconds' as interval),
            a.hash,
            a.tm,
            a.callsign,
            a.heardfrom,
            tr.tactical,
            a.raw

            from
            dw_packets a,
            trackers tr

            where
            case
               when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                   a.heardfrom = tr.callsign
               else 
                   a.heardfrom like tr.callsign || '-%'
            end
            and a.tm > now()::date
            and a.tm > $1

            order by
            date_trunc('minute', a.tm) + cast(round(date_part('seconds', a.tm)/10)*10 || ' seconds' as interval),
            a.hash,
            a.tm,
            a.callsign,
            a.heardfrom
            ) as b

        group by 
            1

        order by 
            4 desc
                ;";

    # Execute the query
    $result = pg_query_params($link, $query, array(sql_escape_string($status["starttime"] . " " . $status["timezone"])));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    # Collect the rows into an array
    $rows = [];
    if (sql_num_rows($result) > 0) {
        $rows = sql_fetch_all($result);
    }

    # print out the results as JSON
    printf ("%s", json_encode($rows));

    sql_close($link);
?>
