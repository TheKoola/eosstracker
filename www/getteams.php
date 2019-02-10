<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019, Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################
*
 */


    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


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
