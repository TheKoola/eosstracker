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
    include_once $documentroot . '/common/logo.php';
?>
<link rel="stylesheet" href="/common/styles.css">
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
<link href="/common/c3.css" rel="stylesheet">
<!--<link href="/leaflet/leaflet.css" rel="stylesheet"> -->

<!-- Load js -->
<script src="/common/jquery-3.3.1.js"></script>
<!-- <script src="/leaflet/leaflet.js"></script> -->
<script src="/common/d3.min.js" charset="utf-8"></script>
<script src="/common/c3.js"></script>
<script src="/common/aprssymbols.js"></script>
<script src="/common/setup.js"></script>
<script src="/common/trackers.js"></script>

</head>

<body class="cover-page">

<div class="topshadow">
<div class="container">
<div class="leftshadow">
<div class="rightshadow">
<div class="innercontainer">

<div class="header">

<div class="logo">
     <!-- Enter one's logo text on the following line -->
     <p style="margin-top:  30px; margin-left:  30px;"><a href="/index.php" class="logo-link"><?php if(isset($logo)) printf("%s", $logo); else printf("No Logo"); ?></a><br>

     <!-- This is the sub-title text -->
     <span style="font-size: 1.2em; color:  #0052cc; font-style:  italic; text-shadow: 5px 5px 10px black;">Tracking High Altitude Balloons</span>
     </p>
</div>


<?php 

    // This includes the menubar
    include_once $documentroot . '/common/menubar.php';
?>
</div>

