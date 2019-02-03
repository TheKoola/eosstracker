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
        //printf ("[{ \"packet\" : \"no data\" }]");
        printf ("[]");
        return 0;
    }
    
    if (isset($_GET["callsign"])) {
        $get_callsign = $_GET["callsign"];
    }
    else {
        $get_callsign = "";
    }

    #print_r($_SESSION);
    #printf ("<br><br>");

    #printf ("mycallsign:  %s,  lookbackperiod:  %s", $mycallsign, $lookbackperiod);
    #printf ("<br><br>");

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## query the list of callsigns for those flights that are active
    $query = 'select f.flightid, fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.flightid = $1;';
    //$result = sql_query($query);
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    if (sql_num_rows($result) <= 0) {
        printf ("[ ]");
        //printf ("[{ \"packet\" : \"no data\" }]");
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
select distinct 
date_trunc(\'second\', a.tm)::time without time zone || \', \' || a.raw as packet

from 
packets a 

where 
a.tm > now()::date
--a.tm > \'07-21-2018\' 
and a.raw != \'\' '
 . $get_callsign . ' order by 1 desc;';

#printf ("<br><br>%s<br><br>", $query);


    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    if (sql_num_rows($result) > 0)
        printf ("%s", json_encode(sql_fetch_all($result)));
    else
        //printf ("[{ \"packet\" : \"no data\" }]");
        printf ("[]");
    sql_close($link);

?>
