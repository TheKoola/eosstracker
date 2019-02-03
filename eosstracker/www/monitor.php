<?php
$pagetitle="APRS: Monitor";
session_start();
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/sessionvariables.php';
include $documentroot . '/common/header.php';

?>
<script>
    // This grabs the session variables
    var mycallsign = "<?php echo $mycallsign; ?>"; 
    var lookbackperiod = "<?php echo $lookbackperiod; ?>"; 
    var chart;

    function coord_distance(lat1, lon1, lat2, lon2) {
        var p = 0.017453292519943295;    // Math.PI / 180
        var c = Math.cos;
        var a = 0.5 - c((lat2 - lat1) * p)/2 + 
                c(lat1 * p) * c(lat2 * p) * 
                (1 - c((lon2 - lon1) * p))/2;

        return Math.round((12742 * Math.asin(Math.sqrt(a)))*.6213712 * 100)/100; // 2 * R; R = 6371 km
    }


    function createchart (jsondata, columns) {
        chart = c3.generate({
            bindto: '#chart1',
            size: { width: 800, height: 350 },
            data: { type: 'area', json: jsondata, xs: columns, xFormat: '%H:%M:%S'  },
            axis: { x: { label: { text: 'Time', position: 'outer-center' }, type: 'timeseries', tick: { format: '%H:%M:%S' }  }, y: { label: { text: 'Packets / Min', position: 'outer-middle' } } },
            grid: { x: { show: true }, y: { show: true } }
            //grid: { x: { show: true }, y: { show: true } }
        });
    }
    

    function updatechart (jsondata, columns) {
         chart.load ({ json:  jsondata });
    }
    

    function getchartdata(chartupdatefunction) {
        $.get("getpacketperformance.php", function(data) {
            var jsonOutput = JSON.parse(data);
            var mycolumns = {};
            var i = 0;
            var thekeys = Object.keys(jsonOutput);
            for (i = 0; i < thekeys.length; i++) {
                if (! thekeys[i].startsWith("tm-")) {
                    mycolumns[thekeys[i]] = "tm-" + thekeys[i];
                }
            }
            //document.getElementById("debug1").innerHTML = JSON.stringify(mycolumns, null, 4);
            //document.getElementById("debug2").innerHTML = flightlist;
            chartupdatefunction(jsonOutput, mycolumns);
        });
    }

    $(document).ready(function () {
        getchartdata(createchart);
        setInterval(function() { getchartdata(updatechart); }, 10000);
    });

    
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Packet Performance 
<?php 
    printf ("<span style=\"font-size: .6em;\">(< %dhrs %dmins)</span>", $lookbackperiod / 60, (  ($lookbackperiod / 60.0) - floor($lookbackperiod / 60) ) * 60) ; 
?>
            </p>
            <p class="normal-black"><div id="chart1"></div></p>
            <p class="normal-black"><div id="debug1"></div></p>
            <p class="normal-black"><div id="debug2"></div></p>
            <p class="normal-black"><div id="debug3"></div></p>
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
