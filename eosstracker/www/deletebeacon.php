<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $formerror = false;
    if (isset($_GET["flightid"])) 
        $flightid = $_GET["flightid"];
    else
        $formerror = true;
    if (isset($_GET["callsign"]))
        $callsign = $_GET["callsign"];
    else
        $formerror = true;

    if ($formerror == false) {
        $query = "select f.flightid, fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.flightid = $1 and fm.callsign = $2;";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($callsign)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform SQL updates to the flightmap table here...
            $query = "delete from flightmap where flightid = $1 and callsign = $2;";
            
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($callsign)));
            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                return 0;
            }
        }
    }
    sql_close($link);
    print ("[]");

?>
