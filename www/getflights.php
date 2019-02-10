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

    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';


    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }


    ## Get a list of flights and their callsign mapping
    $query = '
        select 
        f.flightid, 
        fm.callsign, 
        fm.location, 
        fm.freq, 
        f.active, 
        f.description,
        f.launchsite
   
        from 
        flights f left outer join flightmap fm 
            on fm.flightid = f.flightid
    
        order by 
        f.active desc,
        f.flightid desc, 
        f.thedate desc, 
        fm.callsign asc;';
    $result = sql_query($query);
    if (!$result) {
        db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    
    $length = 0; 
    $flights = [];
    $beacons = [];
    $jsonarray = [];
    $rows = sql_fetch_all($result);
    if (sql_num_rows($result) > 0) {
        foreach ($rows as $row) {
            $flights[$row["flightid"]] = array ("active" => $row["active"], "description" => $row["description"], "launchsite" => $row["launchsite"]);
            $data = [];
            $data["callsign"] = $row["callsign"];
            $data["frequency"] = number_format($row["freq"], 3);
            $data["location"] = $row["location"];
            if ($data["callsign"] != "")
                $beacons[$row["flightid"]][] = $data;
        }

        foreach ($flights as $flightid => $ray) {
            //printf("beacons: %s, %d<br>", $flightid, sizeof($beacons[$flightid]));
            if (array_key_exists($flightid, $beacons))
                $b = $beacons[$flightid];
            else
                $b = [];
            $jsonarray[] = array("flight" => $flightid, "active" => $ray["active"], "description" => $ray["description"], "launchsite" => $ray["launchsite"], "beacons" => $b);
        }
        printf ("%s", json_encode($jsonarray));
    }
    else
        printf("[]");

    sql_close($link);

?>
