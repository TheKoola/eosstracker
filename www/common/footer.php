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
<!-- beginning of footer -->
<div class="footer">
    <?php
        $documentroot = $_SERVER["DOCUMENT_ROOT"];
        include_once $documentroot . '/common/functions.php';
        include_once $documentroot . '/common/version.php';
    ?>
    <p class="copyright" style="margin-top:  10px; margin-bottom:  0px;">
    This site best viewed with recent versions of Firefox, Safari, Internet Explorer, Chrome, Opera, etc.
    </p>
    <p class="copyright" style="margin-bottom:  10px;">
    System Version: <?php if (isset($version)) printf("%s", $version); ?> 
    </p>
</div>
<!-- end of footer -->


