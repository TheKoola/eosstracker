<?php
    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';


    if (isset($_GET["flightid"])) {
        $get_flightid = $_GET["flightid"];
    }
    else {
        $get_flightid = "";
        printf ("[]");
        return 0;
    }
    
    if (isset($_GET["callsign"])) {
        $get_callsign = $_GET["callsign"];
    }
    else {
        $get_callsign = "";
    }

    if (isset($_GET["num"])) {
        $get_num = $_GET["num"];
    }
    else
        $get_num = 5;



    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## query the list of callsigns for those flights that are active
    $query = 'select f.flightid, fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = true and f.flightid = $1;';
    //$result = sql_query($query);
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    if (sql_num_rows($result) <= 0) {
        sql_close($link);
        return 0;
    }


    $callsigns = [];
   
    // If no callsign was given, then just grab all the callsigns for this flightid
    if ($get_callsign == "") {
        $get_callsign = " and a.callsign in (";
   
        $firsttime = 1;
        while ($row = sql_fetch_array($result)) {
            $callsigns[$row['callsign']] = $row['flightid'];
            if ($firsttime == 0)
                $get_callsign = $get_callsign . ", ";
            $firsttime = 0;
            $get_callsign = $get_callsign . "'" . $row['callsign'] . "'";
        }    
        $get_callsign = $get_callsign . ")";
    }
    else
        $get_callsign = " and a.callsign = '" . $get_callsign . "' ";

    //printf ("%s", json_encode($callsigns));
    //print_r($get_callsign);


    //return 0;


/* ============================ */


    ## query the last packets from stations...
    $query = '
select distinct on (thetime)
--a.tm::timestamp without time zone as thetime, 
date_trunc(\'second\', a.tm)::timestamp without time zone as thetime,
case
    when a.ptype = \'/\' and a.raw similar to \'%[0-9]{6}h%\' then 
        date_trunc(\'second\', ((to_timestamp(substring(a.raw from position(\'h\' in a.raw) - 6 for 6), \'HH24MISS\')::timestamp at time zone \'UTC\') at time zone \'America/Denver\')::time)::time without time zone
    else
        date_trunc(\'second\', a.tm)::time without time zone
end as packet_time,
a.callsign, 
a.comment, 
a.symbol, 
round(a.altitude) as altitude, 
round(a.speed_mph) as speed_mph,
a.bearing,
round(cast(ST_Y(a.location2d) as numeric), 6) as latitude, 
round(cast(ST_X(a.location2d) as numeric), 6) as longitude, 
a.ptype,
a.hash

from 
packets a

where 
a.location2d != \'\' 
and a.tm > (now() - (to_char((\'' . $lookbackperiod . ' minute\')::interval, \'HH24:MI:SS\'))::time) ' 
. $get_callsign . ' order by thetime asc, a.callsign;';

#printf ("<br><br>%s<br><br>", $query);

#and a.tm < \'8-11-2018 10:18:00\' and a.tm > \'8-11-2018\' ' 

    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 
    $firsttime = 1; 
    $numrows = sql_num_rows($result);
    $packets = array();
    $peak_altitude = 0;

    $time_prev = [];
    $altitude_prev = [];
    $hash_prev = [];
    $verticalrate = [];
    $i = 0;
    while ($row = sql_fetch_array($result)) {

        // all the data from this return row...
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $comment = $row['comment'];
        $symbol = $row['symbol'];
        $latitude = $row['latitude'];
        $longitude = $row['longitude'];
        $altitude = $row['altitude'];
        $bearing = $row['bearing'];
        $speed_mph = $row['speed_mph'];
        $hash = $row['hash'];

        // calculate the vertical rate for this callsign
        $time1 = date_create($packettime);
        if (array_key_exists($callsign, $time_prev)) {
            if ($hash != $hash_prev[$callsign]) {
                $diff = date_diff($time_prev[$callsign], $time1);
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60;
                if ($time_delta > 0)
                    $verticalrate[$callsign] = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
                else
                    $verticalrate[$callsign] = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
                #$verticalrate[$callsign] = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
            }
        }

        $packets[] = array($thetime, $callsign, $get_flightid, $symbol, $latitude, $longitude, $altitude, $comment, $speed_mph, $bearing, (array_key_exists($callsign, $verticalrate) ? $verticalrate[$callsign] : 0));

        if (array_key_exists($callsign, $hash_prev)) {
            if ($hash != $hash_prev[$callsign]) {
                 $altitude_prev[$callsign] = $altitude;
                 $time_prev[$callsign] = $time1;
             }
       }
       if ($i == 0) {
           $time_prev[$callsign] = $time1;
           $altitude_prev[$callsign] = $altitude;
       }

       $hash_prev[$callsign] = $hash;
       $i++;
    }    

    $i = 0;
    $positioninfo = array_reverse($packets);
    printf ("[");
    foreach ($positioninfo as $row) {
        if ($i > $get_num)
            break;
        if ($i > 0)
            printf (", ");
        printf ("{ \"time\" : %s, \"callsign\" : %s, \"flightid\" : %s, \"symbol\" : %s, \"latitude\" : %s, \"longitude\" : %s, \"altitude\" : %s, \"comment\" : %s, \"speed\" : %s, \"bearing\" : %s, \"verticalrate\" : %s }", 
        json_encode($row[0]),
        json_encode($row[1]), 
        json_encode($row[2]), 
        json_encode($row[3]), 
        json_encode($row[4]), 
        json_encode($row[5]), 
        json_encode($row[6]), 
        json_encode($row[7]), 
        json_encode($row[8]), 
        json_encode($row[9]), 
        json_encode($row[10]));
        $i++;
    }
    printf ("]");


    sql_close($link);


?>
