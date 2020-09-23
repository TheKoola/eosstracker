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
<!-- Load css -->
<link href="/common/c3.min.css" rel="stylesheet">
<!--<link href="/leaflet/leaflet.css" rel="stylesheet"> -->

<!-- Load js -->
<script src="/common/jquery-3.4.1.min.js"></script>
<!-- <script src="/leaflet/leaflet.js"></script> -->
<script src="/common/d3.min.js" charset="utf-8"></script>
<script src="/common/c3.min.js"></script>
<link rel="stylesheet" href="/common/styles.css">

</head>
<body class="cover-page">
<div class="logo">
     <div class="nodeid"><?php if (is_readable("nodeid.txt")) echo file_get_contents("nodeid.txt"); ?></div>
     <p>
         <a href="/index.php" class="logo-link"><?php if(isset($logo)) printf("%s", $logo); else printf("No Logo"); ?></a><br>
         <span class="sub-logo">Tracking High Altitude Balloons</span>
     </p>
</div>
<div class="menubar">
    
    <ul class="menubar">
        <li class="menubar"><a href="/home.php" class="navbar">Home</a></li>
        <li class="menubar"><a href="/setup.php" class="navbar">Setup</a></li>
        <li class="menubar"><a id="maplink" href="/index.php" target="_blank" class="navbar">Map</a></li>
        </ul>
</div>

