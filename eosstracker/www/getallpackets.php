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


    ## query the last packets from stations...
    $query = '
select distinct 
date_trunc(\'second\', a.tm)::time without time zone || \', \' || a.raw as packet

from 
packets a 

where 
a.tm > (now() - interval \'03:00:00\')
--a.tm > (now() - (to_char((\'' . $lookbackperiod . ' minute\')::interval, \'HH24:MI:SS\'))::time)
and a.raw != \'\' 
order by 1 desc;';

    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    if (sql_num_rows($result) > 0)
        printf ("%s", json_encode(sql_fetch_all($result)));
    else
        printf ("[]");
    sql_close($link);

?>
