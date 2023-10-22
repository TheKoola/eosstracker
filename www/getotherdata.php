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
    $query = "select 
            date_trunc('milliseconds', f.tm)::timestamp without time zone as thetime,
            f.hash,
            f.callsign,
            f.sourcename,
            case when array_length(f.path, 1) > 0 then
                f.path[array_length(f.path, 1)]
            else
                f.sourcename
            end as heardfrom,
            f.comment,
            f.speed_mph,
            f.symbol,
            f.bearing,
            f.altitude,
            f.latitude,
            f.longitude,
            f.ptype, 
            f.freq,
            f.raw,
            f.path,
            f.dense_rank
            
            from
                (select distinct
                a.hash,
                a.tm,
                a.callsign, 
                case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
                    split_part(a.raw, '>', 1)
                else
                    NULL
                end as sourcename,
                a.comment, 
                a.symbol, 
                a.bearing,
                round(a.speed_mph) as speed_mph,
                round(a.altitude) as altitude, 
                round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
                round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
                a.ptype,
                round(a.frequency / 1000000.0,3) as freq, 
                dense_rank () over (partition by a.hash order by cast(
                    cardinality((string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]) as int) asc, 
                    a.channel asc,
                    date_trunc('millisecond', a.tm) asc
                ), 
                a.raw,
                case when a.raw similar to '%>%:%' then
                    (string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]
                else
                    NULL
                end as path

                from packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign
                left outer join (select t.callsign from trackers t order by t.callsign) as c 
                on case
                   when c.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                       a.callsign  = c.callsign
                   else 
                       a.callsign like c.callsign || '-%'
                end
                left outer join (
                    select distinct on (z.hash)
                    z.hash,
                    z.callsign,
                    max(z.tm) as thetime

                    from
                    packets z

                    where
                    z.location2d != '' 
                    and z.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                    and z.tm > (to_timestamp($2)::timestamp)
                    and (z.source not like 'direwolf%' and z.source not like 'ka9q-radio%')

                    group by
                    z.hash,
                    z.callsign

                    order by
                    z.hash
                --) as dw on dw.callsign = a.callsign and (abs(extract(epoch from (dw.thetime  - a.tm))) < 1  or dw.thetime >= a.tm or dw.hash = a.hash)
                ) as dw on dw.callsign = a.callsign and dw.thetime >= (a.tm + interval '00:00:08')

                where 
                b.callsign is null
                and c.callsign is null
                and dw.hash is null
                and a.location2d != '' 
                and a.tm > (now() - (to_char(($3)::interval, 'HH24:MI:SS'))::time) 
                and a.tm > (to_timestamp($4)::timestamp)
                and a.symbol != '/_'
                and (a.source like 'direwolf%' or a.source like 'ka9q-radio%')

                order by 
                a.hash,
                a.tm,
                a.callsign) as f

            where 
            f.dense_rank = 1

            order by
            thetime asc,
            f.callsign
        ;
    ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"),
        $get_starttime,
        sql_escape_string($config["lookbackperiod"] . " minute"),
        $get_starttime
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
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $speed_mph = $row['speed_mph'];
        $heardfrom = $row['heardfrom'];
        $frequency = ($row['freq'] == "" ? "ext radio" : ($row['freq'] != "n/a" ? $row['freq'] : ""));
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing, $speed_mph, $heardfrom, $frequency);
            else {
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing, $speed_mph, $heardfrom, $frequency);
    }    



/* this is for the FeatureCollection preamble */
    printf ("{ \"rfstations\" : ");
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"RF Stations\" }, \"features\" : [ ");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
       
        /* This prints out the GeoJSON object for this station */
        printf ("{ \"type\" : \"Feature\",\n");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s, \"bearing\" : %s, \"speed\" : %s, \"heardfrom\" : %s, \"frequency\" : %s },\n", 
            json_encode($callsign),  // id
            json_encode($callsign),  // callsign
            json_encode($positioninfo[$callsign][0]),  // time
            json_encode($positioninfo[$callsign][1]),  // symbol
            json_encode($positioninfo[$callsign][4]),  // altitude
            json_encode($positioninfo[$callsign][5] == "" ? "" : $positioninfo[$callsign][5]),  // comment
            json_encode($callsign),  // tooltip
            json_encode($callsign),  // label
            json_encode($config["iconsize"]),  // iconsize
            json_encode($positioninfo[$callsign][6]),  // bearing
            json_encode($positioninfo[$callsign][7]),  // speed
            json_encode(($positioninfo[$callsign][8] == $callsign ? "direct" : $positioninfo[$callsign][8])),  // heardfrom
            json_encode($positioninfo[$callsign][9])  // frequency
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}\n", $positioninfo[$callsign][3], $positioninfo[$callsign][2]);
        printf ("}");
        /*if (count($ray) > 1 && $config["plottracks"] == "on") {
            printf (", ");
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s },", json_encode($callsign . "_path"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }\n", json_encode($linestring));
            unset ($linestring);
        }
         */
    }

