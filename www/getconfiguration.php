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


    header("Content-Type:  application/json;");
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    # The list of tables
    # format:  [ <table name> , <column sort order> ]
    $datalist = [ 
        ["flights", "flightid desc, active"], 
        ["flightmap", "flightid, callsign"], 
        ["trackers", "tactical, callsign"], 
        ["teams", "tactical"], 
        ["freqs", "freq"], 
        ["launchsites", "launchsite"] 
    ];


    $json = [];
    foreach ($datalist as $d) {
        $query = "
            select 
            array_to_json(array_agg(a)) as " . $d[0] . " 
       
            from 
            (select * from " . $d[0] . " order by " . $d[1] . " ) as a
            ;
            ";

        $result = sql_query($query);
        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return 0;
        }

        $rows = sql_fetch_all($result);
        $output = [];
        if (sql_num_rows($result) > 0) {   
            //print_r($rows[0]["flights"]);
            $output = json_decode($rows[0][$d[0]]);
            $json[$d[0]] = $output;   
        }
    }

    printf("%s", json_encode($json));

    sql_close($link);

?>
