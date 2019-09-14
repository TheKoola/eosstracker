--##################################################
--#    This file is part of the HABTracker project for tracking high altitude balloons.
--#
--#    Copyright (C) 2019, Jeff Deaton (N6BA)
--#
--#    HABTracker is free software: you can redistribute it and/or modify
--#    it under the terms of the GNU General Public License as published by
--#    the Free Software Foundation, either version 3 of the License, or
--#    (at your option) any later version.
--#
--#    HABTracker is distributed in the hope that it will be useful,
--#    but WITHOUT ANY WARRANTY; without even the implied warranty of
--#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
--#    GNU General Public License for more details.
--#
--#    You should have received a copy of the GNU General Public License
--#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
--#
--##################################################

create table packets (
    tm timestamp with time zone,
    callsign text,
    symbol text,
    speed_mph decimal,
    bearing decimal,
    altitude decimal,
    comment text,
    location2d geometry(POINT, 4326),
    location3d geometry(POINTZ, 4326),
    raw text,
    ptype text,
    hash text,
    primary key (tm, callsign, hash)
);

create index packets_idx2 on packets (callsign);
create index packets_idx3 on packets (ptype);
create index packets_idx5 on packets (hash);


create table packettypes (
    ptype text,
    description text,
    primary key (ptype)
);

insert into packettypes values (E'!', 'Position without timestamp - no APRS messaging');
insert into packettypes values (E'=', 'Position without timestamp - with APRS messaging'); 
insert into packettypes values (E'$', 'Raw GPS data or Ultimeter 2000 WX station');
insert into packettypes values (E'\'', 'Old Mic-E data - but current data for TM-D700');
insert into packettypes values (E'`', 'Current Mic-E data - not used in TM-D700');
insert into packettypes values (E')', 'Item');
insert into packettypes values (E'/', 'Position with timestamp - no APRS messaging');
insert into packettypes values (E'@', 'Position with timestamp - with APRS messaging');
insert into packettypes values (E':', 'Message - for one person/group/bulletin');
insert into packettypes values (E';', 'Object');
insert into packettypes values (E'<', 'Station capabilities');
insert into packettypes values (E'>', 'Status report');
insert into packettypes values (E'?', 'General query');
insert into packettypes values (E'T', 'Telemetry');
insert into packettypes values (E'_', 'Positionless weather report');
insert into packettypes values (E'{', 'User defined data');
insert into packettypes values (E't', 'Raw tuch tone data - not part of APRS standard');
insert into packettypes values (E'm', 'Morse code data - not part of APRS standard');
insert into packettypes values (E'}', 'Third party header');


create table symbols (
    symbol text NULL,
    description text
);


