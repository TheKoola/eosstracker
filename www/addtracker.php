<?php
    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';


    if (isset($_GET["notes"])) {
        $get_notes = $_GET["notes"];
    }
    else {
        $get_notes = "";
    }

    if (isset($_GET["callsign"])) {
        $get_callsign = $_GET["callsign"];
    }
    else {
        $get_callsign = "";
    }
    
    if (isset($_GET["team"])) {
        $get_team = $_GET["team"];
    }
    else {
        $get_team = "";
    }


    ## if any of the GET parameters are not supplied, then exit...
    if ($get_team == "" || $get_callsign == "" || $get_notes == "") {
        printf ("{\"result\" : 0, \"error\": \"HTML form error\"}");
        return 0;
    }
  

    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $query = "insert into trackers values (upper($1), $2, $3);";
    $result = pg_query_params($link, $query, array(sql_escape_string($get_callsign), sql_escape_string($get_team), sql_escape_string($get_notes)));
    if (!$result) {
        printf ("{\"result\" : 0, \"error\": %s}", json_encode(sql_last_error()));
        sql_close($link);
        return 0;
    }
    
    // If we've made it this far then sucess!!
    printf ("{\"result\" : 1, \"error\": \"\"}");

    sql_close($link);

?>
