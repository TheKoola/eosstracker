<?php

session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include_once $documentroot . '/common/sessionvariables.php';



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
    if (isset($_GET["thedate"])) 
        $thedate = $_GET["thedate"];
    else
        $formerror = true;
    if (isset($_GET["launchsite"])) 
        $launchsite = $_GET["launchsite"];
    else
        $formerror = true;

    if ($formerror == false) {
        #$query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = '" . sql_escape_string($flightid) . "' and launchsite = '" . sql_escape_string($launchsite) . "' and thedate = '" . sql_escape_string($thedate) . "'";
        $query = "select distinct flightid, launchsite, thedate from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3;";
        $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }
        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            // perform deletes
            ##$query = "delete from predictiondata where flightid = '" . sql_escape_string($flightid) . "' and launchsite = '" . sql_escape_string($launchsite) . "' and thedate = '" . sql_escape_string($thedate) . "'";
            $query = "delete from predictiondata where flightid = $1 and launchsite = $2 and thedate = $3;";
            $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($launchsite), sql_escape_string($thedate)));
            if (!$result) {
                db_error(sql_last_error());
                sql_close($link);
                //printf ("<br><br>SQL=%s\n", $query);
                return 0;
            }
        }
    }
    printf ("[]");

?>
