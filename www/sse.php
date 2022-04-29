<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2021,2022 Jeff Deaton (N6BA)
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


ignore_user_abort(true);

header("X-Accel-Buffering: no"); // disable ngnix webServer buffering
header("Content-Type: text/event-stream");
header("Cache-Control: no-cache");
header("Access-Control-Allow-Origin: *");

if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';

$i = 0;

## Connect to the database
$link = connect_to_database();
if (!$link) {
    //db_error(sql_last_error());
    printf("id: %d\ndata: failed to connect to database.\n\n", $i++);
    ob_flush();
    flush();
    exit();
}

$listen_result = pg_query($link, "listen gpsupdate; listen flightpacket;");

printf("data: %s\n\n", "Connection initiated.");
ob_flush();
flush();

while (1) {
    if (connection_aborted()) {
        exit();
    }
    else {
        $notify = pg_get_notify($link);
        if ($notify) {
            $payload = trim($notify["payload"], '"');
            printf("event: gpsupdate\nid: %d\ndata: %s\n\n", $i++, stripslashes($payload));
            ob_flush();
            flush();
        }
        sleep(1);
    }
}

?>