/* This is for the ending of a FeatureCollection */
    printf ("] }");
    printf (", \"weatherstations\" : ");


    /*********************** get weather station data *******************/

    ## query the last packets with positions from weather stations...
    $query = "
        select distinct 
        date_trunc('millisecond', z.tm)::timestamp without time zone as thetime,
        z.callsign, 
        z.comment, 
        z.symbol, 
        z.bearing,
        round(z.altitude) as altitude, 
        round(z.latitude, 6) as latitude, 
        round(z.longitude, 6) as longitude, 
        z.ptype,
        z.source,
        z.freq,
        z.channel,
        case when array_length(z.path, 1) > 0 then
            z.path[array_length(z.path, 1)]
        else
            z.sourcename
        end as heardfrom,
        case
            when z.raw similar to '%_[0-9]{3}/[0-9]{3}g%' then
                case when to_number(substring(z.raw from position('_' in z.raw) + 1 for 3), '999') <= 180 then
                    to_number(substring(z.raw from position('_' in z.raw) + 1 for 3), '999') + 180
                else
                    to_number(substring(z.raw from position('_' in z.raw) + 1 for 3), '999') - 180
                end
            else
                NULL
        end as wind_angle_bearing,

        case    
            when z.raw similar to '%_[0-9]{3}/[0-9]{3}g%' then
                to_number(substring(z.raw from position('_' in z.raw) + 1 for 3), '999')
            else
                NULL
        end as wind_angle_heading,

        case
            when z.raw similar to '%_[0-9]{3}/[0-9]{3}g%' then
                to_number(substring(z.raw from position('_' in z.raw) + 5 for 3), '999')
            else
                NULL
        end as wind_magnitude_mph,

        case
            when z.raw similar to '%_[0-9]{3}/[0-9]{3}g[0-9]{3}%' then
                to_number(substring(z.raw from position('_' in z.raw) + 9 for 3), '999')
            else
                NULL
        end as windgust_magnitude_mph,
        case
            when z.raw similar to '%_%t[-0-9]{3}%' then
                to_number(substring(z.raw from position('_' in z.raw) + 13 for 3), '999')
            else
                NULL
        end as temperature


        from 
        (
            select 
            a.tm, 
            a.callsign, 
            a.comment, 
            a.symbol,
            a.bearing, 
            a.altitude,
            cast(st_y(a.location2d) as numeric) as latitude,
            cast(st_x(a.location2d) as numeric) as longitude,
            a.ptype,
            a.raw,
            case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%%' then
                split_part(a.raw, '>', 1)
            else
                NULL
            end as sourcename,
            a.source,
            a.frequency as freq,
            a.channel,
            dense_rank () over (partition by
                a.hash,
                date_trunc('minute', a.tm)

                order by
                a.tm asc
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
            packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign

            where 
            b.callsign is null
            and a.location2d != '' 
            and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
            and a.tm > (to_timestamp($2)::timestamp)
            and a.symbol = '/_'

            order by 
            a.tm asc, 
            a.callsign 
        ) as z

        where
        z.dense_rank = 1

        order by
        thetime,
        z.callsign
        ;
    ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"),
        $get_starttime
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
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $wind_bearing = $row['wind_angle_bearing'];
        $wind_heading = $row['wind_angle_heading'];
        $wind = $row['wind_magnitude_mph'];
        $windgusts = $row['windgust_magnitude_mph'];
        $temperature = $row['temperature'];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array(
                    $thetime, 
                    $symbol, 
                    $latitude, 
                    $longitude, 
                    $altitude, 
                    $comment, 
                    $bearing, 
                    $wind_bearing, 
                    $wind_heading, 
                    $wind, 
                    $windgusts, 
                    $temperature
                );
            else {
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array(
                $thetime, 
                $symbol, 
                $latitude, 
                $longitude, 
                $altitude, 
                $comment, 
                $bearing, 
                $wind_bearing, 
                $wind_heading, 
                $wind, 
                $windgusts, 
                $temperature
            );
    }    

/* this is for the FeatureCollection preamble */
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Weather Stations\" }, \"features\" : [ ");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
       
        /* This prints out the GeoJSON object for this station */
        printf ("{ \"type\" : \"Feature\",\n");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s, \"bearing\" : %s },\n", 
            json_encode($callsign),  // id
            json_encode($callsign),  // callsign
            json_encode($positioninfo[$callsign][0]),  // time
            json_encode($positioninfo[$callsign][1]),  // symbol 
            json_encode($positioninfo[$callsign][4]),  // altitude
            json_encode("Wind: " . $positioninfo[$callsign][9] . "mph from " . $positioninfo[$callsign][8] . "&#176; (bearing: " . $positioninfo[$callsign][7] . "&#176;),  gusting to: " . $positioninfo[$callsign][10] . "mph<br>" . 
                "Temp: " . $positioninfo[$callsign][11] . "&#176; F"),
            json_encode($callsign), // tooltip
    	    json_encode($callsign),  // label
    	    json_encode($config["iconsize"]), // iconsize
    	    json_encode($positioninfo[$callsign][6]) // bearing
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}\n", $positioninfo[$callsign][3], $positioninfo[$callsign][2]);
        printf ("}");
        /*if (count($ray) > 1 && $config["plottracks"] == "on") {
            printf (", ");
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s },", json_encode($callsign . "_path"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }\n", json_encode($linestring));
            unset ($linestring);
        }*/
    }

