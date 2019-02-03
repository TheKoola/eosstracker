<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        printf("{\"result\": 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    //print_r($_GET);

    $formerror = false;
    if (isset($_GET["flightid"])) 
        $flightid = strtoupper($_GET["flightid"]);
    else
        $formerror = true;
    if (isset($_GET["callsign"]))
        $callsign = strtoupper($_GET["callsign"]);
    else
        $formerror = true;
    if (isset($_GET["description"]))
        $description = $_GET["description"];
    else
        $formerror = true;
    if (isset($_GET["frequency"]))
        $frequency = $_GET["frequency"];
    else
        $formerror = true;
    
    if ($flightid == "" || $callsign == "" || $description == "" || $frequency == "")
        $formerror = true;


    if ($formerror == false) {
        $query = "select flightid, description, active from flights where flightid = upper($1);";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
        if (!$result) {
            printf("{\"result\": 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // insert a new row into the flightmap table
            $query = "insert into flightmap values (upper($1), upper($2), $3, $4);";
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($callsign), sql_escape_string($description), $frequency));
            if (!$result) {
                printf("{\"result\": 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
            printf("{\"result\": 1, \"error\": \"\"}");
        }
        else
            printf("{\"result\": 0, \"error\": \"Flight does not exist\"}");
    }
    else
        printf("{\"result\": 0, \"error\": \"HTML form error\"}");

?>