insert into symbols values (E'/<', E'motorcycle');
insert into symbols values (E'\<', E'Advisory (single gale flag)');
insert into symbols values (E'/^', E'LARGE Aircraft');
insert into symbols values (E'\^', E'top-view originally intended to point in direction of flight');
insert into symbols values (E'A^', E'Autonomous (2015)');
insert into symbols values (E'D^', E'Drone   (new may 2014)');
insert into symbols values (E'E^', E'Electric aircraft (2015)');
insert into symbols values (E'H^', E'Hovercraft    (new may 2014)');
insert into symbols values (E'J^', E'JET     (new may 2014)');
insert into symbols values (E'M^', E'Missle   (new may 2014)');
insert into symbols values (E'P^', E'Prop (new Aug 2014)');
insert into symbols values (E'R^', E'Remotely Piloted (new 2015)');
insert into symbols values (E'S^', E'Solar Powered  (new 2015)');
insert into symbols values (E'V^', E'Vertical takeoff   (new may 2014)');
insert into symbols values (E'X^', E'Experimental (new Aug 2014)');
insert into symbols values (E'/$', E'original primary Phone');
insert into symbols values (E'\$', E'Bank or ATM (generic)');
insert into symbols values (E'U$', E'US dollars');
insert into symbols values (E'L$', E'Brittish Pound');
insert into symbols values (E'Y$', E'Japanese Yen');
insert into symbols values (E'/a', E'Ambulance');
insert into symbols values (E'Aa', E'ARES');
insert into symbols values (E'Da', E'DSTAR (had been ARES Dutch)');
insert into symbols values (E'Ga', E'RSGB Radio Society of Great Brittan');
insert into symbols values (E'Ra', E'RACES');
insert into symbols values (E'Sa', E'SATERN Salvation Army');
insert into symbols values (E'Wa', E'WinLink');
insert into symbols values (E'Ya', E'C4FM Yaesu repeaters');
insert into symbols values (E'/O', E'Original Balloon (think Ham balloon)');
insert into symbols values (E'\O', E'ROCKET (amateur)(2007)');
insert into symbols values (E'BO', E'Blimp           (2015)');
insert into symbols values (E'MO', E'Manned Balloon  (2015)');
insert into symbols values (E'TO', E'Teathered       (2015)');
insert into symbols values (E'CO', E'Constant Pressure - Long duration (2015)');
insert into symbols values (E'RO', E'Rocket bearing Balloon (Rockoon)  (2015)');
insert into symbols values (E'/A', E'Aid station');
insert into symbols values (E'\A', E'numbered box');
insert into symbols values (E'9A', E'Mobile DTMF user');
insert into symbols values (E'7A', E'HT DTMF user');
insert into symbols values (E'HA', E'House DTMF user');
insert into symbols values (E'EA', E'Echolink DTMF report');
insert into symbols values (E'IA', E'IRLP DTMF report');
insert into symbols values (E'RA', E'RFID report');
insert into symbols values (E'AA', E'AllStar DTMF report');
insert into symbols values (E'DA', E'D-Star report');
insert into symbols values (E'XA', E'OLPC Laptop XO');
insert into symbols values (E'/h', E'Hospital');
insert into symbols values (E'\h', E'Ham Store       ** <= now used for HAMFESTS');
insert into symbols values (E'Ch', E'Club (ham radio)');
insert into symbols values (E'Fh', E'HamFest (new Aug 2014)');
insert into symbols values (E'Hh', E'Home Depot etc..');
insert into symbols values (E'/>', E'normal car (side view)');
insert into symbols values (E'\>', E'Top view and symbol POINTS in direction of travel');
insert into symbols values (E'#>', E'Reserve overlays 1-9 for numbered cars (new Aug 2014)');
insert into symbols values (E'B>', E'Battery (was E for electric)');
insert into symbols values (E'E>', E'Ethanol (was electric)');
insert into symbols values (E'F>', E'Fuelcell or hydrogen ');
insert into symbols values (E'H>', E'Homemade');
insert into symbols values (E'P>', E'Plugin-hybrid');
insert into symbols values (E'S>', E'Solar powered');
insert into symbols values (E'T>', E'Tesla  (temporary)');
insert into symbols values (E'V>', E'GM Volt (temporary)');
insert into symbols values (E'/c', E'Incident Command Post');
insert into symbols values (E'\c', E'Civil Defense');
insert into symbols values (E'Dc', E'Decontamination (new Aug 2014)');
insert into symbols values (E'Rc', E'RACES');
insert into symbols values (E'Sc', E'SATERN mobile canteen');
insert into symbols values (E'/D', E'was originally undefined');
insert into symbols values (E'\D', E'was drizzle (moved to ovlyD)');
insert into symbols values (E'AD', E'Airport  (new Aug 2014)');
insert into symbols values (E'FD', E'Ferry Landing (new Aug 2014)');
insert into symbols values (E'HD', E'Heloport (new Aug 2014)');
insert into symbols values (E'RD', E'Rail Depot  (new Aug 2014)');
insert into symbols values (E'BD', E'Bus Depot (new Aug 2014)');
insert into symbols values (E'LD', E'LIght Rail or Subway (new Aug 2014)');
insert into symbols values (E'SD', E'Seaport Depot (new Aug 2014)');
insert into symbols values (E'/#', E'Generic digipeater');
insert into symbols values (E'1#', E'WIDE1-1 digipeater');
insert into symbols values (E'A#', E'Alternate input (i.e. 144.990MHz) digipeater');
insert into symbols values (E'E#', E'Emergency powered (assumed full normal digi)');
insert into symbols values (E'I#', E'I-gate equipped digipeater');
insert into symbols values (E'L#', E'WIDEn-N with path length trapping');
insert into symbols values (E'P#', E'PacComm');
insert into symbols values (E'S#', E'SSn-N digipeater (includes WIDEn-N)');
insert into symbols values (E'X#', E'eXperimental digipeater');
insert into symbols values (E'V#', E'Viscous https://github.com/PhirePhly/aprx/blob/master/ViscousDigipeater.README');
insert into symbols values (E'W#', E'WIDEn-N, SSn-N and Trapping');
insert into symbols values (E'/!', E'Police/Sheriff, etc');
insert into symbols values (E'\!', E'Emergency!');
insert into symbols values (E'E!', E'ELT or EPIRB  (new Aug 2014)');
insert into symbols values (E'V!', E'Volcanic Eruption or Lava  (new Aug 2014)');
insert into symbols values (E'/E', E'Eyeball for special live events');
insert into symbols values (E'\E', E'(existing smoke) the symbol with no overlay');
insert into symbols values (E'HE', E'(H overlay) Haze');
insert into symbols values (E'SE', E'(S overlay) Smoke');
insert into symbols values (E'BE', E'(B overlay) Blowing Snow         was \B');
insert into symbols values (E'DE', E'(D overlay) blowing Dust or sand was \b');
insert into symbols values (E'FE', E'(F overlay) Fog                  was \{');
insert into symbols values (E'/&', E'HF Gateway  <= the original primary table definition');
insert into symbols values (E'I&', E'Igate Generic (please use more specific overlay)');
insert into symbols values (E'R&', E'Receive only IGate (do not send msgs back to RF)');
insert into symbols values (E'P&', E'PSKmail node');
insert into symbols values (E'T&', E'TX igate with path set to 1 hop only)');
insert into symbols values (E'W&', E'WIRES-X as opposed to W0 for WiresII');
insert into symbols values (E'2&', E'TX igate with path set to 2 hops (not generally good idea)');
insert into symbols values (E'/\\', E'Triangle DF primary symbol');
insert into symbols values (E'\\\\', E'was undefined alternate symbol');
insert into symbols values (E'A\\', E'Avmap G5      * <= Recommend special symbol');
insert into symbols values (E'/H', E'hotel');
insert into symbols values (E'\\H', E'Haze');
insert into symbols values (E'MH', E'Methane Hazard (new Apr 2017)');
insert into symbols values (E'RH', E'Radiation detector (new mar 2011)');
insert into symbols values (E'WH', E'Hazardous Waste');
insert into symbols values (E'XH', E'Skull&Crossbones');
insert into symbols values (E'/[', E'Human');
insert into symbols values (E'\\[', E'Wall Cloud (the original definition)');
insert into symbols values (E'B[', E'Baby on board (stroller, pram etc)');
insert into symbols values (E'S[', E'Skier      * <= Recommend Special Symbol');
insert into symbols values (E'R[', E'Runner');
insert into symbols values (E'H[', E'Hiker');
insert into symbols values (E'/-', E'House');
insert into symbols values (E'\\-', E'(was HF)');
insert into symbols values (E'5-', E'50 Hz if non standard');
insert into symbols values (E'6-', E'60 Hz if non standard');
insert into symbols values (E'B-', E'Battery or off grid');
insert into symbols values (E'C-', E'Combined alternatives');
insert into symbols values (E'E-', E'Emergency power (grid down)');
insert into symbols values (E'G-', E'Geothermal');
insert into symbols values (E'H-', E'Hydro powered');
insert into symbols values (E'O-', E'Operator Present');
insert into symbols values (E'S-', E'Solar Power');
insert into symbols values (E'W-', E'Wind power');
insert into symbols values (E'/\'', E'Small Aircraft (original primary symbol)');
insert into symbols values (E'\\\'', E'Airplane Crash Site  <= the original alternate deifinition');
insert into symbols values (E'A\'', E'Automobile crash site');
insert into symbols values (E'H\'', E'Hazardous incident');
insert into symbols values (E'M\'', E'Multi-Vehicle crash site');
insert into symbols values (E'P\'', E'Pileup');
insert into symbols values (E'T\'', E'Truck wreck');
insert into symbols values (E'A0', E'Allstar Node (A0)');
insert into symbols values (E'E0', E'Echolink Node (E0)');
insert into symbols values (E'I0', E'IRLP repeater (I0)');
insert into symbols values (E'S0', E'Staging Area  (S0)');
insert into symbols values (E'V0', E'Echolink and IRLP (VOIP)');
insert into symbols values (E'W0', E'WIRES (Yaesu VOIP)');
insert into symbols values (E'88', E'802.11 network node (88)');
insert into symbols values (E'G8', E'802.11G  (G8)');
insert into symbols values (E'/;', E'Portable operation (tent)');
insert into symbols values (E'\\;', E'Park or Picnic');
insert into symbols values (E'F;', E'Field Day');
insert into symbols values (E'I;', E'Islands on the air');
insert into symbols values (E'S;', E'Summits on the air');
insert into symbols values (E'W;', E'WOTA');
insert into symbols values (E'/%', E'DX cluster  <= the original primary table definition');
insert into symbols values (E'C%', E'Coal');
insert into symbols values (E'E%', E'Emergency  (new Aug 2014)');
insert into symbols values (E'G%', E'Geothermal');
insert into symbols values (E'H%', E'Hydroelectric');
insert into symbols values (E'N%', E'Nuclear');
insert into symbols values (E'P%', E'Portable (new Aug 2014)');
insert into symbols values (E'R%', E'Renewable (hydrogen etc fuels)');
insert into symbols values (E'S%', E'Solar');
insert into symbols values (E'T%', E'Turbine');
insert into symbols values (E'W%', E'Wind');
insert into symbols values (E'\R', E'Restaurant (generic)');
insert into symbols values (E'7R', E'7/11');
insert into symbols values (E'KR', E'KFC');
insert into symbols values (E'MR', E'McDonalds');
insert into symbols values (E'TR', E'Taco Bell');
insert into symbols values (E'/Y', E'Yacht  <= the original primary symbol');
insert into symbols values (E'\\Y', E'       <= the original alternate was undefined');
insert into symbols values (E'AY', E'Alinco');
insert into symbols values (E'BY', E'Byonics');
insert into symbols values (E'IY', E'Icom');
insert into symbols values (E'KY', E'Kenwood       * <= Recommend special symbol');
insert into symbols values (E'YY', E'Yaesu/Standard* <= Recommend special symbol');
insert into symbols values (E'/k', E'truck');
insert into symbols values (E'\\k', E'SUV');
insert into symbols values (E'4k', E'4x4');
insert into symbols values (E'Ak', E'ATV (all terrain vehicle)');
insert into symbols values (E'/z', E'was available');
insert into symbols values (E'\\\\z', E'overlayed shelter');
insert into symbols values (E'Cz', E'Clinic (new Aug 2014)');
insert into symbols values (E'Ez', E'Emergency Power');
insert into symbols values (E'Gz', E'Government building  (new Aug 2014)');
insert into symbols values (E'Mz', E'Morgue (new Aug 2014)');
insert into symbols values (E'Tz', E'Triage (new Aug 2014)');
insert into symbols values (E'/s', E'Power boat (ship) side view');
insert into symbols values (E'\\s', E'Overlay Boat (Top view)');
insert into symbols values (E'6s', E'Shipwreck (\'deep6\') (new Aug 2014)');
insert into symbols values (E'Bs', E'Pleasure Boat');
insert into symbols values (E'Cs', E'Cargo');
insert into symbols values (E'Ds', E'Diving');
insert into symbols values (E'Es', E'Emergency or Medical transport');
insert into symbols values (E'Fs', E'Fishing');
insert into symbols values (E'Hs', E'High-speed Craft ');
insert into symbols values (E'Js', E'Jet Ski');
insert into symbols values (E'Ls', E'Law enforcement');
insert into symbols values (E'Ms', E'Miltary');
insert into symbols values (E'Os', E'Oil Rig');
insert into symbols values (E'Ps', E'Pilot Boat (new Aug 2014)');
insert into symbols values (E'Qs', E'Torpedo');
insert into symbols values (E'Ss', E'Search and Rescue');
insert into symbols values (E'Ts', E'Tug (new Aug 2014)');
insert into symbols values (E'Us', E'Underwater ops or submarine');
insert into symbols values (E'Ws', E'Wing-in-Ground effect (or Hovercraft)');
insert into symbols values (E'Xs', E'Passenger (paX)(ferry)');
insert into symbols values (E'Ys', E'Sailing (large ship)');
insert into symbols values (E'/u', E'Truck (18 wheeler)');
insert into symbols values (E'\\u', E'truck with overlay');
insert into symbols values (E'Bu', E'Buldozer/construction/Backhoe  (new Aug 2014)');
insert into symbols values (E'Gu', E'Gas');
insert into symbols values (E'Pu', E'Plow or SnowPlow (new Aug 2014)');
insert into symbols values (E'Tu', E'Tanker');
insert into symbols values (E'Cu', E'Chlorine Tanker');
insert into symbols values (E'Hu', E'Hazardous');
insert into symbols values (E'/w', E'Water Station or other H2O');
insert into symbols values (E'\\w', E'flooding (or Avalanche/slides)');
insert into symbols values (E'Aw', E'Avalanche');
insert into symbols values (E'Gw', E'Green Flood Gauge');
insert into symbols values (E'Mw', E'Mud slide');
insert into symbols values (E'Nw', E'Normal flood gauge (blue)');
insert into symbols values (E'Rw', E'Red flood gauge');
insert into symbols values (E'Sw', E'Snow Blockage');
insert into symbols values (E'Yw', E'Yellow flood gauge');


