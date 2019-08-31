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

###  This will create an MP3 audio file containing the latest status for a given flight.
# The phrase will be:  "Flight nnn (ascending | descending), xxx thousand feet, range yyy miles"
#
# This will return JSON of the form:  {"flightid" : "abcd-xxx", "audiofile" : "filename" }

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();

    #header("Content-Type:  application/json;");

    # Check the timestamp parameter
    $get_timestamp = 0;
    if (isset($_GET["timestamp"])) {
        if (check_number($_GET["timestamp"], 0, 2147483647 ))
            $get_timestamp = intval($_GET["timestamp"]);
        else
            $get_timestamp = 0;
    }
    else
        $get_timestamp = 0;
 


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## get the latest position from the gpsposition table
    $gpsquery = 'select 
        tm::timestamp without time zone as time, 
        round(speed_mph) as speed_mph, 
        bearing, 
        round(altitude_ft) as altitude_ft, 
        round(cast(ST_Y(location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(location2d) as numeric), 6) as longitude 

        from gpsposition 

        where 
        tm > (now() -  time \'01:30:00\')
      
        order by 
        tm desc limit 1;';

    $gpsresult = sql_query($gpsquery);
    if (!$gpsresult) {
        db_error(sql_last_error());
        sql_close($link);
        printf ("[]");
        return 0;
    }

    $gpsrow = sql_fetch_array($gpsresult);
    $numgpsrows = sql_num_rows($gpsresult);
    $GPS_STRING = "";
    if ($numgpsrows > 0) {
        $mylat = $gpsrow["latitude"];
        $mylon = $gpsrow["longitude"];
        $GPS_STRING = "round(cast(ST_DistanceSphere(ST_GeomFromText('POINT(" . $mylon . " " . $mylat . ")',4326), a.location2d)*.621371/1000 as numeric))";
    }
    else
        $GPS_STRING = "-1";


    ## query the last packets from stations...
    $query = '
        select distinct 
        dt.thetime,
        dt.packet_time,
        dt.flightid,
        dt.callsign, 
        dt.symbol, 
        dt.speed_mph,
        dt.bearing,
        dt.altitude,
        dt.comment, 
        dt.latitude,
        dt.longitude, 
        dt.distance_miles,
        dt.raw
 
        from (
        select
        fl.flightid,
        date_trunc(\'millisecond\', a.tm)::timestamp without time zone as thetime,
        case
        when a.ptype = \'/\' and a.raw similar to \'%[0-9]{6}h%\' then 
            date_trunc(\'second\', ((to_timestamp(substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'HH24MISS\')::timestamp at time zone \'UTC\') at time zone $1)::time)::time without time zone
        else
            date_trunc(\'second\', a.tm)::time without time zone
        end as packet_time,
        a.callsign, 
        a.symbol, 
        round(a.speed_mph) as speed_mph,
        round(a.bearing) as bearing,
        round(a.altitude / 1000, 1) as altitude, 
        a.comment, 
        round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(a.location2d) as numeric), 6) as longitude,
        case
            when a.location2d != \'\' then ' 
                . $GPS_STRING . ' 
            else
                -1
        end as distance_miles,
        raw,
        rank () over (partition by fl.flightid order by 
        case
        when a.ptype = \'/\' and a.raw similar to \'%[0-9]{6}h%\' then 
            date_trunc(\'second\', ((to_timestamp(substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'HH24MISS\')::timestamp at time zone \'UTC\') at time zone $1)::time)::time without time zone
        else
            date_trunc(\'second\', a.tm)::time without time zone
        end desc) as rank
        
        from 
        packets a,
        flightmap fm,
        flights fl
        
        where 
        a.tm > (now() -  time \'00:20:00\')
        and a.location2d != \'\'
        and a.altitude > 0
        and fm.flightid = fl.flightid
        and a.callsign = fm.callsign 
        and fl.active = \'t\'
        ) as dt

        where rank < 4

        order by
        dt.flightid,
        dt.packet_time desc;';
    $result = pg_query_params($link, $query, array(sql_escape_string($config["timezone"])));
    //$result = pg_query($link, $query);

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        printf ("[]");
        return 0;
    }
 
    $numrows = sql_num_rows($result);
    //$rows = sql_fetch_all($result);
    while ($row = sql_fetch_array($result)) {

        # Get the last callsign, altitude, and range figures
        $flights[$row["flightid"]]["altitude"][] = $row["altitude"];
        $flights[$row["flightid"]]["callsign"][] = $row["callsign"];
        $flights[$row["flightid"]]["distance_miles"][] = $row["distance_miles"];
        $flights[$row["flightid"]]["packet_time"][] = $row["packet_time"];
    }

    $jsonarray = [];
    foreach ($flights as $flightid => $ray) {
        #printf ("<br>== %s ==<br>", $flightid);
        #print_r($ray);

        # This is hard coded to look for flight identifiers that are of the form ABCD-nnn
        $flightray = str_split(explode("-", $flightid)[1], 1);

        # this will space out the numerical part of the flightid.  Ex:  289 becomes "2 89".
        $flightnum = $flightray[0] . " " . $flightray[1] . $flightray[2];

        # did a burst just happen?
        if (sizeof($ray["altitude"]) > 2) {
            if ($ray["altitude"][0] < $ray["altitude"][1] && $ray["altitude"][1] > $ray["altitude"][2] && $ray["altitude"][0] > 15000)
                $burst = ", burst, burst, burst, burst detected on flight " . $flightnum;
            else
                $burst = "";
        }

        # Split out the altitude.  These should be in the form of 54.6, etc., but we need to split them up 
        # to be into words like:  "54 point 6 thousand feet".
        if ($ray["altitude"][0] > 0) {
            $altray = explode(".", $ray["altitude"][0]);
            $alt_words = ", " . $altray[0] . " thousand feet";
        }
        else
            $alt_words = "";

        # Split out the range.  These should be in the form of 23, etc.. 
        if ($ray["distance_miles"][0] > 0) {
            $range_words = ", range " . $ray["distance_miles"][0] . " miles.";
        }
        else
            $range_words = "";

        # Our sentance
        $words = "Flight " . $flightnum . $burst .  $alt_words .  $range_words;

        # Unique filename
        $filename = "audio/" .  uniqid();

        # Check the timestamp vs. the time right now.  If it's been longer than 30 seconds, then create an audio report.  Or, if a
        # burst condition was detected, then we want that right now.
        $delta_secs = time() - $get_timestamp;

        #if ($delta_secs > 30 || $burst != "") {
        if ($delta_secs > 30) {

            # Run the pico2wave command to generate a wave audio file
            $cmdstring = "pico2wave -w " . $filename . ".wav '" . $words . "'";
            $cmdoutput = shell_exec($cmdstring);
            $cmdoutput = shell_exec("ffmpeg -i " . $filename . ".wav " . $filename . ".mp3");
            $cmdoutput = shell_exec("rm -f " . $filename . ".wav");
            $findcommand = 'find audio/ -mmin +10 -type f -name "*.mp3" -exec rm -f {} \;';
            $cmdoutput = shell_exec($findcommand);
    
            $ourjson = [];
            $ourjson["audiofile"] = "/" . $filename . ".mp3";
            $ourjson["flightid"] = $flightid;
            $ourjson["words"] = $words;
            if ($burst != "") 
                $ourjson["emergency"] = "1";
            else
                $ourjson["emergency"] = "0";
    
            $jsonarray[] = $ourjson;
        }

    }

    printf ("%s", json_encode($jsonarray));

    sql_close($link);
?>
