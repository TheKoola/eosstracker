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

    $config = readconfiguration();
  
    ## Connect to the database
    $link = connect_to_database();
    if (!$link) {
        db_error(sql_last_error());
        return 0;
    }
    
    ## query packets from trackers
    $query = "
        select 
           jsonb_build_object(
               'type', 'FeatureCollection',
               'features', json_agg(st_asgeojson(j.*, 'location2d')::jsonb)
           ) as features
        from 
        (
            select 
            p.*

            from (
                select 
                    a.*,
                    dense_rank() over (partition by a.callsign order by a.tm desc)

                from 
                    packets a
                    left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign,
                    teams t,
                    trackers tr

                where
                    b.callsign is null
                    and a.location2d != ''
                    and a.raw != ''
                    and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time) 
                    and case
                        when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                            a.callsign  = tr.callsign
                        else
                            a.callsign like tr.callsign || '-%'
                    end
                    and t.tactical != 'ZZ-Not Active'
                    and tr.tactical = t.tactical 

                order by 
                    a.tm asc
                ) as p

            where
                p.dense_rank = 1

            order by
                p.tm asc,
                p.callsign
            )  as j
            ;
    ";

    $result = pg_query_params($link, $query, array(
        sql_escape_string($config["lookbackperiod"] . " minute"))
    );
    if (!$result) {
        printf("[]");
        //db_error(sql_last_error());
        sql_close($link);
        return 0;
    }

    $rows = pg_fetch_all($result);
    printf("%s", $rows[0]['features']);
    sql_close($link);
?>
