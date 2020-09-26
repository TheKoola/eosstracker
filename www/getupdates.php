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


    $formerror = false;
    
    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }

    // Check if this should be a full update or not
    $get_fullupdate = " where p.flightid is not null or d.flightid is not null ";
    if (isset($_GET["fullupdate"])) {
        if ($_GET["fullupdate"] == "full")
            $get_fullupdate = " ";
    }


    ## Query the database for those active flights that have new packets within the past few seconds.
    $query = "select
        f.flightid,
        f.callsign,
        case when p.count is not null or d.count is not null then 1 else 1 end as update

        from
        (select distinct
        f.flightid,
        fm.callsign

        from
        flightmap fm,
        flights f

        where
        fm.flightid = f.flightid
        and f.active = 'y'

        order by
        f.flightid,
        fm.callsign
        ) as f  

        left join
        (select distinct
        l.flightid, 
        l.callsign,
        1 as count

        from 
        landingpredictions l

        where 
        l.tm > (now() - interval '11 second')

        order by 
        l.flightid, 
        l.callsign
        ) as d
        on f.flightid = d.flightid and f.callsign = d.callsign

        left join
        (select distinct 
        fl.flightid,
        a.callsign,
        1 as count

        from 
        packets a,
        flightmap fm, 
        flights fl

        where 
        a.location2d != '' 
        and a.tm > (now() - interval '11 second')
        and fm.flightid = fl.flightid 
        and a.callsign = fm.callsign 
        and fl.active = 'y'

        group by
        fl.flightid,
        a.callsign

        order by 
        3 desc, 1, 2
        ) as p
        on f.flightid = p.flightid and f.callsign = p.callsign

         " . $get_fullupdate . " 

        ;";

    $result = sql_query($query);
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
    else {
        $rows = sql_fetch_all($result);
        printf ("%s", json_encode($rows));
    }

    sql_close($link);
?>
