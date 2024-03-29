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
include_once $documentroot . '/common/functions.php';


    $link = connect_to_database();
    if (!$link) {
        printf("{\"result\": \"1\", \"error\": %s}", json_encode(sql_last_error()));
        return 0;
    }

    $formerror = false;

    // Check the datatype HTML GET variable
    if (isset($_GET["datatype"])) {
        if (($datatype = strtoupper(check_string($_GET["datatype"], 64))) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    // Check the beginning HTML GET variable
    $beginning = "";
    if (isset($_GET["beginning"])) {
        if (($beginning = check_datetime($_GET["beginning"])) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    // Check the ending HTML GET variable
    $ending = "";
    if (isset($_GET["ending"])) {
        if (($ending = check_datetime($_GET["ending"])) == "")
            $formerror = true;
    }
    else
        $formerror = true;

    if ($datatype == "" || $beginning == "" || $ending == "")
        $formerror = true;

    if ($formerror == false) {

	if ($datatype == "GPS") {
            $query = "select distinct 
		g.tm::date as thedate,
		date_trunc('second', g.tm)::time without time zone as thetime,
                g.speed_mph,
                g.bearing,
                g.altitude_ft,
		ST_Y(g.location2d) as latitude,
                ST_X(g.location2d) as longitude

                from
                gpsposition g
 
                where
                g.tm >= $1
		and g.tm <= $2
     
                order by
                thedate asc,
                thetime asc;";

            $result = pg_query_params($link, $query, array(sql_escape_string($beginning), sql_escape_string($ending)));
            if (!$result) {
                printf("{\"result\": \"1\", \"error\": %s}", json_encode(sql_last_error()));
                sql_close($link);
                return 0;
            }
            $numrows = sql_num_rows($result);
            if ($numrows > 0) {
	        header("Content-Type: text/csv");
         	header('Content-Disposition: attachement; filename="gps_log.csv"');
		$f = fopen("php://output", "w");
		fputcsv($f, array("datetime", "speed_mph", "bearing", "altitude_ft", "lat", "lon"));
	        while ($row = sql_fetch_array($result)) {
			fputcsv($f, array((string)($row["thedate"] . " " . $row["thetime"]), 
				round($row["speed_mph"], 2), 
				round($row["bearing"], 0), 
				round($row["altitude_ft"], 0), 
				round($row["latitude"], 6), 
				round($row["longitude"], 6)
			));
		}
		fclose($f);
            }
            else {
                printf("{\"result\": \"1\", \"error\": \"No rows returned\"}");
	    }
	}
	else {
	    $okay = preg_match('/^FLIGHT_/', $datatype);
	    if ($okay) {
                $ray = preg_split('/^FLIGHT_/', $datatype);
		$flightid = $ray[1];
		$query = "select
                          p.tm::date as thedate,
                          date_trunc('second', p.tm)::time without time zone as thetime,
                          f.flightid,
                          p.callsign,
                          p.symbol,
                          p.speed_mph,
                          p.bearing,
                          p.altitude,
                          p.comment,
                          ST_Y(p.location2d) as lat,
                          ST_X(p.location2d) as lon,
                          case
                              when p.raw similar to '% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%' then
                                  round(32 + 1.8 * cast(substring(substring(substring(p.raw from ' [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P') from ' [-]{0,1}[0-9]{1,6}T') from ' [-]{0,1}[0-9]{1,6}') as decimal) / 10.0, 2)
                              else
                                  NULL
                          end as temperature_f,
                          case
                              when p.raw similar to '% [-]{0,1}[0-9]{1,6}T[-]{0,1}[0-9]{1,6}P%' then
                                  cast(substring(substring(p.raw from '[0-9]{1,6}P') from '[0-9]{1,6}') as decimal) * 10.0 / 101325.0
                              else
                                  NULL
                          end as pressure_atm,
                          p.hash as md5_hash,
                          p.raw

                          from
                          packets p,
                          flightmap fm,
                          flights f

                          where
                          p.callsign = fm.callsign
                          and fm.flightid = f.flightid
			  and f.flightid = $1
                          and p.tm >= $2
                          and p.tm <= $3

                          order by
                          thedate asc,
                          thetime asc
                          ;";
                    $result = pg_query_params($link, $query, array(sql_escape_string($flightid), sql_escape_string($beginning), sql_escape_string($ending)));
                    if (!$result) {
                        printf("{\"result\": \"1\", \"error\": %s}", json_encode(sql_last_error()));
                        sql_close($link);
                        return 0;
                    }
                    $numrows = sql_num_rows($result);
                    if ($numrows > 0) {
        	        header("Content-Type: text/csv");
			header('Content-Disposition: attachement; filename="' . $flightid . '.csv"');
			$f = fopen("php://output", "w");
        		fputcsv($f, array("datetime", "flightid", "callsign", "aprs_symbol", "speed_mph", "bearing", "altitude_ft", "lat", "lon", "comment", "temperature_f", "pressure_atm", "md5_hash", "raw_packet"));
        	        while ($row = sql_fetch_array($result)) {
				fputcsv($f, array((string)($row["thedate"] . " " . $row["thetime"]), 
					(string)$row['flightid'],
					(string)$row['callsign'],
					(string)$row['symbol'],
					round($row["speed_mph"], 2), 
					round($row["bearing"], 0), 
					round($row["altitude"], 0), 
					round($row["lat"], 6), 
					round($row["lon"], 6),
					(string)$row["comment"],
					round($row["temperature_f"], 2),
					round($row["pressure_atm"], 8),
					(string)$row["md5_hash"],
					(string)$row["raw"]
				));
        		}
			fclose($f);
                    }
                    else {
                        printf("{\"result\": \"1\", \"error\": \"No rows returned\"}");
        	    }
	    }
	    else
                printf("{\"result\": 1, \"error\": \"%s\"}", json_encode("Not a valid data type: " . $datatype));

	}


    }
    else
        printf("{\"result\": 1, \"error\": \"HTML Form error.\"}");

    sql_close($link);

?>
