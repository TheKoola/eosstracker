<!DOCTYPE html>
<html>
<body>
  <script src="/common/gauge.min.js"></script>
  <script>
    function init() {
         gauge_0 = new RadialGauge({
            renderTo: 'rtl0',
            width: 300,
            height: 300,
            units: "Power rtl=0 (dbm)",
            minValue: -10,
            maxValue: 30,
            value: 0,
            startAngle: 90,
            ticksAngle: 180,
            majorTicks: [
                "-10",
                "-5",
                "0",
                "5",
                "10",
                "15",
                "20",
                "25"
            ],
            highlights:  false,
            valueBox: false,
            minorTicks: 2,
            strokeTicks: true,
            colorPlate: "#fff",
            borderShadowWidth: 0,
            borders: false,
            needleType: "arrow",
            needleWidth: 2,
            needleCircleSize: 7,
            needleCircleOuter: true,
            needleCircleInner: false,
            //animationDuration: 1500,
            units: "dbm",
            animationRule: "linear"
        }).draw();

         gauge_1 = new RadialGauge({
            renderTo: 'rtl1',
            width: 300,
            height: 300,
            units: "Power rtl=1 (dbm)",
            minValue: -10,
            maxValue: 30,
            value: 0,
            startAngle: 90,
            ticksAngle: 180,
            majorTicks: [
                "-10",
                "-5",
                "0",
                "5",
                "10",
                "15",
                "20",
                "25"
            ],
            highlights:  false,
            valueBox: false,
            minorTicks: 2,
            strokeTicks: true,
            colorPlate: "#fff",
            borderShadowWidth: 0,
            borders: false,
            needleType: "arrow",
            needleWidth: 2,
            needleCircleSize: 7,
            needleCircleOuter: true,
            needleCircleInner: false,
            //animationDuration: 1500,
            units: "dbm",
            animationRule: "linear"
        }).draw();

        document.getElementById("status").innerHTML += "starting up the shield...<br>";

        //var source = new EventSource("sse.php");
        var source = new EventSource("/stream/");
        document.getElementById("status").innerHTML += "EventSource created.<br>";

        source.addEventListener('message', function(event) {
            //var data = JSON.parse(event.data);
            document.getElementById("container").innerHTML += event.data + "<br>";
        });
        document.getElementById("status").innerHTML += "message handler created.<br>";

        /********/
        // Listen for device data
        /********/
        source.addEventListener('device', function(event) {
            var data = JSON.parse(event.data);
            //var data = event.data
            //var payload = JSON.parse(data.payload);
            //document.getElementById("container").innerHTML += "device: " + data.device + ", power_dbm: " + data.power_dbm;
            var power = (Math.round(data.power_dbm * 1000) / 1000).toFixed(3);
            if (data.device == "rtl=0") {
                gauge_0.value = power;
                document.getElementById("rtl0_value").innerHTML = power + " dbm";
            }
            if (data.device == "rtl=1") {
                gauge_1.value = power;
                document.getElementById("rtl1_value").innerHTML = power + " dbm";
            }

        });
        document.getElementById("status").innerHTML += "device handler created.<br>";


        /********/
        // Listen for 'gpsupdate' message
        /********/
        source.addEventListener('gpsupdate', function(event) {
            var data = JSON.parse(event.data);
            //var data = event.data
            //var payload = JSON.parse(data.payload);
            document.getElementById("container").innerHTML += "GPSUPDATE: coords: " + data.latitude + ", " + data.longitude + "  alt: " + data.altitude_ft + "  speed: " + data.speed_mph + "<br>";
            //document.getElementById("container").innerHTML += "GPSUPDATE:" + JSON.stringify(data) + "<br>";
        });
        document.getElementById("status").innerHTML += "gpsupdate handler created.<br>";

        /********/
        // error event
        /********/
        source.addEventListener('error', function(event) {
            document.getElementById("status").innerHTML += "Failed to connect to event stream.<br>";
        });
        document.getElementById("status").innerHTML += "error handler created.<br>";

        /********/
        // open event
        /********/
        source.addEventListener('open', function(event) {
            document.getElementById("status").innerHTML += "Event source was opened.<br>";
            document.getElementById("container").innerHTML = "";
        });
        document.getElementById("status").innerHTML += "open handler created.<br>";


        document.getElementById("status").innerHTML += "<br>Waiting for events...<br>";
    }

    document.addEventListener('DOMContentLoaded', init);

  </script>

<body>
<div>
    <h2>SSE Testing Page</h2>
</div>
<h2>status messages</h2>
    <div id="status" style="border: 1px black solid; background-color: lightgray;"></div>

<h2>gauges</h2>
    <div id="gauges">
        <table cellpadding=0 border=0>
        <tr><td><p style="font-weight: bold; font-size: 2em; text-align: center;">Rx Power RTL=0</p></td>
            <td><p style="font-weight: bold; font-size: 2em; text-align: center;">Rx Power RTL=1</p></td>
        </tr>
        <tr><td><canvas id="rtl0"></canvas></td>
            <td><canvas id="rtl1"></canvas></td>
        </tr>
        <tr><td><div id="rtl0_value" style="text-align: center;">n/a</div></td>
            <td><div id="rtl1_value" style="text-align: center;">n/a</div></td>
        </tr>
        </table>
    </div>

<h2>messages</h2>
    <div id="container" style="border: 1px black solid; background-color: lightgray;"></div>
</body>
</html>