create table flights (
    flightid text primary key,
    description text,
    thedate date,
    active boolean,
    launchsite text
);


create table flightmap (
    flightid text, 
    callsign text,
    location text,
    freq numeric,
    primary key (flightid, callsign),
    foreign key (flightid) references flights(flightid) on update cascade on delete cascade
);

create index flightmap_idx1 on flightmap(flightid);


create table predictiondata (
    flightid text,
    launchsite text, 
    thedate date,
    thetime time,
    altitude numeric,
    latitude numeric,
    longitude numeric,
    altrate numeric,
    latrate numeric,
    longrate numeric,
    primary key (flightid, launchsite, thedate, thetime),
    foreign key (flightid) references flights(flightid) on update cascade on delete cascade
);

create index predictiondata_idx1 on predictiondata(flightid);

create table landingpredictions (
    tm timestamp with time zone,
    flightid text,
    callsign text,
    thetype text,
    coef_a numeric,
    location2d geometry(POINT, 4326),
    flightpath geometry(LINESTRING, 4326),
    primary key (tm, flightid, callsign, thetype),
    foreign key (flightid) references flights(flightid) on update cascade on delete cascade
);


create table gpsposition (
    tm timestamp with time zone,
    speed_mph numeric,
    bearing numeric,
    altitude_ft numeric,
    location2d geometry(POINT, 4326),
    location3d geometry(POINTZ, 4326),
    primary key (tm)
);


