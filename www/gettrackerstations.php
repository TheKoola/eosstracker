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


//    print_r ($_SESSION);
 //   printf ("<br>");

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }
    

    ## query the last packets from stations...
    $query = '
select distinct 
--a.tm::timestamp without time zone as thetime, 
date_trunc(\'second\', a.tm)::timestamp without time zone as thetime,
a.callsign, 
a.comment, 
a.symbol, 
round(a.altitude) as altitude, 
round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
a.ptype,
upper(t.tactical) as tactical

from 
packets a left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = \'t\') as b on a.callsign = b.callsign,
teams t, 
trackers tr

where 
b.callsign is null
and a.location2d != \'\' 
and a.tm > (now() - (to_char(($1)::interval, \'HH24:MI:SS\'))::time) 
and case
   when tr.callsign similar to \'[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}\' then
       a.callsign  = tr.callsign
   else 
       a.callsign like tr.callsign || \'-%\'
end
and tr.tactical = t.tactical ' .
($get_flightid == "" ? " and t.flightid is null " : " and t.flightid = $2 ") . '

order by 
thetime asc, 
a.callsign ;'; 

#--and a.callsign like tr.callsign || \'-%\'


    if ($get_flightid == "")
        $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute")));
    else
        $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute"), sql_escape_string($get_flightid)));

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
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $tactical = $row['tactical'];

        $features[$callsign][$latitude . $longitude . $altitude] = array($latitude, $longitude, $altitude);

        if (array_key_exists($callsign, $positioninfo)) {
            $speed = calc_speed($latitude, $longitude, $positioninfo[$callsign][2], $positioninfo[$callsign][3], $positioninfo[$callsign][0], $thetime);
            if ($speed < 310) 
                $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical);
            else {
                //printf ("<br><strong>ERROR2:</strong> %s speed=%f<br>\n", $callsign, $speed);
                //print_r($positioninfo[$callsign]);
                //printf ("<br>(%s, %s, %s)<br><br>", $latitude, $longitude, $altitude);
                unset($features[$callsign][$latitude . $longitude . $altitude]);
            }
        }
        else
            $positioninfo[$callsign] = array($thetime, $symbol, $latitude, $longitude, $altitude, $comment, $tactical);
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
        printf ("\"properties\" : { \"id\" : %s, \"callsign\" : %s, \"time\" : %s, \"symbol\" : %s, \"altitude\" : %s, \"comment\" : %s, \"tooltip\" : %s, \"label\" : %s, \"iconsize\" : %s },\n", 
            json_encode($callsign), 
            json_encode($callsign), 
            json_encode($positioninfo[$callsign][0]), 
            json_encode($positioninfo[$callsign][1]), 
            json_encode($positioninfo[$callsign][4]), 
            json_encode("Tactical:  " . $positioninfo[$callsign][6] . ($positioninfo[$callsign][5] == "" ? "" : "<br>") . $positioninfo[$callsign][5]), 
            json_encode($positioninfo[$callsign][6]),
            json_encode($positioninfo[$callsign][6]),
            json_encode($config["iconsize"])
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
