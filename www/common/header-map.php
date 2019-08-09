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
?>
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html">
<meta http-equiv="Content-Language" content="utf-8">
<meta name="description" content="HAB Tracker">
<meta name="generator" content="None other than the tried and true vi editor!">
<meta name="keywords" content="HAB Tracker">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<?php
    $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include_once $documentroot . "/common/version.php";
?>
<link rel="shortcut icon" href="/images/graphics/favicon.ico">
<link rel="icon" type="image/png" href="/images/graphics/favicon-192x192.png" sizes="192x192">
<link rel="apple-touch-icon" sizes="180x180" href="/images/graphics/apple-touch-icon-180x180.png">
<?php
if (!isset($pagetitle)) 
    printf ("<title>HAB Tracker</title>\n");
else
    printf ("<title>%s</title>\n", $pagetitle);
?>
<!-- Load css -->
<link href="/common/c3.min.css" rel="stylesheet">
<link href="/leaflet/leaflet.css" rel="stylesheet">
<link href="/common/leaflet.groupedlayercontrol.min.css" rel="stylesheet">
<link href="/common/leaflet-sidebar.css" rel="stylesheet">
<link href="/common/flightindicators.css" rel="stylesheet">
<link href="/common/Control.SimpleMarkers.css" rel="stylesheet">
<link href="/common/MarkerCluster.css" rel="stylesheet">
<link href="/common/MarkerCluster.Default.css" rel="stylesheet">
<link href="/common/mapstyles.css" rel="stylesheet">

<!-- Load js -->
<script src="/common/d3.min.js" charset="utf-8"></script>
<script src="/common/c3.min.js"></script>
<script src="/leaflet/leaflet.js"></script>
<script src="/common/jquery-3.4.1.min.js"></script>
<script src="/common/leaflet-geolayer.js"></script>
<script src="/common/symbols-map.js"></script>
<script src="/common/leaflet.groupedlayercontrol.min.js"></script>
<script src="/common/leaflet-sidebar.js"></script>
<script src="/common/jquery.flightindicators.js"></script>
<script src="/common/leaflet.markercluster.js"></script>
<script src="/common/Control.SimpleMarkers.js"></script>

</head>
<body>

