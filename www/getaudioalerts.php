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
    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();

    # Check the flightid HTML GET variable
    $get_flightid = "";
    $formerror = true;
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
        else
            $formerror = false;
    }

    if ($formerror) {
        printf("[]");
        return;
    }

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


    # This query will check if this flight has already "burst" and is descending.
    $burst_query = "
        select
        z.burst_time,
        z.flightid,
        z.callsign,
        z.burst_altitude,
        floor(extract('epoch' from (now()::timestamp - z.burst_time))) as elapsed_secs

        from
        (
                select
                    date_trunc('millisecond', y.tm)::timestamp without time zone as thetime,
                    y.callsign,
                    y.flightid,
                    y.altitude,
                    y.elapsed_secs,
                    case when
                        y.altitude < y.previous_altitude1 and y.altitude > 14999 and previous_altitude2 < y.previous_altitude1 then
                        y.previous_altitude1
                    else
                        NULL
                    end as burst_altitude,
                    case when
                        y.altitude < y.previous_altitude1 and y.altitude > 14999 and previous_altitude2 < y.previous_altitude1 then
                        y.previous_time::timestamp without time zone
                    else
                        NULL
                    end as burst_time

                    from 
                    (
                        select
                            c.tm,
                            c.callsign,
                            c.flightid,
                            c.altitude,
                            lag(c.altitude, 1) over (order by c.tm)  as previous_altitude1, 
                            lag(c.altitude, 2) over (order by c.tm)  as previous_altitude2, 
                            lag(c.tm, 1) over (order by c.tm)  as previous_time, 
                            extract ('epoch' from (now()::timestamp - c.tm)) as elapsed_secs

                            from (
                                    select 
                                    a.tm,
                                    a.callsign, 
                                    f.flightid,
                                    a.altitude

                                    from 
                                    packets a,
                                    flights f,
                                    flightmap fm

                                    where 
                                    a.location2d != '' 
                                    and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                                    and fm.flightid = f.flightid
                                    and f.active = 'y'
                                    and a.callsign = fm.callsign
                                    and a.altitude > 0
                                    and f.flightid = $2

                                    order by 
                                    f.flightid,
                                    a.callsign,
                                    a.tm asc

                            ) as c

                        ) as y

                    order by
                        y.flightid,
                        y.callsign,
                        y.tm asc
            ) as z

            where 
            z.burst_altitude is not NULL

            order by 
            z.flightid,
            z.callsign,
            z.burst_time
        ;
    "; 


    $burst_result = pg_query_params($link, $burst_query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"),
        sql_escape_string($get_flightid)
    ));

    if (!$burst_result) {
        db_error(sql_last_error());
        sql_close($link);
        printf ("[]");
        return 0;
    }

    $num_burstrows = sql_num_rows($burst_result);
    $burst_rows = sql_fetch_all($burst_result);   
    $burst_detected = false;
    if ($num_burstrows > 0) {
        $burst_altitude = $burst_rows[0]["burst_altitude"];
        if (($burst_elapsed_secs = $burst_rows[0]["elapsed_secs"]) < 5000)
            $burst_detected = true;
    }


    ## query the last packets from stations...
    $query = "
            select
                y.thetime,
                y.packet_time,
                y.callsign,
                y.flightid,
                y.comment,
                y.symbol,
                round(y.altitude / 1000.0) as altitude,
                round(y.speed_mph) as speed_mph,
                round(y.bearing) as bearing,
                round(y.lat, 6) as latitude,
                round(y.lon, 6) as longitude,
                round(y.elapsed_secs / 60.0) as elapsed_mins,
                round((y.temperature_k - 273.15) * 9 / 5 + 32, 2) as temperature_f,
                round(y.pressure_pa / 101325, 4) as pressure_atm,
                y.sourcename,
                y.freq,
                y.channel,
                y.heardfrom,
                y.source,
                y.hash,
                case 
                when y.location2d != '' and gps.location2d != '' then
                    round(cast(ST_DistanceSphere(y.location2d, gps.location2d)*.621371/1000 as numeric))
                else
                    -99
                end as distance_miles,
                case 
                when y.location2d != '' and gps.location2d != '' then
                    round(cast(degrees(atan((y.altitude  - gps.altitude_ft) / (cast(ST_DistanceSphere(y.location2d, gps.location2d) as numeric) * 3.28084))) as numeric), 2)
                else
                    -99
                end as angle,
                case 
                when y.location2d != '' and gps.location2d != '' then
                    round(cast(degrees(ST_Azimuth(gps.location2d, y.location2d)) as numeric))
                else
                    -99
                end as azimuth,
                case 
                when gps.bearing is not null then
                    round(cast(gps.bearing as numeric), 2)
                else
                    -99
                end as myheading,
                case
                    when lp.location2d != '' and gps.location2d != '' then
                        round(cast (ST_DistanceSphere(gps.location2d, lp.location2d)*.621371/1000 as numeric))
                    else
                        -99
                end as landingdistance_miles,
                floor(lp.ttl / 60.0) as ttl_mins,
                lp.ttl,
                y.elapsed_secs as lastsecs,
                y.raw  

                from 
                (
                    select
                        c.thetime,
                        c.packet_time,
                        c.callsign,
                        c.flightid,
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
                        c.raw,
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
                                        date_trunc('milliseconds', ((to_timestamp(now()::date || ' ' || substring(a.raw from position('h' in a.raw) - 6 for 6), 'YYYY-MM-DD HH24MISS')::timestamp at time zone 'UTC') at time zone $1)::time)::time without time zone
                                    else
                                        date_trunc('milliseconds', a.tm)::time without time zone
                                end as packet_time,
                                a.callsign, 
                                f.flightid,
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
                                a.frequency as freq,
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
                                    f.flightid

                                    order by 
                                    a.tm desc
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
                                packets a,
                                flights f,
                                flightmap fm

                                where 
                                a.location2d != '' 
                                and a.tm > (now() - (to_char(($2)::interval, 'HH24:MI:SS'))::time) 
                                and fm.flightid = f.flightid
                                and f.active = 'y'
                                and a.callsign = fm.callsign
                                and a.altitude > 0
                                and f.flightid = $3

                                order by a.tm asc

                        ) as c

                        where
                        c.dense_rank = 1

                    ) as y
                    left outer join
                    (
                        select
                        r.tm, 
                        r.flightid,
                        r.callsign, 
                        r.ttl,
                        r.location2d

                        from 
                        (
                            select
                            l.tm,
                            l.flightid,
                            l.callsign,
                            l.ttl,
                            l.location2d,
                            dense_rank() over (partition by l.flightid, l.callsign order by l.tm desc)

                            from
                            landingpredictions l

                            where
                            l.tm > now() - interval '00:10:00'
                            and l.ttl is not null

                            order by

                            l.flightid,
                            l.callsign
                        ) as r

                        where 
                        r.dense_rank = 1

                        order by
                        r.flightid, 
                        r.callsign,
                        r.tm
                    ) as lp
                    on lp.flightid = y.flightid and lp.callsign = y.callsign,
                    (
                        select 
                        g.tm, 
                        g.altitude_ft, 
                        g.location2d,
                        g.bearing 

                        from 
                        gpsposition g 

                        order by 
                        g.tm desc

                        limit 1
                    ) as gps

                order by
                    y.callsign,
                    y.packet_time asc
            ;
    ;";
    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["timezone"]),
        sql_escape_string($config["lookbackperiod"]),
        sql_escape_string($get_flightid)
    ));

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        printf ("[]");
        return 0;
    }

    # this array is used to collect the JSON for each flight and is ultimately what is printed out at the end..
    $jsonarray = [];

    $updateFile = false;

    $numrows = sql_num_rows($result);
    $row = sql_fetch_all($result);   
    if ($numrows > 0) {
        $flightid = $row[0]["flightid"];
        $altitude = $row[0]["altitude"];
        $callsign = $row[0]["callsign"];
        $distance_miles = $row[0]["distance_miles"];
        $packet_time = $row[0]["packet_time"];
        $lastsecs = $row[0]["lastsecs"];
        $elapsed_mins = $row[0]["elapsed_mins"];
        $ttl = $row[0]["ttl"];
        $ttl_mins = $row[0]["ttl_mins"];
        $landingdistance_miles = $row[0]["landingdistance_miles"];
        $azimuth = $row[0]["azimuth"];

        #printf ("<br>== %s ==<br>", $flightid);
        #print_r($ray);

        # This is hard coded to look for flight identifiers that are of the form *-nnn
        $flightray = str_split(explode("-", $flightid)[1], 1);

        # this will space out the numerical part of the flightid.  Ex:  289 becomes "2 89".
        $flightnum = $flightray[0] . " " . $flightray[1] . $flightray[2];

        # did a burst just happen?
        if ($burst_detected) {
            $burst_altitude = floor($burst_altitude / 1000.0);
            $burst = ", burst, burst, burst, burst detected at " . $burst_altitude . " thousand feet for flight " . $flightnum;
        }
        else
            $burst = "";


        # Split out the altitude.  These should be in the form of 54, etc., but we need to split them up 
        # to be into words like:  "54 thousand feet".  
        if ($altitude > 0) {
            $alt_words = ", " . $altitude . " thousand feet";
        }
        else
            $alt_words = "";

        # Split out the range.  These should be in the form of 23, etc.. 
        if ($distance_miles > 0) {
            $range_words = ", " . $distance_miles . " miles";
        }
        else
            $range_words = "";

        # If the relative bearing is > 0 (in degrees), then add in a "bearing" statement only if we're not declaring a burst condition.
        if ($azimuth > 0 && $burst == "") {
            # convert the numeric value of the bearing to a string with the numerals seperated by spaces.  For example, "163" becomes "1 6 3".
            $azimuth_str  = implode(' ',str_split(strval($azimuth))); 

            # If the bearing angle is < 10, then prepend a zero to the phrase
            #if (strlen($azimuth) == 1)
            if ($azimuth < 10)
                $azimuth_str = "0 0 " . $azimuth_str;

            if ($azimuth < 100 && $azimuth > 9)
                $azimuth_str = "0 " . $azimuth_str;

            # The phrase used for the bearing to the flight.
            $azimuth_words = ", bearing " . $azimuth_str . " degrees";
        }
        else
            $azimuth_words = "";

        # Our default sentance.  We form up the words needed.
        $words = "Flight " . $flightnum . $burst .  $alt_words .  $range_words . $azimuth_words . ".";

        # No packets alert.  If we havn't heard something from the flight for > 120 seconds, then we override the normal message.
        $secs_last_packet = $lastsecs;
        $nummins = ceil($elapsed_mins);
        if ($secs_last_packet > 120) {
            $words = "Warning, flight " . $flightnum . ". No packets for " . $nummins . " minutes.  Last update" . $alt_words . $range_words . $azimuth_words . ".";  
        }

        # If there is a landing prediction availble, then we use a different sentance
        if ($ttl != "" && $landingdistance_miles != "") {
            $ttl_words = $ttl_mins;

            # If we haven't seen a packet from this flight for > 120 secs, then we subtract that delta from the last calculated time-to-live figure.
            # This provides a more accurate estimate of WHEN the flight might land in the event we lose contact with it.
            if ($secs_last_packet > 120) {
                $ttl_words = floor(($ttl - $secs_last_packet) / 60.0);
                if ($ttl < 0)
                    $ttl_words = 0;

            }

            $words = $words . " Time to live, " . $ttl_words . " minutes";

            # The distance to the landing location from our own position (i.e. from GPS).
            $landingdistance = ceil($landingdistance_miles);

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
