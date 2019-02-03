<div class="menubar">
            <center>
            <table cellspacing=0 cellpadding=0 border=0  width=100%>
            <tr valign="middle" align="left">
            <td align="left" valign="bottom" width="18%">
            <p class="normal-black" style="font-family: monospace; margin: 0px; padding: 0px; color: white; font-size: .9em; margin-left:  5px;">
            <?php echo $_SERVER["HTTP_HOST"]; echo "<br>" . $_SERVER["SERVER_ADDR"]; ?>
            </p>
            </td>
            <td align="center" valign="middle" width="64%">
                <table class="navbar-table" cellspacing=0 cellpadding=0 border=0>
                <tr valign="middle" align="center">
                    <td align="center"><a href="/index.php" class="navbar">Home</a></td>
                    <td align="center"><a href="/setup.php" class="navbar">Setup</a></td>
                    <td align="center"><a href="/monitor.php" class="navbar">Performance</a></td>
                    <td align="center"><a href="/rawdata.php" class="navbar">Live Packets</a></td>
                    <td align="center"><a href="/map.php" target="_blank" class="navbar">Map</a></td>
                </tr>
                </table>
            </td>
            <td align="right" valign="bottom" width="18%">
            <p class="normal-black" style="font-family: monospace; margin: 0px; padding: 0px; color: white; font-size: .9em; margin-right:  5px; text-align: right;">
            <?php if (is_readable("nodeid.txt")) echo file_get_contents("nodeid.txt"); ?>
            </p>
            </td>
            </tr>
            </table>
            </center>
</div>
