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
<link href="/common/c3.min.css" rel="stylesheet">
<!--<link href="/leaflet/leaflet.css" rel="stylesheet"> -->

<!-- Load js -->
<script src="/common/jquery-3.4.1.min.js"></script>
<!-- <script src="/leaflet/leaflet.js"></script> -->
<script src="/common/d3.min.js" charset="utf-8"></script>
<script src="/common/c3.min.js"></script>

</head>
<?php
    # This section determines if the ADS-B program dump1090-fa is installed.  If "yes" then (later on below) create a menu option for it.
    # Specify that we don't care about self-signed SSL certs
    $context = stream_context_create( [
        'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
        ],
    ]);

    # If the dump1090-fa package has been installed, then this should be its URL
    $dump1090fa_url = "https://" . $_SERVER["HTTP_HOST"] . "/dump1090-fa";

    # Get HTML headers by trying to load the URL 
    $file_headers = get_headers($dump1090fa_url, 0, $context);

    # Check if the dump1090-fa package has been installed
    if(!$file_headers || $file_headers[0] == 'HTTP/1.1 404 Not Found') 
        $exists = false;
    else 
        $exists = true;
?>

<body class="cover-page">
<div class="logo">
     <p>
         <a href="/index.php" class="logo-link"><?php if(isset($logo)) printf("%s", $logo); else printf("No Logo"); ?></a><br>
         <span class="sub-logo">Tracking High Altitude Balloons</span>
     </p>
</div>
<div class="menubar">
    
    <ul class="menubar">
        <li class="menubar"><a href="/index.php" class="navbar">Home</a></li>
        <li class="menubar"><a href="/setup.php" class="navbar">Setup</a></li>
        <li class="menubar"><a href="/rawdata.php" class="navbar">Data</a></li>
        <li class="menubar"><a href="/dashboard.php" target="_blank" class="navbar">Dashboard</a></li>
        <?php if ($exists) { ?> <li class="menubar"><a href="/dump1090-fa" target="_blank" class="navbar">ADS-B</a></li> <?php } ?>
        <li class="menubar"><a id="maplink" href="/map.php" target="_blank" class="navbar">Map</a></li>
        <li class="menubar"><a href="/about.php" class="navbar">About</a></li>
        </ul>
</div>

