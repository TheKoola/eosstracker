<?php
    ###  This will query the database for the n most recent packets.  

    session_start();
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include $documentroot . '/common/functions.php';
    include $documentroot . '/common/sessionvariables.php';


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
