<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    //print_r($_GET);

    $formerror = false;
    if (isset($_GET["flightid"])) 
        $flightid = $_GET["flightid"];
    else
        $formerror = true;
    if (isset($_GET["active"]))
        $active = $_GET["active"];
    else
        $formerror = true;

    if ($formerror == false) {
        // perform SQL updates to the flights and flightmap tables here...
        $query = "update flights set active = $1  where flightid = $2;";
        $result = pg_query_params($link, $query, array(sql_escape_string($active), sql_escape_string($flightid)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
    }

    sql_close($link);
    printf ("[]");

?>