/* This is for the ending of a FeatureCollection */
    printf ("] }");
    printf (", \"inetstations\" : ");


    /******************** other stations *****************/

        $query = "
            select distinct
            date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
            a.callsign, 
            a.comment, 
            a.symbol, 
            a.bearing,
            round(a.altitude) as altitude, 
            round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
            round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
            a.ptype

            from packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign
            left outer join (select t.callsign from trackers t order by t.callsign) as c 
            on case
               when c.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                   a.callsign  = c.callsign
               else 
                   a.callsign like c.callsign || '-%'
            end
            left outer join (
                select distinct on (z.hash)
                z.hash,
                z.callsign,
                max(z.tm) as thetime

                from
                packets z

                where
                z.location2d != '' 
                and z.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                and z.tm > (to_timestamp($2)::timestamp)
                and (z.source like 'direwolf%' or z.source like 'ka9q-radio%')

                group by
                z.hash,
                z.callsign

                order by
                z.hash
            --) as dw on dw.callsign = a.callsign and (abs(extract(epoch from (dw.thetime  - a.tm))) < 1  or dw.thetime >= a.tm or dw.hash = a.hash)
            ) as dw on dw.callsign = a.callsign and dw.thetime >= (a.tm - interval '00:00:08') 

            where 
            b.callsign is null
            and c.callsign is null
            and a.location2d != '' 
            and dw.hash is null
            and a.tm > (now() - (to_char(($3)::interval, 'HH24:MI:SS'))::time) 
            and a.tm > (to_timestamp($4)::timestamp)
            and a.symbol != '/_'
            and (a.source not like 'direwolf%' and a.source not like 'ka9q-radio%')

            order by 
            thetime asc,
            a.callsign
            ;
        "; 

        $result = pg_query_params($link, $query, array(
            sql_escape_string($config["lookbackperiod"] . " minute"),
            $get_starttime,
            sql_escape_string($config["lookbackperiod"] . " minute"),
            $get_starttime
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
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $bearing = $row['bearing'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing);
            else {
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing);
    }    



/* this is for the FeatureCollection preamble */
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Inet Stations\" }, \"features\" : [ ");

    $firsttimeinloop = 1;
    foreach ($features as $callsign => $ray) {
        if ($firsttimeinloop == 0)
            printf (", ");
        $firsttimeinloop = 0;
       
        /* This prints out the GeoJSON object for this station */
        printf ("{ \"type\" : \"Feature\",\n");
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s, \"bearing\" : %s },\n", 
            json_encode($callsign), 
            json_encode($callsign), 
            json_encode($positioninfo[$callsign][0]), 
            json_encode($positioninfo[$callsign][1]), 
            json_encode($positioninfo[$callsign][4]), 
            json_encode($positioninfo[$callsign][5]), 
            json_encode($callsign),
	    json_encode($callsign),
	    json_encode($config["iconsize"]),
	    json_encode($positioninfo[$callsign][6])
        );
        printf ("\"geometry\" : { \"type\" : \"Point\", \"coordinates\" : [%s, %s]}\n", $positioninfo[$callsign][3], $positioninfo[$callsign][2]);
        printf ("}");
        /*if (count($ray) > 1 && $config["plottracks"] == "on") {
            printf (", ");
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s },", json_encode($callsign . "_path"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }\n", json_encode($linestring));
            unset ($linestring);
        }*/
    }

/* This is for the ending of a FeatureCollection */
    printf ("] }");



/******************** tracker stations *****************/
    printf (", \"trackerstations\" : ");

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
                y.path[array_length(y.path, 1)]
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
                --and a.tm > (to_timestamp($2)::timestamp)
                and case
                    when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                        a.callsign  = tr.callsign
                    else
                        a.callsign like tr.callsign || '-%'
                end
                and t.tactical != 'ZZ-Not Active'
                and tr.tactical = t.tactical 
                and t.flightid is null 

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

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute")
        //$get_starttime
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
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical, $bearing, $speed_mph, $heardfrom, $frequency);
    }    

