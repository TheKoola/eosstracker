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

###  This will create an MP3 audio file containing the latest status for a given flight.
# The phrase will be:  "Flight nnn (ascending | descending), xxx thousand feet, range yyy miles"
#
# This will return JSON of the form:  {"flightid" : "abcd-xxx", "audiofile" : "filename" }

    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();

    # Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $get_flightid = "";
        else
            $get_flightid = " and fl.flightid = '" . $get_flightid . "' ";
    }
    else
        $get_flightid = "";

    # Get the session variable from the caller
    $get_callerid = "";
    if (isset($_GET["callerid"]))
        $get_callerid = check_string($_GET["callerid"], 20) . ".";
    if ($get_callerid == "")
        $get_callerid = "default.";

    # This is the JSON format for the audio alerts status file
    $ray = Array();
    $ray["timestamp"] = 0;  # Number of seconds since the epoch...default is 0 to make alerts always run the first time.

    # Default JSON for the audio alerts status
    $audioDefaultJSON = json_encode($ray);

    # The filename for saving status
    $JSONfile = $documentroot . "/audio/" . $get_callerid . "alertstatus.json";

    # Read in status file
    $audioJSON = @file_get_contents($JSONfile);
    if ($audioJSON === false)
	    $audioJSON = json_decode($audioDefaultJSON, true);
    else 
	    $audioJSON = json_decode($audioJSON, true);



    ###### Check if binaries are in place to create the audio alert itself.  If not, then we just return blank JSON.
    #
    # Array of file paths that must exists before we'll proceed
    $filelist[] = "/usr/bin/pico2wave";
    $filelist[] = "/usr/bin/ffmpeg";

    # Loop through each file checking for its existance.  If any of them do not exist, then we exit.
    foreach ($filelist as $f)  {
        if (! file_exists($f)) {
            printf ("[]");
            return 0;
        }
    }
    ###################3


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
        tm > (now() -  interval \'01:30:00\')
      
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
        $GPS_STRING =  "round(cast(ST_DistanceSphere (ST_GeomFromText('POINT(" . $mylon . " " . $mylat . ")',4326), a.location2d)*.621371/1000 as numeric),1)";
        $GPS_STRING2 = "round(cast(ST_DistanceSphere (ST_GeomFromText('POINT(" . $mylon . " " . $mylat . ")',4326), l.location2d)*.621371/1000 as numeric),1)";
        $GPS_STRING3 = "round(cast(degrees(ST_Azimuth(ST_GeomFromText('POINT(" . $mylon . " " . $mylat . ")',4326), a.location2d)) as numeric))";
    }
    else {
        $GPS_STRING = "-1";
        $GPS_STRING2 = "-1";
        $GPS_STRING3 = "-999";
    }


    ## query the last packets from stations...
    $query = '
        select distinct 
            dt.thetime,
            dt.packet_time,
            lp.ttl,
            lp.landingdistance_miles,
            extract(epoch from now() - dt.thetime) as lastsecs,
            dt.flightid,
            dt.callsign, 
            dt.symbol, 
            dt.speed_mph,
            dt.bearing,
            dt.azimuth,
            trunc(dt.altitude) as altitude,
            dt.comment, 
            dt.latitude,
            dt.longitude, 
            round(dt.distance_miles) as distance_miles,
            dt.raw
 
        from (
            select
                fl.flightid,
                date_trunc(\'milliseconds\', a.tm)::timestamp without time zone as thetime,
                case
                    when a.raw similar to \'%[0-9]{6}h%\' then 
                        date_trunc(\'second\', ((to_timestamp(now()::date || \' \' || substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'YYYY-MM-DD HH24MISS\')::timestamp at time zone \'UTC\') at time zone $1)::time)::time without time zone
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
                case
                    when a.location2d != \'\' then '
                        . $GPS_STRING3 . ' 
                    else
                        -999
                end as azimuth,
                raw,
                rank () over (
                    partition by fl.flightid order by 
                        case
                            when a.raw similar to \'%[0-9]{6}h%\' then 
                                date_trunc(\'second\', ((to_timestamp(now()::date || \' \' || substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'YYYY-MM-DD HH24MISS\')::timestamp at time zone \'UTC\') at time zone $1)::time)::time without time zone
                            else
                                date_trunc(\'second\', a.tm)::time without time zone
                        end desc
                    ) as rank
        
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
                and fl.active = \'t\' ' 
                . $get_flightid . '  
        ) as dt
        left outer join
        (   
            select
                max(l.tm) as thetime,
                l.flightid,
                l.callsign,
                l.ttl,
                case 
                    when l.location2d != \'\' then '
                        . $GPS_STRING2 . ' 
                    else
                        -1
                end as landingdistance_miles
                
            from
                landingpredictions l
            
            where
                l.tm > now() - time \'00:05:00\'
                and l.ttl is not null
            
            group by
                l.flightid,
                l.callsign,
                l.ttl,
                l.location2d
            
            order by
                thetime,
                l.flightid,
                l.callsign
        
        ) as lp
        on dt.flightid = lp.flightid and dt.callsign = lp.callsign

        where rank < 4

        order by
            dt.flightid,
            dt.thetime desc
            --dt.packet_time desc
    ;';
    $result = pg_query_params($link, $query, array(sql_escape_string($config["timezone"])));

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        printf ("[]");
        return 0;
    }

    # Loop through the rows returned from the SQL query, stuffing values into arrays for later analysis
    $flights = [];
    $numrows = sql_num_rows($result);
    while ($row = sql_fetch_array($result)) {

        # Get the last callsign, altitude, and range figures
        $flights[$row["flightid"]]["altitude"][] = $row["altitude"];
        $flights[$row["flightid"]]["callsign"][] = $row["callsign"];
        $flights[$row["flightid"]]["distance_miles"][] = $row["distance_miles"];
        $flights[$row["flightid"]]["packet_time"][] = $row["packet_time"];
        $flights[$row["flightid"]]["lastsecs"][] = $row["lastsecs"];
        $flights[$row["flightid"]]["ttl"][] = $row["ttl"];
        $flights[$row["flightid"]]["landingdistance_miles"][] = $row["landingdistance_miles"];
        $flights[$row["flightid"]]["azimuth"][] = $row["azimuth"];
    }

    # this array is used to collect the JSON for each flight and is ultimately what is printed out at the end..
    $jsonarray = [];

    # Loop through each flight returned from the query above, creating words, and audio files.
    $updateFile = false;
    foreach ($flights as $flightid => $ray) {
        #printf ("<br>== %s ==<br>", $flightid);
        #print_r($ray);

        # This is hard coded to look for flight identifiers that are of the form *-nnn
        $flightray = str_split(explode("-", $flightid)[1], 1);

        # this will space out the numerical part of the flightid.  Ex:  289 becomes "2 89".
        $flightnum = $flightray[0] . " " . $flightray[1] . $flightray[2];

        # did a burst just happen?
        $burst = "";
        if (sizeof($ray["altitude"]) > 2) {
            # if the latest altitude figure is < the prior one
            # ...AND...  the prior altitude figures are all increasing (aka the flight is ascending)
            # ...THEN... the balloon must have just burst or was cut down
            if ($ray["altitude"][0] < $ray["altitude"][1] && $ray["altitude"][1] > $ray["altitude"][2] && $ray["altitude"][0] > 15)
                $burst = ", burst, burst, burst, burst detected on flight " . $flightnum;
            else
                $burst = "";
        }


        # Split out the altitude.  These should be in the form ofi 54.6, etc., but we need to split them up 
        # to be into words like:  "54.6 thousand feet".  
        if ($ray["altitude"][0] > 0) {
            $alt_words = ", " . $ray["altitude"][0] . " thousand feet";
        }
        else
            $alt_words = "";

        # Split out the range.  These should be in the form of 23, etc.. 
        if ($ray["distance_miles"][0] > 0) {
            $range_words = ", " . $ray["distance_miles"][0] . " miles";
        }
        else
            $range_words = "";

        # If the relative bearing is > 0 (in degrees), then add in a "bearing" statement only if we're not declaring a burst condition.
        if ($ray["azimuth"][0] > 0 && $burst == "") {
            # convert the numeric value of the bearing to a string with the numerals seperated by spaces.  For example, "163" becomes "1 6 3".
            $azimuth  = implode(' ',str_split(strval($ray["azimuth"][0]))); 

            # The phrase used for the bearing to the flight.
            $azimuth_words = ", bearing " . $azimuth . " degrees";
        }
        else
            $azimuth_words = "";

        # Our default sentance.  We form up the words needed.
        $words = "Flight " . $flightnum . $burst .  $alt_words .  $range_words . $azimuth_words . ".";

        # No packets alert.  If we havn't heard something from the flight for > 120 seconds, then we override the normal message.
        $secs_last_packet = $ray["lastsecs"][0];
        $nummins = ceil($secs_last_packet / 60.0);
        if ($secs_last_packet > 120) {
            $words = "Warning, flight " . $flightnum . ". No packets for " . $nummins . " minutes.  Last update" . $alt_words . $range_words . $azimuth_words . ".";  
        }

        # If there is a landing prediction availble, then we use a different sentance
        if ($ray["ttl"][0] != "" && $ray["landingdistance_miles"][0] != "") {
            $ttl = floor($ray["ttl"][0] / 60.0);

            # If we haven't seen a packet from this flight for > 120 secs, then we subtract that delta from the last calculated time-to-live figure.
            # This provides a more accurate estimate of WHEN the flight might land in the event we lose contact with it.
            if ($secs_last_packet > 120) {
                $ttl = floor(($ray["ttl"][0] - $secs_last_packet) / 60.0);
                if ($ttl < 0)
                    $ttl = 0;
            }

            $words = $words . " Time to live, " . $ttl . " minutes";

            # The distance to the landing location from our own position (i.e. from GPS).
            $landingdistance = ceil($ray["landingdistance_miles"][0]);

            # if the landing distance is greater than zero, then add that phrase to the end of our statement.  If the distance value is < 0, then most likely the system doesn't
            # have a valid GPS position recorded yet so it doesn't make sense to add a phrase about "distance".
            if ($landingdistance > 0)  
                $words = $words . ", predicted landing, " . $landingdistance . " miles away."; 
            else
                $words = $words . ".";
        }


        # Unique filename
        $filename = "audio/" .  uniqid();

        # Check the timestamp vs. the time right now.  If it's been longer than 25 seconds, then create an audio report.  Or, if a
        # burst condition was detected, then we want that right now.
        $delta_secs = time() - $audioJSON["timestamp"];

        if ($delta_secs > 27|| $burst != "") {

            # Run the pico2wave command to generate a wave audio file
            $cmdstring = "pico2wave -w " . $filename . ".wav '" . $words . "'";
            $cmdoutput = shell_exec($cmdstring);

            # Now use ffmpeg to convert the wave file to an mp3
            $cmdoutput = shell_exec("ffmpeg -i " . $filename . ".wav " . $filename . ".mp3");

            # ...and delete the leftover wave file
            $cmdoutput = shell_exec("rm -f " . $filename . ".wav");
    
            # Construct JSON to include the name of the mp3 audio file created, the flightid this audio file is for, and so on.
            $ourjson = [];
            $ourjson["audiofile"] = "/" . $filename . ".mp3";
            $ourjson["flightid"] = $flightid;
            $ourjson["words"] = $words;

            # If this was a burst condition, then we set the JSON key, "emergency", to 1.
            if ($burst != "") 
                $ourjson["emergency"] = "1";
            else
                $ourjson["emergency"] = "0";
    
            # Add this flight's JSON data to the array (which we'll print out later)
            $jsonarray[] = $ourjson;

            # update the JSON file
            $updateFile = true;
        }
    }

    if ($updateFile == true) { 
        # Update the timestamp for our audio alerts status file 
        $audioJSON["timestamp"] = time();
        file_put_contents($JSONfile, json_encode($audioJSON));
    }

    // Look for audio files to clean up.  Only those files that are older than 10mins are deleted.
    $findcommand = 'find audio/ -mmin +10 -type f \( -name "*.mp3" -o -name "*.wav" -o -name "*.json" \) -exec rm -f {} \;';
    $cmdoutput = shell_exec($findcommand);

    # Print out the JSON we've collected for each active flight.
    printf ("%s", json_encode($jsonarray));

    sql_close($link);
?>
