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

    $update_plottracks = 0;

    $mycallsign = "NOCALL";
    $lookbackperiod = 180;
    $iconsize = 24;
    $plottracks = 'off';

    ## mycallsign
    if (isset($_SESSION["mycallsign"])) {
        $mycallsign = $_SESSION["mycallsign"];
    }
    else {
        $mycallsign = "NOCALL";
    }

    ## look back period in minutes
    if (isset($_SESSION["lookbackperiod"])) {
        $lookbackperiod = $_SESSION["lookbackperiod"];
    }
    else {
        $lookbackperiod = "180";
    }

    ## default icon size
    if (isset($_SESSION["iconsize"])) {
        $iconsize = $_SESSION["iconsize"];
    }
    else {
        $iconsize = "24";
    }

    ## plot tracks for APRS stations
    if (isset($_SESSION["plottracks"])) {
        $plottracks = $_SESSION["plottracks"];
    }
    else {
        $plottracks = "off";
    }



    ##############
    ## these are for if this is called to via a GET request from an HTML form
    ##############

    if (isset($_GET["mycallsign"])) {
        $get_mycallsign = strtoupper($_GET["mycallsign"]);
        $mycallsign = $get_mycallsign;
        $_SESSION["mycallsign"] = $get_mycallsign;
        $update_plottracks = 1;
    }
    else {
        $get_mycallsign = "";
    }

    if (isset($_GET["lookbackperiod"])) {
        $get_lookbackperiod = $_GET["lookbackperiod"];
        if ($get_lookbackperiod < 1)
            $get_lookbackperiod = 1;
        $lookbackperiod = $get_lookbackperiod;
        $_SESSION["lookbackperiod"] = $get_lookbackperiod;
        $update_plottracks = 1;
    }
    else {
        $get_lookbackperiod = "";
    }
    if (isset($_GET["iconsize"])) {
        $get_iconsize = $_GET["iconsize"];
        if ($get_iconsize > 99)
            $get_iconsize = 99;
        if ($get_iconsize < 5)
            $get_iconsize = 5;
        $iconsize = $get_iconsize;
        $_SESSION["iconsize"] = $get_iconsize;
        $update_plottracks = 1;
    }
    else {
        $get_iconsize = "";
    }


    if (isset($_GET["plottracks"])) {
        $get_plottracks = $_GET["plottracks"];
    }
    else if ($update_plottracks == 1) {
        $get_plottracks = 'off';
    }
    else {
        $get_plottracks = $plottracks;
    }
  
    $_SESSION["plottracks"] = $get_plottracks;
    $plottracks = $get_plottracks;


    if ($get_mycallsign == "")
        $_SESSION["mycallsign"] = $mycallsign;
    if ($get_lookbackperiod == "")
        $_SESSION["lookbackperiod"] = $lookbackperiod;
    if ($get_iconsize == "")
        $_SESSION["iconsize"] = $iconsize;

?>
