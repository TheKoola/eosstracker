<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $formerror = false;
    if (isset($_GET["launchsite"])) 
        $launchsite = $_GET["launchsite"];
    else
        $formerror = true;

    if ($formerror == false) {
        $query = "select l.launchsite from launchsites l where l.launchsite = $1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($launchsite)));
        if (!$result) {
            printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform SQL updates to the flightmap table here...
            $query = "delete from launchsites where launchsite = $1;";
            $result = pg_query_params($link, $query, array(sql_escape_string($launchsite)));
            if (!$result) {
                printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
            printf ("{\"result\" : 1, \"error\": \"\"}");
        }
        else
            printf ("{\"result\" : 0, \"error\": \"Launch site does not exist\"}");
    }
    else
       printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");

    sql_close($link);

?>
