<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020, Jeff Deaton (N6BA)
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
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';

    $config = readconfiguration();


    $formerror = false;
    // Check the flightid HTML GET variable
    $get_flightid = "";
    if (isset($_GET["flightid"])) {
        if (($get_flightid = strtoupper(check_string($_GET["flightid"], 20))) == "")
            $formerror = true;
    }
    else
        $formerror = true; 
 
    // If there isn't a flightid, then exit.
    if ($formerror == true) {
        printf ("[]");
        return 0;
    }

    // Check the callsign HTML GET variable
    $get_callsign = "";
    if (isset($_GET["callsign"])) 
        $get_callsign = strtoupper(check_string($_GET["callsign"], 20));

    // Check the num HTML GET variable
    $get_num = 5;
    if (isset($_GET["num"])) 
        if (check_number($_GET["num"], 0, 1000))
            $get_num = intval($_GET["num"]);


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    ## query the list of callsigns for those flights that are active
    $query = 'select f.flightid, fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.flightid = $1;';
    //$result = sql_query($query);
    $result = pg_query_params($link, $query, array(sql_escape_string($get_flightid)));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    if (sql_num_rows($result) <= 0) {
        printf ("[]");
        sql_close($link);
        return 0;
    }


    $callsigns = [];
   
    // If no callsign was given, then just grab all the callsigns for this flightid
    if ($get_callsign == "") {
        $get_callsign = " and a.callsign in (";
   
        $firsttime = 1;
        while ($row = sql_fetch_array($result)) {
            $callsigns[$row['callsign']] = $row['flightid'];
            if ($firsttime == 0)
                $get_callsign = $get_callsign . ", ";
            $firsttime = 0;
            $get_callsign = $get_callsign . "'" . $row['callsign'] . "'";
        }    
        $get_callsign = $get_callsign . ")";
    }
    else
        $get_callsign = " and a.callsign = '" . $get_callsign . "' ";

    //printf ("%s", json_encode($callsigns));
    //print_r($get_callsign);


    //return 0;


/* ============================ */


    ## query the last packets from stations...
    $query = '
select distinct on (time) 
date_trunc(\'second\', a.tm)::timestamp without time zone as time,
f.flightid,
a.callsign,
split_part(a.raw, \':>\', 2)  as packet

from 
packets a,
flights f,
flightmap fm

where 
fm.flightid = f.flightid
and f.active = \'t\'
and fm.callsign = a.callsign
and a.tm > (now() - (to_char(($1)::interval, \'HH24:MI:SS\'))::time) 
and a.raw != \'\' 
and a.ptype = \'>\' '
. $get_callsign .
' order by time desc limit ' . $get_num . ';';


    $result = pg_query_params($link, $query, array(sql_escape_string($config["lookbackperiod"] . " minute")));
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }
    if (sql_num_rows($result) > 0) 
        printf ("%s", json_encode(sql_fetch_all($result)));
    else
        printf ("[ ]");
    sql_close($link);

?>
