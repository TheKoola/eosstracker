<?php
/*
*
##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2019,2020,2023 Jeff Deaton (N6BA)
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
    session_start();
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    $config = readconfiguration();


    ## function to calculate the speed betwen two points.
    function calc_speed($lat1, $lon1, $lat2, $lon2, $start, $end) {
        $p = pi()/180;
        $a = 0.5 - cos(($lat2 - $lat1) * $p)/2 + cos($lat1 * $p) * cos($lat2 * $p) * (1 - cos(($lon2 - $lon1) * $p))/2;
        $dist = (12742 * asin(sqrt($a)))*.6213712;

        $time1 = date_create($start);
        $time2 = date_create($end);
        $diff = date_diff($time2, $time1);
        $time_delta = $diff->h + (($diff->i * 60) + $diff->s)/3600; 
        
        // in MPH.. 
        if ($time_delta > 0)
            $speed = abs($dist / $time_delta);
        else
            $speed = 312;
    
        return $speed;
    }


    ## Function to get the geoJson for all 'at large' tracker stations (i.e. these trackers are not assigned to a flight)
    function getTrackerFeatures($lookback) {

        ## Connect to the database
        $link = connect_to_database();
        if (!$link) {
            db_error(sql_last_error());
            return 0;
        }

        ## query the last packets from any tracker stations that are considered 'At Large'...
        $query = "
            select row_to_json(fc)

            from (
            select
                'FeatureCollection' as type,
                array_to_json(array_agg(f)) as features

                from (
                    select
                        'Feature' as type,
                        st_asgeojson(z.location2d)::jsonb as geometry,
                        (
                            select row_to_json(t)
                            from (
                                select
                                    id,
                                    callsign,
                                    time,
                                    symbol,
                                    altitude,
                                    comment,
                                    tooltip,
                                    label,
                                    iconsize,
                                    bearing,
                                    speed,
                                    heardfrom,
                                    frequency
                                ) t
                            ) as properties

                        from 
                        (
                            select
                                y.callsign as id,
                                y.callsign,
                                to_char(y.thetime, 'YYYY-MM-DD HH24:MI:SS.MS') as time,
                                y.symbol,
                                round(y.altitude) as altitude,
                                upper(y.tactical) || '<br>' || y.comment as comment,
                                upper(y.tactical) as tooltip,
                                upper(y.tactical) as label,
                                24 as iconsize,
                                round(y.bearing) as bearing,
                                round(y.speed_mph) as speed,
                                case when array_length(y.path, 1) > 0 then
                                    y.path[array_length(y.path, 1)]
                                else
                                    y.sourcename
                                end as heardfrom,
                                y.freq as frequency ,
                                y.location2d

                            from 
                                (select 
                                    date_trunc('milliseconds', a.tm)::timestamp without time zone as thetime,
                                    a.callsign,
                                    t.flightid,
                                    a.altitude,
                                    a.comment,
                                    a.symbol,
                                    a.speed_mph,
                                    a.bearing,
                                    a.location2d,
                                    cast(ST_Y(a.location2d) as numeric) as lat,
                                    cast(ST_X(a.location2d) as numeric) as lon,

                                    -- This is the source name.  Basically the name of the RF station that we heard this packet from
                                    case when a.raw similar to '[0-9A-Za-z]*[\-]*[0-9]*>%' then
                                        split_part(a.raw, '>', 1)
                                    else
                                        NULL
                                    end as sourcename,

                                    -- The frequency this packet was heard on
                                    round(a.frequency / 1000000.0,3) as freq,
                                    

                                    -- The Dire Wolf channel
                                    a.channel,

                                    -- The ranking of whether this was heard directly or via a digipeater
                                    dense_rank () over (partition by a.callsign order by 
                                        date_trunc('millisecond', a.tm) desc,
                                        a.channel asc,
                                        cast(
                                            cardinality(
                                                (
                                                    array_remove(
                                                    string_to_array(
                                                        regexp_replace(
                                                            split_part(
                                                                split_part(a.raw, ':', 1), 
                                                                '>', 
                                                                2), 
                                                            ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)', 
                                                            '', 
                                                            'g'), 
                                                        ',',''),
                                                    NULL)
                                                )[2:]
                                        ) as int) asc
                                    ),
                                    a.ptype,
                                    a.hash,
                                    a.raw,
                                    a.source,
                                    t.tactical,
                                    case when a.raw similar to '%>%:%' then
                                        (array_remove(string_to_array(regexp_replace(
                                                        split_part(
                                                            split_part(a.raw, ':', 1),
                                                            '>',
                                                            2),
                                                        ',(WIDE[0-9]*[\-]*[0-9]*)|(qA[A-Z])|(TCPIP\*)',
                                                        '',
                                                        'g'),
                                                    ',',''), NULL))[2:]
                                    else
                                        NULL
                                    end as path


                                    from packets a
                                    left outer join (select fm.callsign from flights f, flightmap fm where fm.flightid = f.flightid and f.active = 't') as b on a.callsign = b.callsign,
                                    teams t,
                                    trackers tr

                                    where
                                    b.callsign is null
                                    and a.location2d != ''
                                    and a.tm > (now() - (to_char(($1)::interval, 'HH24:MI:SS'))::time)
                                    and case
                                        when tr.callsign similar to '[A-Z]{1,2}[0-9][A-Z]{1,3}-[0-9]{1,2}' then
                                            a.callsign  = tr.callsign
                                        else
                                            a.callsign like tr.callsign || '-%'
                                    end
                                    and t.tactical != 'ZZ-Not Active'
                                    and tr.tactical = t.tactical 
                                    and t.flightid is null 

                                    order by
                                    dense_rank,
                                    a.callsign,
                                    thetime) as y

                                where
                                y.dense_rank = 1

                                order by
                                y.thetime,
                                y.callsign
                            ) as z

                        ) as f
                    ) as fc
        ;
        ";

        if (!$lookback) {
            $lookback = 180;
        }

        $result = pg_query_params($link, $query, array(
            sql_escape_string($lookback . " minute")
        ));

        if (!$result) {
            db_error(sql_last_error());
            sql_close($link);
            return [];
        }
     
        // object where we'll store our results
        $featurecollection = [];

        $numrows = sql_num_rows($result);
        if ($numrows > 0) {
            $js = json_decode(pg_fetch_array($result)[0]);

            // Add a 'name' property to the feature collection
            $js->properties = array(
                "name" => "Tracker Stations"
            );

            // Check of the list of features is null
            if (!$js->features) {
                $js->features = array();
            }

            // assemble the feature collection 
            $featurecollection = array(
                "trackerstations" => $js
            );

        }
        else {

            // no rows were returned so we build a blank feature collection
            $featurecollection = array(
                "trackerstations" => array(
                    "properties" => array(
                        "name" => "Tracker Stations"
                    ),
                    "type" => "FeatureCollection",
                    "features" => array()
                )
            );
        }

        // close the database connection
        sql_close($link);

        return $featurecollection;
    }


    ####################################################
    # main code
    ####################################################

    // where we hold our results
    $js = [];

    try {

        // create a new memcache object and connect to the backend daemon
        $memcache = new Memcache;
        $connectionresult = $memcache->connect('localhost', 11211);
        if (!$connectionresult)
            throw new Exception("memcache fail");

        // attempt to get the process_status key from memcache
        $getresult = $memcache->get('getotherdata');

        // If the key was found in memcache, then we'll just use that.
        if ($getresult) {
            $js = json_decode($getresult);
        }
        else {
            // cache miss.  Now get the status of the backend processes
            $js = getTrackerFeatures($config["lookbackperiod"]);

            // now add this to memcache with a TTL of 300 seconds
            $memcache->set('getotherdata', json_encode($js), false, 290);
        }
    } catch (Exception $e) {
        // Connect to the backend and run the python script to determine process status
        $js = getTrackerFeatures($config["lookbackperiod"]);
    }

    // print out results
    printf("%s", json_encode($js));
?>

