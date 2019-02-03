<?php

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';


    if (isset($_GET["launchsite"])) {
        $get_launchsite = $_GET["launchsite"];
    }
    else {
        $get_launchsite = "";
    }

    if (isset($_GET["flightid"])) {
        $get_flightid = $_GET["flightid"];
    }
    else {
        $get_flightid = "";
    }
    
    ## if any of the GET parameters are not supplied, then exit...
    if ($get_flightid == "" || $get_launchsite == "") {
        printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");
        return 0;
    }
  
    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $query = "update flights set launchsite=$1 where flightid=$2;";
    $result = pg_query_params($link, $query, array(sql_escape_string($get_launchsite), sql_escape_string($get_flightid)));
    if (!$result) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }
    
    printf ("{\"result\" : 1, \"error\": \"\"}");

    sql_close($link);

?>
