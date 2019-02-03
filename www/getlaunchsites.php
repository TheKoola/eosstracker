<?php
    ###  This will query the database for the n most recent packets.  

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


    ## Get a list of flights and their callsign mapping
    $query = '
        select 
        l.launchsite,
        l.lat,
        l.lon,
        l.alt
   
        from 
        launchsites l
    
        order by 
        l.launchsite asc;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $rows = sql_fetch_all($result);
    if (sql_num_rows($result) > 0)
        printf("%s", json_encode($rows));
    else
        printf("[]");

    sql_close($link);

?>
