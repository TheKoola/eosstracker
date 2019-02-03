<?php
    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';



   ## Look for the variable "flightid" to be set. 
    $flightstring = "";
    if (isset($_GET["flightid"])) {
        $flightid=$_GET["flightid"];
        $flightarray = explode(',', $flightid); 
        $flightstring = " and f.flightid in (";
        $firsttime = 1;
        foreach($flightarray as $flight) {
            if (! $firsttime)
                $flightstring = $flightstring . ",";
            $firsttime = 0;
            $flightstring = $flightstring . "'" . $flight . "'"; 
        }
        $flightstring = $flightstring . ") ";
    }



    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    ## query the last n packets heard from the database
    $query = "select distinct on (f.flightid, a.callsign, thetime) 
a.callsign, 
f.flightid, 
date_trunc('seconds', a.tm)::time without time zone as thetime, 
case
    when a.ptype = '/' and a.raw similar to '%[0-9]{6}h%' then 
        date_trunc('second', ((to_timestamp(substring(a.raw from position('h' in a.raw) - 6 for 6), 'HH24MISS')::timestamp at time zone 'UTC') at time zone 'America/Denver')::time)::time without time zone
    else
        date_trunc('second', a.tm)::time without time zone
end as packet_time,
a.altitude, 
a.hash 

from 
packets a, 
flights f, 
flightmap fm 

where 
fm.flightid = f.flightid 
and a.callsign = fm.callsign 
and a.location2d != '' 
and a.tm > (now() - (to_char(('" . $lookbackperiod . " minute')::interval, 'HH24:MI:SS'))::time)
and a.altitude > 0 
and active = 't'  " . $flightstring . " 

order by 
f.flightid, 
a.callsign, 
thetime asc; 
";

    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    $tdata = [];
    $adata = [];
    $callsigns = [];
    $numrows = sql_num_rows($result);

    $time_prev = [];
    $altitude_prev = [];
    $hash_prev = [];
    $verticalrate = [];

    $i = 0;

    while ($row = sql_fetch_array($result)) {

        // all the data from this return row...
        $flightid = $row['flightid'];
        $thetime = $row['thetime'];
        $packettime = $row['packet_time'];
        $callsign = $row['callsign'];
        $altitude = $row['altitude'];
        $hash = $row['hash'];
 

        // calculate the vertical rate for this callsign
        //$time1 = date_create($thetime);
        $time1 = date_create($packettime);
        if (array_key_exists($callsign, $time_prev)) {
            if ($hash != $hash_prev[$callsign]) {
                $diff = date_diff($time_prev[$callsign], $time1);
                $time_delta = ($diff->h)*60 + ($diff->i) + ($diff->s)/60;
                if ($time_delta > 0)
                    $verticalrate[$callsign][] = round(($altitude - $altitude_prev[$callsign])/$time_delta, 0);
                else
                    $verticalrate[$callsign][] = round(($altitude - $altitude_prev[$callsign])/(1/60), 0);
 
                $callsigns[$flightid][$callsign] = $callsign;
                $tdata[$callsign][]= $thetime;
                //$adata[$callsign][] = $altitude;
            }
        }


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


    if ($numrows > 0)
        printf ("[");
    $superfirsttime = 1;
    foreach ($callsigns as $flightid => $ray) {
        if (! $superfirsttime)
            printf (", ");
        $superfirsttime = 0;
        printf ("{ \"flightid\" : \"%s\", ", $flightid);
        printf ("\"chartdata\" : {");

        $outerfirsttime = 1;
        foreach ($ray as $cs) {
             if (! $outerfirsttime)
                 printf (", ");
             $outerfirsttime = 0;
             $innerfirsttime = 1;
             printf ("\"tm-%s\" : [", $cs);
             foreach ($tdata[$cs] as $value) {
                 if (! $innerfirsttime)
                     printf (", ");
                 $innerfirsttime = 0;
                 printf ("\"%s\"", $value);
             }
             printf ("], ");
    
             $innerfirsttime = 1;
             printf ("\"%s\" : [", $cs);
             foreach ($verticalrate[$cs] as $value) {
                 if (! $innerfirsttime)
                     printf (", ");
                 $innerfirsttime = 0;
                 printf ("%s", $value);
             }
             printf ("] ");
        }
        printf ("} }");
    }
    if ($numrows > 0)
        printf ("]");

//    print_r ($tdata);
//    print_r ($adata);

/*

    $rows = sql_fetch_all($result);
    if ($rows) {
        $myjson = json_encode($rows);
        echo $myjson;
    }
        
*/

    sql_close($link);


//    print_r ($rows);

?>
