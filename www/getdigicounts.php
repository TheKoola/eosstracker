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

    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
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


    function generateJSON($xaxis, $yaxis, $seriesname) {
         $innerfirsttime = 1;
         printf ("\"tm-%s\" : [", $seriesname);
         foreach ($xaxis as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("\"%s\"", $value);
         }
         printf ("], ");

         $innerfirsttime = 1;
         printf ("\"%s\" : [", $seriesname);
         foreach ($yaxis as $value) {
             if (! $innerfirsttime)
                 printf (", ");
             $innerfirsttime = 0;
             printf ("%s", $value);
         }
         printf ("] ");
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


    if ($status["direwolfcallsign"] == "")
        $mycallsign = "E0SS";
    else {
        $mycallsign = $status["direwolfcallsign"];
    }


    $query = "
        select
            date_trunc('day', b.tm)::date as thedate, 
            date_trunc('hour', b.tm)::time as thehour,
            date_trunc('minute', b.tm)::time as theminute, 
            b.heardfrom,
            count(b.raw) filter (where b.callsign != b.heardfrom) as digipackets,
            count(b.raw) filter (where b.callsign = b.heardfrom) as nondigipackets,
            count(b.raw) filter (where b.callsign = b.heardfrom or b.callsign != b.heardfrom ) as total_packets

        from
        (
            select distinct on (a.hash)
            a.tm,
            a.hash,
            a.callsign,
            a.heardfrom,
            a.raw

            from
            dw_packets a,
            flights f,
            flightmap fm

            where
            f.active = 't'
            and fm.flightid = f.flightid
            and (a.heardfrom = fm.callsign or a.heardfrom like 'EOSS%')
            and a.tm > date_trunc('minute', (now() - (to_char(($1)::interval, 'HH24:MI:SS')::time)))::timestamp
            and a.tm > $2

            order by
            a.hash,
            a.tm,
            a.callsign,
            a.heardfrom
        ) as b

        group by 
            1, 2, 3,
            b.heardfrom

        order by 
            1, 2, 3,
            b.heardfrom
        ;";

    if ($dw_packets) {
        $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute"), sql_escape_string($status["starttime"] . " " . $status["timezone"])));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
       
        $tdata = [];
        $ydata = [];
        if (sql_num_rows($result) > 0) {
            $firsttime = 1;
            while ($row = sql_fetch_array($result)) {
                $heardfrom = $row['heardfrom'];
                $tdata[$heardfrom][] = $row['thedate'] . " " . $row['theminute'];
                $ydata[$heardfrom][] = $row['digipackets'];
            }    

            if (sql_num_rows($result) > 0) {
                printf (" { ");
                $firsttime = 1;
                foreach ($ydata as $key => $series) {
                    if ($firsttime == 0)
                        printf (", ");
                    $firsttime = 0;
                    $timeseries = $tdata[$key];
                    generateJSON($timeseries, $series, $key);
                }
                printf ("}");
            }
            else
                printf ("[]");
        }
        else
            printf ("[]");
    }
    else
        printf ("[]");

    sql_close($link);
?>
