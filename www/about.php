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


session_start();
$pagetitle="APRS:  About";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/header.php';

?>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                About
            </p>
            <p class="normal-black" style="float:left;">
	    The HAB Tracker application aids tracking and recovery of high altitude balloons by  
	    leveraging open source software and the amateur radio <a class="normal-link-black" target="_blank" href="http://www.aprs.org">Automatic Packet Reporting System</a> to provide near real time status and location updates.
            </p>
            <p class="normal-black">
	        <?php include_once $documentroot . '/localinfo.php'; ?>
            </p>
            <p class="normal-black">
            The HAB Tracker application is licensed under version 3 of the GNU General Public License (see <a class="normal-link-black" target="_blank" href="https://www.gnu.org/licenses/">https://www.gnu.org/licenses/</a>).
            </p>
            <p class="normal-black" style="text-align: center; margin-top: 40px; margin-bottom: 0px; clear: both;">
            Copyright (C) 2019, Jeff Deaton (N6BA), Jeff Shykula (N2XGL)
            </p>
</div>

<?php
    include $documentroot . '/common/footer.php';
?>
</div>

</div>
</div>
</div>
</div>
</div>
</body>
</html>
