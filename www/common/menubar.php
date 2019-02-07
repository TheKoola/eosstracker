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
<div class="menubar">
            <center>
            <table cellspacing=0 cellpadding=0 border=0  width=100%>
            <tr valign="middle" align="left">
            <td align="left" valign="bottom" width="10%">
            <p class="normal-black" style="font-family: monospace; margin: 0px; padding: 0px; color: white; font-size: .9em; margin-left:  5px;">
            <?php echo $_SERVER["HTTP_HOST"]; echo "<br>" . $_SERVER["SERVER_ADDR"]; ?>
            </p>
            </td>
            <td align="center" valign="middle" width="80%">
                <table class="navbar-table" cellspacing=0 cellpadding=0 border=0>
                <tr valign="middle" align="center">
                    <td align="center"><a href="/index.php" class="navbar">Home</a></td>
                    <td align="center"><a href="/setup.php" class="navbar">Setup</a></td>
                    <td align="center"><a href="/monitor.php" class="navbar">Performance</a></td>
                    <td align="center"><a href="/rawdata.php" class="navbar">Data</a></td>
                    <td align="center"><a href="/map.php" target="_blank" class="navbar">Map</a></td>
                    <td align="center"><a href="/about.php" class="navbar">About</a></td>
                </tr>
                </table>
            </td>
            <td align="right" valign="bottom" width="10%">
            <p class="normal-black" style="font-family: monospace; margin: 0px; padding: 0px; color: white; font-size: .9em; margin-right:  5px; text-align: right;">
            <?php if (is_readable("nodeid.txt")) echo file_get_contents("nodeid.txt"); ?>
            </p>
            </td>
            </tr>
            </table>
            </center>
</div>
