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
$pagetitle="EOSS Historical Flight Data";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include_once $documentroot . '/common/header-historical.php';

?>
<script src="/common/historical.js"></script>
<div style="margin-bottom: 30px;">
    <p class="header">
        <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
        Historical Flight Data
    </p>
    <p class="normal" style="border: 0;">
        The following is a list of all EOSS flight data from recent years.  Data is available in several formats:
    </p>
    <p class="normal" style="border: 0;">
        <ul>
            <li class="normal" style="border: 0;">Comma separated values (*.csv)</li>
            <li class="normal" style="border: 0;">JavaScript Object Notation (*.json)</li>
            <li class="normal" style="border: 0;">Microsoft Excel (*.xlsx)</li>
            <li class="normal" style="border: 0;">Pandas - Python Pandas pickle format (*.pkl)</li>
        </ul>
    <p class="normal" style="border: 0;">
        Schema info to be added soon.
    </p>
    </p>
</div>
<div id="flightlist" style="margin-left: 30px;"></div>

<?php
    include $documentroot . '/common/footer.php';
?>
</body>
</html>
