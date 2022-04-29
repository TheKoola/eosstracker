<!DOCTYPE html>
<html>
<body>
  <script>
    function init() {
        document.getElementById("status").innerHTML += "starting up the shield...<br>";

        var source = new EventSource("sse.php");
        document.getElementById("status").innerHTML += "EventSource created.<br>";

        source.addEventListener('message', function(event) {
            //var data = JSON.parse(event.data);
            document.getElementById("container").innerHTML += event.data + "<br>";
        });
        document.getElementById("status").innerHTML += "message handler created.<br>";

        source.addEventListener('gpsupdate', function(event) {
            var data = JSON.parse(event.data);
            //var data = event.data
            //var payload = JSON.parse(data.payload);
            document.getElementById("container").innerHTML += "GPSUPDATE: coords: " + data.latitude + ", " + data.longitude + "  alt: " + data.altitude_ft + "  speed: " + data.speed_mph + "<br>";
            //document.getElementById("container").innerHTML += "GPSUPDATE:" + JSON.stringify(data) + "<br>";
        });
        document.getElementById("status").innerHTML += "gpsupdate handler created.<br>";

        source.addEventListener('error', function(event) {
            document.getElementById("status").innerHTML += "Failed to connect to event stream.<br>";
        });
        document.getElementById("status").innerHTML += "error handler created.<br>";

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

<h2>messages</h2>
  <div id="container" style="border: 1px black solid; background-color: lightgray;"></div>
</body>
</html>
