<?php
    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';



    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    ## get configuration info
    $query = 'select distinct flightid, launchsite, thedate from predictiondata order by thedate desc, flightid desc, launchsite;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
   
    printf ("[ ");
    $firsttime = 1;
    while ($row = sql_fetch_array($result)) {
        if ($firsttime == 0)
            printf (", ");
        $firsttime = 0;
        printf ("{ \"flightid\" : %s, \"launchsite\" : %s, \"thedate\" : %s }\n", json_encode($row['flightid']), json_encode($row["launchsite"]), json_encode($row['thedate']));
    }
    printf ("] ");

    sql_close($link);

?>
