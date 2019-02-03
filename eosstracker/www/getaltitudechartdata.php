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
date_trunc('second', a.tm)::time without time zone as thetime, 
round(a.altitude, 0) as altitude

from 
packets a, 
flights f, 
flightmap fm 

where 
fm.flightid = f.flightid 
and a.callsign = fm.callsign 
and a.tm > (now() - (to_char(('" . $lookbackperiod . " minute')::interval, 'HH24:MI:SS'))::time)
and a.altitude > 0 and active = 't'  " . $flightstring . " 

order by 
f.flightid, 
a.callsign, 
thetime asc; ";

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


    while ($row = sql_fetch_array($result)) {
        $cs = $row['callsign'];
        $flightid = $row['flightid'];
        $callsigns[$flightid][$cs] = $cs;
        
        $tdata[$cs][]= $row['thetime'];
        $adata[$cs][] = $row['altitude'];
    }    


/*    printf ("{ \"xs\" : { \n");
    $outerfirsttime = 1;
    foreach ($callsigns as $cs) {
         if (! $outerfirsttime)
             printf (", ");
         $outerfirsttime = 0;
         printf ("\"%s\" : {", $cs);
         printf (" \"xname\" : \"tm-%s\", ", $cs);
         printf (" \"yname\" : \"%s\"} ", $cs);
    }
    printf ("} , \n");
*/

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
             foreach ($adata[$cs] as $value) {
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
