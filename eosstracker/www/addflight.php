<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    //print_r($_GET);

    $formerror = false;
    if (isset($_GET["flightid"])) 
        $flightid = strtoupper($_GET["flightid"]);
    else
        $formerror = true;
    if (isset($_GET["description"]))
        $description = $_GET["description"];
    else
        $formerror = true;

    if (isset($_GET["launchsite"]))
        $launchsite = $_GET["launchsite"];
    else
        $formerror = true;

    if (isset($_GET["monitoring"]))
        $active = "t";
    else
        $active = "f";

    if ($flightid == "" || $description == "" || $launchsite == "")
        $formerror = true;

    $beacons = array();

    // Beacon1 is required.  We need at least one beacon for every flight
    $i = 1;
    $cstr = "beacon" . $i . "_callsign";
    $fstr = "beacon" . $i . "_frequency";
    $dstr = "beacon" . $i . "_description";
    if (isset($_GET[$cstr]) && isset($_GET[$fstr]) && isset($_GET[$dstr])) {
        if ($_GET[$cstr] != "" && $_GET[$fstr] != "" && $_GET[$dstr] != "") {
            $beacons[] = array(sql_escape_string($flightid), sql_escape_string($_GET[$cstr]), sql_escape_string($_GET[$dstr]), $_GET[$fstr]);
        } 
        else 
            $formerror = true;
    }
    else
        $formerror = true;

    // Loop through the remaining beacons
    for ($i = 2; $i < 6; $i++) {
        $cstr = "beacon" . $i . "_callsign";
        $fstr = "beacon" . $i . "_frequency";
        $dstr = "beacon" . $i . "_description";
        if (isset($_GET[$cstr]) && isset($_GET[$fstr]) && isset($_GET[$dstr]))
            if ($_GET[$cstr] != "" && $_GET[$fstr] != "" && $_GET[$dstr] != "")
                $beacons[] = array(sql_escape_string($flightid), sql_escape_string($_GET[$cstr]), sql_escape_string($_GET[$dstr]), $_GET[$fstr]);
    }


    if ($formerror == false) {
        $query = "select flightid, description, active from flights where flightid = $1;";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid)));
        if (!$result) {
            printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            printf ("{\"result\": 0, \"error\": \"Flight already exists\"}");
        }
        else {
            // insert a new row into the flights table
            $query = "insert into flights values (upper($1), $2, now()::date, $3, $4);";
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($description), sql_escape_string($active), sql_escape_string($launchsite)));
            if (!$result) {
                printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }

            // insert rows into the flightmap table
            $query = "insert into flightmap values (upper($1), upper($2), $3, $4);";
            //print_r($beacons);
            foreach ($beacons as $bray) {
                $result = pg_query_params($link, $query, $bray);
                if (!$result) {
                    printf ("{\"result\": \"0\", \"error\": %s}", json_encode(sql_last_error()));
                    sql_close($link);
                    return 0;
                }
            } 
            printf ("{\"result\": \"1\", \"error\": \"\"}");
        }
    }
    else
        printf ("{\"result\": 0, \"error\": \"form error\"}");

?>
