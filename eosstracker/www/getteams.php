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


    ## Get a list of teams
    $query = '
        select 
        array_to_json(array_agg(a)) as json
   
        from 
        (select t.tactical from teams t order by t.tactical asc) as a;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
 

    $rows = [];
    if (sql_num_rows($result) > 0) {
        $rows = sql_fetch_all($result);
        foreach ($rows as $row) {
            printf("%s", $row["json"]);
        }
    }
    else
        printf("[]");

    sql_close($link);

?>
