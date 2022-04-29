<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2021 Jeff Deaton (N6BA)
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


if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
    $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
else
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
header("Content-Type:  application/json;");

    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    $query = "delete from predictiondata where thedate < now() - interval '14 day';";
    $result = pg_query($link, $query);
    if (!$result) {
        printf("[{\"result\": \"1\", \"error\": \"A database error occurred.\"}]");
        sql_close($link);
        return 0;
    }
    printf("[{\"result\": \"0\", \"error\": \"Success\"}]");
    sql_close($link);

?>
