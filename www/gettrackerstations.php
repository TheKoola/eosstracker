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

    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();
  
    // Check the flightid HTML GET variable
    $get_flightid = "";
    $whereclause = "";
    if (isset($_GET["flightid"])) 
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) != "") 
            $whereclause = " and t.flightid = $1 ";


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


    // Check the starttime HTML GET variable
    // Must be > 1/1/2020 01:01:01
    // ...and <  12/31/2037 23:59:59
    $get_starttime = 1577840561;
    if (isset($_GET["starttime"]))
        if (check_number($_GET["starttime"], 1577840461, 2145916799))
            $get_starttime = intval($_GET["starttime"]);


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }
    

    ## query the last packets from stations...
    $query = "
        select
            y.thetime,
            y.callsign,
            y.hash,
            y.flightid,
            y.comment,
            y.symbol,
            round(y.altitude) as altitude,
            round(y.speed_mph) as speed_mph,
            round(y.bearing) as bearing,
            round(y.lat, 6) as latitude,
            round(y.lon, 6) as longitude,
            y.sourcename,
            y.freq,
            y.channel,
            case when array_length(y.path, 1) > 0 then
                split_part(y.path[array_length(y.path, 1)], '*', 1)
            else
                y.sourcename
            end as heardfrom,
            y.source,
            y.ptype,
            upper(y.tactical) as tactical

        from 
            (select 
                date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                a.callsign,
                t.flightid,
                a.altitude,
                a.comment,
                a.symbol,
                a.speed_mph,
                a.bearing,
                cast(ST_Y(a.location2d) as numeric) as lat,
                cast(ST_X(a.location2d) as numeric) as lon,

                -- This is the source name.  Basically the name of the RF station that we heard this packet from
                case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
                    split_part(a.raw, '>', 1)
                else
                    NULL
                end as sourcename,

                -- The frequency this packet was heard on
                round(a.frequency / 1000000.0,3) as freq,
                

                -- The Dire Wolf channel
                a.channel,

                -- The ranking of whether this was heard directly or via a digipeater
                dense_rank () over (partition by a.callsign order by 
                    date_trunc('millisecond', a.tm) desc,
                    a.channel asc,
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
                    ) as int) asc
                ),
                a.ptype,
                a.hash,
                a.raw,
                a.source,
                t.tactical,
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


                from packets a
                left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign,
                teams t,
                trackers tr

                where
                b.callsign is null
                and a.location2d != ''
                and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)
                and a.tm > (to_timestamp($2)::timestamp)
                and case
                    when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                        a.callsign  = tr.callsign
                    else
                        a.callsign like tr.callsign || '-%'
                end
                and t.tactical != 'ZZ-Not Active'
                and tr.tactical = t.tactical " .
                ($get_flightid == "" ? " and t.flightid is null " : " and t.flightid = $3 ") . "

                order by
                dense_rank,
                a.callsign,
                thetime) as y

            where
            y.dense_rank = 1

            order by
            y.thetime,
            y.callsign
                ;
    ";

    if ($get_flightid == "")
        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["lookbackperiod"] . " minute"),
            $get_starttime
        ));
    else
        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["lookbackperiod"] . " minute"), 
            $get_starttime,
            sql_escape_string($get_flightid)
        ));

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
//        if ($row['ptype'] == ';' || $row['ptype'] == ')')
 //           $callsign = $row['sourcename'];
  //      else
            $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $tactical = $row['tactical'];
        $speed_mph = $row['speed_mph'];
        $heardfrom = $row['heardfrom'];
        if (str_starts_with($row["source"], 'direwolf'))
            $frequency = ($row['freq'] == "" || $row['freq'] == 0 ? "ext radio" : ($row['freq'] != "n/a" ? $row['freq'] : "--"));
        else
            $frequency = "TCPIP";


        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical, $bearing, $speed_mph, $heardfrom, $frequency);
            else {
                //printf ("<br><strong>ERROR2:</strong> %s speed=%f<br>\n", $callsign, $speed);
                //print_r($positioninfo[$callsign]);
                //printf ("<br>(%s, %s, %s)<br><br>", $latitude, $longitude, $altitude);
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical, $bearing, $speed_mph, $heardfrom, $frequency);
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
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s, \"bearing\" : %s, \"speed\" : %s, \"heardfrom\" : %s, \"frequency\" : %s  },\n", 
            json_encode($callsign), 
            json_encode($callsign), 
            json_encode($positioninfo[$callsign][0]), 
            json_encode($positioninfo[$callsign][1]), 
            json_encode($positioninfo[$callsign][4]), 
            json_encode("Tactical:  " . $positioninfo[$callsign][6] . ($positioninfo[$callsign][5] == "" ? "" : "<br>") . $positioninfo[$callsign][5]), 
            json_encode($positioninfo[$callsign][6]),
            json_encode($positioninfo[$callsign][6]),
            json_encode($config["iconsize"]),
            json_encode($positioninfo[$callsign][7]),
            json_encode($positioninfo[$callsign][8]),  // speed
            json_encode(($positioninfo[$callsign][9] == $callsign ? "direct" : $positioninfo[$callsign][9])),  // heardfrom
            json_encode($positioninfo[$callsign][10])  // frequency
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