-- insert a single record into the gpsposition table just in case we startup for the first time and don't have a GPS unit attached!
-- position to downtown Denver...
insert into gpsposition values (now(), 0,0,5280, ST_GeometryFromText('POINT(-104.985 39.740)', 4326), ST_GeometryFromText('POINTZ(-104.985 39.740 5280)', 4326));



create table teams (
    tactical text primary key,
    flightid text,
    foreign key (flightid) references flights(flightid) on update cascade on delete set null
);

insert into teams values('Alpha', NULL);
insert into teams values('Bravo', NULL);
insert into teams values('Charlie', NULL);
insert into teams values('Delta', NULL);
insert into teams values('Echo', NULL);
insert into teams values('Foxtrot', NULL);
insert into teams values('Golf', NULL);
insert into teams values('Ground Station', NULL);
insert into teams values('Hotel', NULL);
insert into teams values('India', NULL);
insert into teams values('Juliet', NULL);
insert into teams values('Kilo', NULL);
insert into teams values('Lima', NULL);
insert into teams values('Launch Team', NULL);
insert into teams values('Mike', NULL);
insert into teams values('November', NULL);
insert into teams values('Oscar', NULL);
insert into teams values('Papa', NULL);
insert into teams values('Quebec', NULL);
insert into teams values('Romeo', NULL);
insert into teams values('Sierra', NULL);
insert into teams values('Tango', NULL);
insert into teams values('Uniform', NULL);
insert into teams values('Victor', NULL);
insert into teams values('Whiskey', NULL);
insert into teams values('Xray', NULL);
insert into teams values('Yankee', NULL);
insert into teams values('Zulu', NULL);


create table trackers (
    callsign text,
    tactical text,
    notes text,
    primary key (callsign),
    foreign key (tactical) references teams (tactical) on update cascade on delete set null
);


create table freqs (
    freq numeric primary key
);
 
insert into freqs values (144.390);
insert into freqs values (144.360);
insert into freqs values (144.340);
insert into freqs values (144.905);
insert into freqs values (145.045);
insert into freqs values (145.535);
insert into freqs values (145.645);
insert into freqs values (145.710);
insert into freqs values (145.765);

create table launchsites (
    launchsite text primary key,
    lat numeric,
    lon numeric,
    alt numeric
);

