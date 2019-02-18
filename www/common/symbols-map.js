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


/* This file is just a breakout of each APRS symbol from the primary and secondary symbol tables 
* It provides a convient way to reference/find an APRS symbol since this is all in JSON 
*
*/

var symbols = {
      "/U" : {
         "tocall" : "PU",
         "description" : "Bus"
      },
      "\\_" : {
         "tocall" : "DW",
         "description" : "Weather site"
      },
      "/K" : {
         "tocall" : "PK",
         "description" : "School"
      },
      "\\&" : {
         "tocall" : "OG",
         "description" : "Gateway station"
      },
      "\\n" : {
         "tocall" : "SN",
         "description" : "Red triangle"
      },
      "/)" : {
         "tocall" : "BJ",
         "description" : "Wheelchair, handicapped"
      },
      "/u" : {
         "tocall" : "LU",
         "description" : "Semi-trailer truck, 18-wheeler"
      },
      "/X" : {
         "tocall" : "PX",
         "description" : "Helicopter"
      },
      "\\U" : {
         "tocall" : "AU",
         "description" : "Sunny"
      },
      "\\]" : {
         "tocall" : "DU",
         "unused" : 1
      },
      "/D" : {
         "tocall" : "PD",
         "unused" : 1
      },
      "/0" : {
         "tocall" : "P0",
         "description" : "Numbered circle: 0"
      },
      "/#" : {
         "tocall" : "BD",
         "description" : "Digipeater"
      },
      "\\j" : {
         "tocall" : "SJ",
         "description" : "Work zone, excavating machine"
      },
      "\\e" : {
         "tocall" : "SE",
         "description" : "Sleet"
      },
      "\\." : {
         "tocall" : "OO",
         "description" : "Ambiguous, question mark inside circle"
      },
      "/g" : {
         "tocall" : "LG",
         "description" : "Glider"
      },
      "/=" : {
         "tocall" : "MU",
         "description" : "Railroad engine"
      },
      "\\w" : {
         "tocall" : "SW",
         "description" : "Flooding"
      },
      "/B" : {
         "tocall" : "PB",
         "description" : "BBS"
      },
      "/A" : {
         "tocall" : "PA",
         "description" : "Aid station"
      },
      "\\(" : {
         "tocall" : "OI",
         "description" : "Cloudy"
      },
      "/;" : {
         "tocall" : "MS",
         "description" : "Campground, tent"
      },
      "\\<" : {
         "tocall" : "NT",
         "description" : "Advisory, single red flag"
      },
      "\\k" : {
         "tocall" : "SK",
         "description" : "SUV, ATV"
      },
      "\\W" : {
         "tocall" : "AW",
         "description" : "NWS site"
      },
      "\\8" : {
         "tocall" : "A8",
         "description" : "802.11 WiFi or other network node"
      },
      "\\%" : {
         "tocall" : "OF",
         "unused" : 1
      },
      "/'" : {
         "tocall" : "BH",
         "description" : "Small aircraft"
      },
      "/@" : {
         "tocall" : "MX",
         "description" : "Hurricane predicted path"
      },
      "\\Y" : {
         "tocall" : "AY",
         "unused" : 1
      },
      "/," : {
         "tocall" : "BM",
         "description" : "Boy Scouts"
      },
      "/7" : {
         "tocall" : "P7",
         "description" : "Numbered circle: 7"
      },
      "/H" : {
         "tocall" : "PH",
         "description" : "Hotel"
      },
      "/." : {
         "tocall" : "BO",
         "description" : "Red X"
      },
      "\\E" : {
         "tocall" : "AE",
         "description" : "Smoke, Chimney"
      },
      "\\b" : {
         "tocall" : "SB",
         "description" : "Blowing dust, sand"
      },
      "\\4" : {
         "tocall" : "A4",
         "unused" : 1
      },
      "/i" : {
         "tocall" : "LI",
         "description" : "IOTA, islands on the air"
      },
      "/-" : {
         "tocall" : "BN",
         "description" : "House"
      },
      "\\A" : {
         "tocall" : "AA",
         "description" : "White box"
      },
      "\\@" : {
         "tocall" : "NX",
         "description" : "Hurricane, Tropical storm"
      },
      "\\Q" : {
         "tocall" : "AQ",
         "description" : "Earthquake"
      },
      "/j" : {
         "tocall" : "LJ",
         "description" : "Jeep"
      },
      "\\F" : {
         "tocall" : "AF",
         "description" : "Freezing rain"
      },
      "\\#" : {
         "tocall" : "OD",
         "description" : "Digipeater, green star"
      },
      "/G" : {
         "tocall" : "PG",
         "description" : "Grid square, 3 by 3"
      },
      "\\g" : {
         "tocall" : "SG",
         "description" : "Gale, two red flags"
      },
      "\\7" : {
         "tocall" : "A7",
         "unused" : 1
      },
      "\\S" : {
         "tocall" : "AS",
         "description" : "Satellite"
      },
      "/n" : {
         "tocall" : "LN",
         "description" : "Node, black bulls-eye"
      },
      "/E" : {
         "tocall" : "PE",
         "description" : "Eyeball"
      },
      "/9" : {
         "tocall" : "P9",
         "description" : "Numbered circle: 9"
      },
      "\\9" : {
         "tocall" : "A9",
         "description" : "Gas station"
      },
      "\\c" : {
         "tocall" : "SC",
         "description" : "CD triangle, RACES, CERTS, SATERN"
      },
      "\\>" : {
         "tocall" : "NV",
         "description" : "Red car"
      },
      "/?" : {
         "tocall" : "MW",
         "description" : "File server"
      },
      "\\r" : {
         "tocall" : "SR",
         "description" : "Restrooms"
      },
      "/Y" : {
         "tocall" : "PY",
         "description" : "Sailboat"
      },
      "/b" : {
         "tocall" : "LB",
         "description" : "Bicycle"
      },
      "\\a" : {
         "tocall" : "SA",
         "description" : "Red diamond"
      },
      "\\O" : {
         "tocall" : "AO",
         "description" : "Rocket"
      },
      "\\-" : {
         "tocall" : "ON",
         "description" : "House, HF antenna"
      },
      "/T" : {
         "tocall" : "PT",
         "description" : "SSTV"
      },
      "\\h" : {
         "tocall" : "SH",
         "description" : "Store"
      },
      "\\B" : {
         "tocall" : "AB",
         "description" : "Blowing snow"
      },
      "/k" : {
         "tocall" : "LK",
         "description" : "Truck"
      },
      "/*" : {
         "tocall" : "BK",
         "description" : "Snowmobile"
      },
      "\\+" : {
         "tocall" : "OL",
         "description" : "Church"
      },
      "/\"" : {
         "tocall" : "BC",
         "unused" : 1
      },
      "/{" : {
         "tocall" : "J1",
         "unused" : 1
      },
      "/|" : {
         "tocall" : "J2",
         "unused" : 1
      },
      "\\|" : {
         "tocall" : "Q2",
         "unused" : 1
      },
      "/~" : {
         "tocall" : "J4",
         "unused" : 1
      },
      "\\~" : {
         "tocall" : "Q4",
         "unused" : 1
      },
      "/R" : {
         "tocall" : "PR",
         "description" : "Recreational vehicle"
      },
      "/\\" : {
         "tocall" : "HT",
         "description" : "DF triangle"
      },
      "\\C" : {
         "tocall" : "AC",
         "description" : "Coast Guard"
      },
      "\\p" : {
         "tocall" : "SP",
         "description" : "Partly cloudy"
      },
      "\\I" : {
         "tocall" : "AI",
         "description" : "Rain shower"
      },
      "/v" : {
         "tocall" : "LV",
         "description" : "Van"
      },
      "/Q" : {
         "tocall" : "PQ",
         "unused" : 1
      },
      "\\*" : {
         "tocall" : "OK",
         "description" : "Snow"
      },
      "/V" : {
         "tocall" : "PV",
         "description" : "ATV, Amateur Television"
      },
      "\\R" : {
         "tocall" : "AR",
         "description" : "Restaurant"
      },
      "/^" : {
         "tocall" : "HV",
         "description" : "Large aircraft"
      },
      "/s" : {
         "tocall" : "LS",
         "description" : "Ship, power boat"
      },
      "\\t" : {
         "tocall" : "ST",
         "description" : "Tornado"
      },
      "/}" : {
         "tocall" : "J3",
         "unused" : 1
      },
      "/p" : {
         "tocall" : "LP",
         "description" : "Dog"
      },
      "/`" : {
         "tocall" : "HX",
         "description" : "Satellite dish antenna"
      },
      "\\V" : {
         "tocall" : "AV",
         "description" : "VORTAC, Navigational aid"
      },
      "/M" : {
         "tocall" : "PM",
         "description" : "Mac apple"
      },
      "/Z" : {
         "tocall" : "PZ",
         "description" : "Windows flag"
      },
      "\\0" : {
         "tocall" : "A0",
         "description" : "Circle, IRLP / Echolink/WIRES"
      },
      "\\2" : {
         "tocall" : "A2",
         "unused" : 1
      },
      "/r" : {
         "tocall" : "LR",
         "description" : "Repeater tower"
      },
      "//" : {
         "tocall" : "BP",
         "description" : "Red dot"
      },
      "\\K" : {
         "tocall" : "AK",
         "description" : "Kenwood HT"
      },
      "\\1" : {
         "tocall" : "A1",
         "unused" : 1
      },
      "\\v" : {
         "tocall" : "SV",
         "description" : "Van"
      },
      "\\\\" : {
         "tocall" : "DT",
         "unused" : 1
      },
      "/I" : {
         "tocall" : "PI",
         "description" : "TCP/IP network station"
      },
      "/h" : {
         "tocall" : "LH",
         "description" : "Hospital"
      },
      "\\P" : {
         "tocall" : "AP",
         "description" : "Parking"
      },
      "\\u" : {
         "tocall" : "SU",
         "description" : "No. Truck"
      },
      "/:" : {
         "tocall" : "MR",
         "description" : "Fire"
      },
      "\\'" : {
         "tocall" : "OH",
         "description" : "Crash / incident site"
      },
      "\\X" : {
         "tocall" : "AX",
         "description" : "Pharmacy"
      },
      "\\)" : {
         "tocall" : "OJ",
         "description" : "Firenet MEO, MODIS Earth Observation"
      },
      "/&" : {
         "tocall" : "BG",
         "description" : "HF gateway"
      },
      "/x" : {
         "tocall" : "LX",
         "description" : "X / Unix"
      },
      "\\5" : {
         "tocall" : "A5",
         "unused" : 1
      },
      "/W" : {
         "tocall" : "PW",
         "description" : "Weather service site"
      },
      "\\^" : {
         "tocall" : "DV",
         "description" : "Aircraft"
      },
      "/8" : {
         "tocall" : "P8",
         "description" : "Numbered circle: 8"
      },
      "/f" : {
         "tocall" : "LF",
         "description" : "Fire truck"
      },
      "/S" : {
         "tocall" : "PS",
         "description" : "Space Shuttle"
      },
      "/c" : {
         "tocall" : "LC",
         "description" : "Incident command post"
      },
      "\\s" : {
         "tocall" : "SS",
         "description" : "Ship, boat"
      },
      "/1" : {
         "tocall" : "P1",
         "description" : "Numbered circle: 1"
      },
      "\\f" : {
         "tocall" : "SF",
         "description" : "Funnel cloud"
      },
      "\\=" : {
         "tocall" : "NU",
         "unused" : 1
      },
      "/J" : {
         "tocall" : "PJ",
         "unused" : 1
      },
      "/]" : {
         "tocall" : "HU",
         "description" : "Mailbox, post office"
      },
      "\\G" : {
         "tocall" : "AG",
         "description" : "Snow shower"
      },
      "/m" : {
         "tocall" : "LM",
         "description" : "Mic-E repeater"
      },
      "\\!" : {
         "tocall" : "OB",
         "description" : "Emergency"
      },
      "/C" : {
         "tocall" : "PC",
         "description" : "Canoe"
      },
      "\\x" : {
         "tocall" : "SX",
         "unused" : 1
      },
      "\\;" : {
         "tocall" : "NS",
         "description" : "Park, picnic area"
      },
      "\\o" : {
         "tocall" : "SO",
         "description" : "Small circle"
      },
      "\\$" : {
         "tocall" : "OE",
         "description" : "Bank or ATM"
      },
      "/3" : {
         "tocall" : "P3",
         "description" : "Numbered circle: 3"
      },
      "/+" : {
         "tocall" : "BL",
         "description" : "Red Cross"
      },
      "\\l" : {
         "tocall" : "SL",
         "unused" : 1
      },
      "/5" : {
         "tocall" : "P5",
         "description" : "Numbered circle: 5"
      },
      "\\L" : {
         "tocall" : "AL",
         "description" : "Lighthouse"
      },
      "\\\"" : {
         "tocall" : "OC",
         "unused" : 1
      },
      "/a" : {
         "tocall" : "LA",
         "description" : "Ambulance"
      },
      "/$" : {
         "tocall" : "BE",
         "description" : "Telephone"
      },
      "\\:" : {
         "tocall" : "NR",
         "description" : "Hail"
      },
      "/P" : {
         "tocall" : "PP",
         "description" : "Police car"
      },
      "\\D" : {
         "tocall" : "AD",
         "description" : "Drizzling rain"
      },
      "/N" : {
         "tocall" : "PN",
         "description" : "NTS station"
      },
      "/e" : {
         "tocall" : "LE",
         "description" : "Horse, equestrian"
      },
      "\\N" : {
         "tocall" : "AN",
         "description" : "Navigation buoy"
      },
      "\\{" : {
         "tocall" : "Q1",
         "description" : "Fog"
      },
      "\\q" : {
         "tocall" : "SQ",
         "unused" : 1
      },
      "/F" : {
         "tocall" : "PF",
         "description" : "Farm vehicle, tractor"
      },
      "\\Z" : {
         "tocall" : "AZ",
         "unused" : 1
      },
      "\\M" : {
         "tocall" : "AM",
         "unused" : 1
      },
      "/[" : {
         "tocall" : "HS",
         "description" : "Human"
      },
      "/L" : {
         "tocall" : "PL",
         "description" : "PC user"
      },
      "/(" : {
         "tocall" : "BI",
         "description" : "Mobile satellite station"
      },
      "/w" : {
         "tocall" : "LW",
         "description" : "Water station"
      },
      "\\[" : {
         "tocall" : "DS",
         "description" : "Wall Cloud"
      },
      "/O" : {
         "tocall" : "PO",
         "description" : "Balloon"
      },
      "\\d" : {
         "tocall" : "SD",
         "description" : "DX spot"
      },
      "/2" : {
         "tocall" : "P2",
         "description" : "Numbered circle: 2"
      },
      "/<" : {
         "tocall" : "MT",
         "description" : "Motorcycle"
      },
      "\\?" : {
         "tocall" : "NW",
         "description" : "Info kiosk"
      },
      "\\m" : {
         "tocall" : "SM",
         "description" : "Value sign, 3 digit display"
      },
      "\\z" : {
         "tocall" : "SZ",
         "description" : "Shelter"
      },
      "/%" : {
         "tocall" : "BF",
         "description" : "DX cluster"
      },
      "/q" : {
         "tocall" : "LQ",
         "description" : "Grid square, 2 by 2"
      },
      "/d" : {
         "tocall" : "LD",
         "description" : "Fire station"
      },
      "/t" : {
         "tocall" : "LT",
         "description" : "Truck stop"
      },
      "\\y" : {
         "tocall" : "SY",
         "description" : "Skywarn"
      },
      "\\}" : {
         "tocall" : "Q3",
         "unused" : 1
      },
      "/z" : {
         "tocall" : "LZ",
         "description" : "Shelter"
      },
      "\\6" : {
         "tocall" : "A6",
         "unused" : 1
      },
      "\\J" : {
         "tocall" : "AJ",
         "description" : "Lightning"
      },
      "/6" : {
         "tocall" : "P6",
         "description" : "Numbered circle: 6"
      },
      "\\," : {
         "tocall" : "OM",
         "description" : "Girl Scouts"
      },
      "\\`" : {
         "tocall" : "DX",
         "description" : "Rain"
      },
      "/4" : {
         "tocall" : "P4",
         "description" : "Numbered circle: 4"
      },
      "\\H" : {
         "tocall" : "AH",
         "description" : "Haze"
      },
      "/y" : {
         "tocall" : "LY",
         "description" : "House, yagi antenna"
      },
      "\\i" : {
         "tocall" : "SI",
         "description" : "Black box, point of interest"
      },
      "/!" : {
         "tocall" : "BB",
         "description" : "Police station"
      },
      "/o" : {
         "tocall" : "LO",
         "description" : "Emergency operations center"
      },
      "\\T" : {
         "tocall" : "AT",
         "description" : "Thunderstorm"
      },
      "\\3" : {
         "tocall" : "A3",
         "unused" : 1
      },
      "\\/" : {
         "tocall" : "OP",
         "description" : "Waypoint destination"
      },
      "/l" : {
         "tocall" : "LL",
         "description" : "Laptop"
      },
      "/_" : {
         "tocall" : "HW",
         "description" : "Weather station"
      },
      "/>" : {
         "tocall" : "MV",
         "description" : "Car"
      },

/* This symbol is special and not part of the APRS symbol spec...but we add it here so that it let's us display our current
*  location on the map as a blue dot.  ;)
*/
      "1x" : {
         "tocall" : "1x",
         "description" : "Reticle"
      }
};

