<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2020, Jeff Deaton (N6BA)
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
    

    ## query the last packets with positions from weather stations...
    $query = '
        select distinct 
        date_trunc(\'second\', a.tm)::timestamp without time zone as thetime,
        a.callsign, 
        a.comment, 
        a.symbol, 
        a.bearing,
        round(a.altitude) as altitude, 
        round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
        round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
        a.ptype,
  
        case
            when a.raw similar to \'%_[0-9]{3}/[0-9]{3}g%\' then
                case when to_number(substring(a.raw from position(\'_\' in a.raw) + 1 for 3), \'999\') <= 180 then
                    to_number(substring(a.raw from position(\'_\' in a.raw) + 1 for 3), \'999\') + 180
                else
                    to_number(substring(a.raw from position(\'_\' in a.raw) + 1 for 3), \'999\') - 180
                end
            else
                NULL
        end as wind_angle_bearing,

        case    
            when a.raw similar to \'%_[0-9]{3}/[0-9]{3}g%\' then
                to_number(substring(a.raw from position(\'_\' in a.raw) + 1 for 3), \'999\')
            else
                NULL
        end as wind_angle_heading,

        case
            when a.raw similar to \'%_[0-9]{3}/[0-9]{3}g%\' then
                to_number(substring(a.raw from position(\'_\' in a.raw) + 5 for 3), \'999\')
            else
                NULL
        end as wind_magnitude_mph,

        case
            when a.raw similar to \'%_[0-9]{3}/[0-9]{3}g[0-9]{3}%\' then
                to_number(substring(a.raw from position(\'_\' in a.raw) + 9 for 3), \'999\')
            else
                NULL
        end as windgust_magnitude_mph,
        case
            when a.raw similar to \'%_%t[\-0-9]{3}%\' then
                to_number(substring(a.raw from position(\'_\' in a.raw) + 13 for 3), \'999\')
            else
                NULL
        end as temperature


        from 
        packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = \'t\') as b on a.callsign = b.callsign
        left outer join (select t.callsign from trackers t order by t.callsign) as c 
        on case
           when c.callsign similar to \'[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}\' then
               a.callsign  = c.callsign
           else 
               a.callsign like c.callsign || \'-%\'
        end

        where 
        b.callsign is null
        and c.callsign is null
        and a.location2d != \'\' 
        and a.tm > (now() - (to_char(($1)::interval, \'HH24:MI:SS\'))::time) 
        and a.symbol = \'/_\'

        order by 
        thetime asc, 
        a.callsign ;'; 

    //printf ("<br>%s<br><br><br>", $query);

    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute")));
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
        $wind_bearing = $row['wind_angle_bearing'];
        $wind_heading = $row['wind_angle_heading'];
        $wind = $row['wind_magnitude_mph'];
        $windgusts = $row['windgust_magnitude_mph'];
        $temperature = $row['temperature'];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                #$positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $bearing);
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
                //printf ("<br><strong>ERROR2:</strong> %s speed=%f<br>\n", $callsign, $speed);
                //print_r($positioninfo[$callsign]);
                //printf ("<br>(%s, %s, %s)<br><br>", $latitude, $longitude, $altitude);
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
    printf ("{ \"type\" : \"FeatureCollection\", \"properties\" : { \"name\" : \"APRS Objects\" }, \"features\" : [ ");

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
