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
<meta charset="utf-8">
<meta name="description" content="HAB Tracker">
<meta name="generator" content="None other than the tried and true vi editor!">
<meta name="keywords" content="HAB Tracker">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?php
    if (array_key_exists("CONTEXT_DOCUMENT_ROOT", $_SERVER))
        $documentroot = $_SERVER["CONTEXT_DOCUMENT_ROOT"];
    else
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
    include_once $documentroot . "/common/version.php";
    include_once $documentroot . '/common/logo.php';
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
<script src="/leaflet/leaflet.js"></script>
<script src="/common/d3.min.js"></script> 
<script src="/common/plot.min.js"></script> 
<link rel="stylesheet" href="/leaflet/leaflet.css">
<link rel="stylesheet" href="/common/styles.css">

<!-- Mapbox GL JS -->
<script src="/common/mapbox-gl.js"></script>
<link href="/common/mapbox-gl.css" rel="stylesheet">

<!-- Leaflet shim for mapbox -->
<script src="/common/leaflet-mapbox-gl.js"></script>

</head>
<body class="cover-page">
<div class="logo">
     <p>
         <a href="/historical.php" class="logo-link"><?php if(isset($logo)) printf("%s", $logo); else printf("No Logo"); ?></a><br>
         <span class="sub-logo">Tracking High Altitude Balloons</span>
     </p>
</div>
<div class="menubar">
    <ul class="menubar">
        <li class="menubar"><a href="/historical.php" class="navbar">Historical Data</a></li>
        <li class="menubar"><a id="maplink" href="/index.php" target="_blank" class="navbar">Map</a></li>
        </ul>
</div>