/* this is for the FeatureCollection preamble */
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"Tracker Stations\" }, \"features\" : [ ");

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
        /*if (count($ray) > 1 && $config["plottracks"] == "on") {
            printf (", ");
            foreach ($ray as $k => $elem) {
                $linestring[] = array($elem[1], $elem[0]);
            }
            printf ("{ \"type\" : \"Feature\", \"properties\" : { \"id\" : %s },", json_encode($callsign . "_path"));
            printf ("\"geometry\" : { \"type\" : \"LineString\", \"coordinates\" : %s }  }\n", json_encode($linestring));
            unset ($linestring);
        } */
    }


    /* This is for the ending of a FeatureCollection */
    printf ("] }");


    /*********************** get APRS message packets heard over RF*******************/

    $query = "
     select 
        array_to_json(array_agg(c)) as json
     from
        (select 
            date_trunc('milliseconds', f.tm)::timestamp without time zone as thetime,
            f.callsign as callsign_from,
            case when array_length(f.message, 1) > 0 then
                rtrim(f.message[1])
            else
                NULL
            end as callsign_to,
            case when array_length(f.message, 1) > 1 then
                (regexp_split_to_array(f.message[2], '{'))[1]
            else
                NULL
            end as the_message,
            case when array_length(f.message, 1) > 1 then
                (regexp_split_to_array(f.message[2], '{'))[2]
            else
                NULL
            end as message_num,
            case when f.raw like '%ARISS%' then
                1
            else
                0
            end as sat
            
            from
                (select distinct
                a.hash,
                a.tm,
                a.callsign, 
                case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
                    split_part(a.raw, '>', 1)
                else
                    NULL
                end as sourcename,
                a.ptype,
                a.raw,
                case when a.raw similar to '%>%:%' then
                    (string_to_array(regexp_replace(split_part(split_part(a.raw, ':', 1), '>', 2), ',WIDE[0-9]*[\-]*[0-9]*', '', 'g'), ','))[2:]
                else
                    NULL
                end as path,
                case when a.raw similar to '%>%::%' then
                        regexp_split_to_array(split_part(a.raw, '::', 2), ':')
                else
                    NULL
                end as message,
                rank() over (partition by a.callsign order by a.tm desc)

                from packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign

                where 
                b.callsign is null
                and a.tm > now()::date
                and a.ptype = ':'
                and (a.source like 'direwolf%' or a.source like 'ka9q-radio%')
                and a.raw not like ('%:PARM.%')
                and a.raw not like ('%:UNIT.%')
                and a.raw not like ('%:EQNS.%')
                and a.raw not like ('%:BITS.%')

                order by 
                a.tm,
                a.callsign) as f

            where 
            f.rank = 1

            order by
            thetime desc,
            f.callsign
        ) as c
    ;";

    $result = pg_query($link, $query);

    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $numrows = sql_num_rows($result);

    printf (", \"messages\" : ");
    if ($numrows > 0) {
        $rows = sql_fetch_all($result);
        if ($rows[0]['json'] != "")
            printf("%s", $rows[0]['json']);
        else
            printf("[]");

    }
    else 
        printf("[]");

/******************** my station *****************/
    printf (", \"myposition\" : ");

    // get the latest position from the gpsposition table
    $query = 'select date_trunc(\'second\', tm)::timestamp without time zone as time, round(speed_mph) as speed_mph, bearing, round(altitude_ft) as altitude_ft, round(cast(ST_Y(location2d) as numeric), 6) as latitude, round(cast(ST_X(location2d) as numeric), 6) as longitude from gpsposition order by tm desc limit 1;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    $rows = sql_fetch_array($result);
    $feature['type'] = "Feature";
    $feature['properties']['speed_mph'] = $rows['speed_mph'];
    $feature['properties']['altitude'] = $rows['altitude_ft'];
    $feature['properties']['bearing'] = $rows['bearing'];
    $feature['properties']['time'] = $rows['time'];
    $feature['properties']['callsign'] = "My Location";
    $feature['properties']['tooltip'] = "";
    $feature['properties']['id'] = "My Location";
    $feature['properties']['symbol'] = "1x";
    $feature['properties']['comment'] = "";
    $feature['properties']['frequency'] = "";
    $feature['properties']['iconsize'] = $config["iconsize"];
    $feature['geometry']['type'] = "Point";
    $feature['geometry']['coordinates'] = array($rows['longitude'], $rows['latitude']); 

    $myposition = array(
        "type" => "FeatureCollection",
        "properties" => array(
            "name" => "My station"
        ),
        "features" => [$feature]
    );

    printf ("%s", json_encode($myposition));


    printf ("     }");
    sql_close($link);
?>
