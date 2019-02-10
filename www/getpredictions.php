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
