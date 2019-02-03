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

    if ($formerror == false) {
        $query = "select f.flightid from flights f where f.flightid = $1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform SQL updates to the flightmap table here...
            $query = "delete from flights where flightid = $1;";
            
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                //printf ("<br><br>SQL=%s\n", $query);
                return 0;
            }
	    
	    // Now delete any references to this flight within the tracker teams table
            $query = "update teams set flightid=NULL where flightid = $1;";
            
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                //printf ("<br><br>SQL=%s\n", $query);
                return 0;
            }
	    
        }
    }
    sql_close($link);
    printf("[]");

?>
