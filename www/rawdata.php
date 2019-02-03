<?php

session_start();
$pagetitle="APRS:  Raw Data";
$documentroot = $_SERVER["DOCUMENT_ROOT"];
include_once $documentroot . '/common/functions.php';
include $documentroot . '/common/sessionvariables.php';
include $documentroot . '/common/header.php';
?>
<script>
    // This grabs the session variables
    var mycallsign = "<?php echo $mycallsign; ?>";
    var lookbackperiod = "<?php echo $lookbackperiod; ?>";
    var selectedFlight;
    var packetdata;
    var updatePacketsEvent;
    var flightlist;
    var currentflight;
    var packetcount;


    function getIndicesOf(searchStr, str, caseSensitive) {
        var searchStrLen = searchStr.length;
        if (searchStrLen == 0) {
            return [];
        }
        var startIndex = 0, index, indices = [];
        if (!caseSensitive) {
            str = str.toLowerCase();
            searchStr = searchStr.toLowerCase();
        }
        while ((index = str.indexOf(searchStr, startIndex)) > -1) {
            indices.push(index);
            startIndex = index + searchStrLen;
        }
        return indices;
    }

    function displaypackets () {
        //document.getElementById("debug4").innerHTML = "packetdata: " + JSON.parse(packetdata).length;
        var packets = JSON.parse(packetdata);
        var html = "";
        var keys = Object.keys(packets);
        var key;
        var searchstring = document.getElementById("searchfield").value;
        var searchstring2 = document.getElementById("searchfield2").value;
        var operation = document.getElementById("operation").value;
        var i = 0;

 
        //document.getElementById("debug").innerHTML = operation;
        for (key in keys) {
           if (operation == "and") {
               if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 &&
                   packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) >= 0) {
                   html = html + packets[key].packet + "<br>"; 
                   i += 1;
               }
           }
           else if (operation == "or") {
               //document.getElementById("debug").innerHTML = "in OR section";
               if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 || 
                   packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) >= 0) {
                   html = html + packets[key].packet + "<br>"; 
                   i += 1;
               }
           }
           else if (operation == "not") {
               //document.getElementById("debug").innerHTML = "in OR section";
               if (searchstring.length > 0 && searchstring2.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0 && 
                       packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) < 0) {
                       html = html + packets[key].packet + "<br>"; 
                       i += 1;
                   }
               }
               else if (searchstring.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring.toLowerCase()) >= 0) {
                       html = html + packets[key].packet + "<br>"; 
                       i += 1;
                   }
               }
               else if (searchstring2.length > 0) {
                   if (packets[key].packet.toLowerCase().indexOf(searchstring2.toLowerCase()) < 0) {
                       html = html + packets[key].packet + "<br>"; 
                       i += 1;
                   }
               }
               else {
                   html = html + packets[key].packet + "<br>"; 
                   i += 1;
               }
               
           }

        }
        document.getElementById("packetdata").innerHTML = html;
        document.getElementById("packetcount").innerHTML = i.toLocaleString();
    }


    function selectedflight() {
        var radios = document.getElementsByName("flight");
        var selectedValue;

        for(var i = 0; i < radios.length; i++) {
            if(radios[i].checked) selectedValue = radios[i].value;   
        }
        return selectedValue;
    }

    function initialize() {
        $.get("getflightsformap.php", function(data) {
            var jsondata = JSON.parse(data);
            var keys = Object.keys(jsondata);
            var key;
            var flight;
            var allHtml = "<input type=\"radio\" id=\"allpackets\" name=\"flight\" value=\"allpackets\" checked > All packets (< 3hrs) &nbsp; &nbsp;";
            var html = "<p style=\"font-weight: bold;\">Select flight: <form>" + allHtml;
            var i = 0;

            for (key in keys) {
                flight = jsondata[key].flightid;
                //html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" " + (i == 0 ? "checked" : "") + " > " + flight + "&nbsp &nbsp";
                html = html + "<input type=\"radio\" id=\"" + flight + "\" name=\"flight\" value=\"" + flight + "\" > " + flight + "&nbsp; &nbsp;";
                i += 1;
                
            }
            html = html + "</form></p>";
           
            document.getElementById("flights").innerHTML = html;
 
            //if (keys.length > 0)
            //    currentflight = jsondata[0].flightid;
            currentflight = "allpackets";
            $('input[type="radio"]').on('click change', function(e) {
                currentflight = selectedflight();
                //document.getElementById("debug3").innerHTML = "event called:  " + currentflight;
                getrecentdata();
            });

            getrecentdata();
        });
        //document.getElementById("debug").innerHTML = flightlist;
    }


    function getrecentdata() {
      var url;
 
      if (currentflight == "allpackets")
          url = "getallpackets.php";
      else
          url = "getpackets.php?flightid=" + currentflight;
      //document.getElementById("debug2").innerHTML = "getrecentdata:  " + currentflight + ", url=" + url;
      packetdata = {};
      $.get(url, function(data) { 
          packetdata = data;
          //document.getElementById("debug").innerHTML = "got packets:  " + JSON.parse(data).length;
          updatepackets(); 
      });
    }

    function updatepackets () {
        document.body.dispatchEvent(updatePacketsEvent);
    }

 
    function clearfields() {
        document.getElementById("searchfield").value = "";
        document.getElementById("searchfield2").value = "";
        document.getElementById("operation").selectedIndex = 0;
        document.getElementById("packetdata").innerHTML = "";
        document.getElementById("packetcount").innerHTML = "0";
        updatepackets();
    }


    $(document).ready(function () {
        updatePacketsEvent = new CustomEvent("updatepackets");
        document.body.addEventListener("updatepackets", displaypackets, false);
        
        var e = document.getElementById('searchfield');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('searchfield2');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        var e = document.getElementById('operation');
        e.oninput = updatepackets;
        e.onpropertychange = e.oninput;

        initialize();
        setInterval(getrecentdata, 5000);
    });
    
    
</script>
<div class="main">
    <div class="gallery-area" style="float:  left;">
            <p class="header" style="clear:  none;">
                <img class="bluesquare"  src="/images/graphics/smallbluesquare.png">
                Raw Packet Data
            </p>
            <p class="normal-black"><span id="debug"></span></p>
            <p class="normal-black"><span id="debug2"></span></p>
            <p class="normal-black"><span id="debug3"></span></p>
            <p class="normal-black"><span id="debug4"></span></p>
            <p class="normal-black">
                <span id="flights"></span>
            </p>
            <p class="normal-black">
               Search:  
               <input type="text" size="20" maxlength="128" name="searchfield" id="searchfield" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <select id="operation">
                   <option value="and" selected="selected">And</option>
                   <option value="or">Or</option>
                   <option value="not">Not</option>
               </select>
               <input type="text" size="20" maxlength="128" name="searchfield2" id="searchfield2" autocomplete="off" autocapitalize="off" spellcheck="false" autocorrect="off">
               <button onclick="clearfields();">Clear</button>
            </p>
            <p class="normal-black">
                Number of Packets: 
                <mark><span id="packetcount"></span></mark>
            </p>
            <div class="packetdata"><p class="packetdata"><span id="packetdata"></span></p></div>
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
