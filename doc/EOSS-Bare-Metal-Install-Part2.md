# EOSS SDR Tracker Bare Metal Install - Section 2

Notes by Jeff N2XGL,
Version 1.0, Dated 2019-03-01

## Installing the EOSS SDR Tracker software

The initial build of the EOSS SDR Tracker computers was accomplished by
imaging each hard drive with a "gold" image.  While this greatly simplified
deploying the initial units, it does not provide an easy way to install and
configure a SDR tracker system on your own hardware or from a completely fresh
installation (i.e. from "bare metal").  These instructions are an attempt to
capture all the necessary steps for installing the EOSS Tracker software 
from scratch.  If followed, you should have an up-to-date working EOSS SDR
Tracker computer once completed.

> These instructions are for advanced users and will take several hours,
> depending on how much of the map tile server you want to build.
> Advanced users can modify to suit their own taste (YMMV). 
> EOSS does not provide support for this bare metal approach.

This application note is written in 12 parts in two sections:

### Section 1
1. Install the baseline Operating System
2. Configure the EOSS PPA and user environment
3. Install necessary packages
4. Configure the firewall
5. Install aprsc
6. Create PostgreSQL/PostGIS databases with PostGIS extensions

### Section 2
7. [Install OpenStreetMap tile server](#7-install-openstreetmap-tile-server)
8. Configure renderd
9. Configure Apache for SSL (optional)
10. Configure Apache mod_tile
11. Configure GPSd
12. Install Direwolf


## 7. Install OpenStreetMap tile server

EOSS uses OpenStreetMap to provide offline map information while tracker
vehicles are out of range from cellular data or other Internet connectivity. 
Building the OpenStreetMap database and tiles follows the helpful 
[tutorial](https://switch2osm.org/manually-building-a-tile-server-18-04-lts/) at
Switch2OSM with a few changes for North America map tiles.

> This will take a while.  On a 4-CPU at 2.6 GHz with 8GB RAM it took 44325s (12.31 hr).
> This will create a very large PostgreSQL database (133G).

Begin by installing the OpenStreetMap to PostgreSQL 
tool. [Osm2pgsql](https://github.com/openstreetmap/osm2pgsql) is a tool for loading 
OpenStreetMap data into a PostgreSQL / PostGIS database suitable for applications like 
rendering into a map, geocoding with Nominatim, or general analysis.

```
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ git clone git://github.com/openstreetmap/osm2pgsql.git
eosstracker@tracker:~/src$ cd osm2pgsql
eosstracker@tracker:~/src/osm2pgsql$ mkdir build && cd build
eosstracker@tracker:~/src/osm2pgsql/build$ cmake ..
eosstracker@tracker:~/src/osm2pgsql/build$ make
eosstracker@tracker:~/src/osm2pgsql/build$ sudo make install
```

Next install the SomeoneElseOSM [fork](https://github.com/SomeoneElseOSM/mod_tile) of 
the mod_tile Apache module.  Note the `switch2osm` branch of the GitHub repository.
The mod_tile module is a program to efficiently render and serve map tiles for
OpenStreetMap using Apache and Mapnik.

```
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ git clone -b switch2osm git://github.com/SomeoneElseOSM/mod_tile.git
eosstracker@tracker:~/src$ cd mod_title
eosstracker@tracker:~/src/mod_tile$ ./autogen.sh
eosstracker@tracker:~/src/mod_tile$ ./configure
eosstracker@tracker:~/src/mod_tile$ make
eosstracker@tracker:~/src/mod_tile$ sudo make install
eosstracker@tracker:~/src/mod_tile$ sudo make install-mod_tile
eosstracker@tracker:~/src/mod_tile$ sudo ldconfig
```

Then install the [OpenStreetMap Carto](https://github.com/gravitystorm/openstreetmap-carto) mapnik style
template, which is a general-purpose OpenStreetMap mapnik style, in CartoCSS.

```
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ git clone git://github.com/gravitystorm/openstreetmap-carto.git
eosstracker@tracker:~/src$ cd openstreetmap-carto
eosstracker@tracker:~/src/openstreetmap-carto$ carto project.mml > mapnik.xml
eosstracker@tracker:~/src/openstreetmap-carto$ ./scripts/get-shapefiles.py
```

Once the xml files are created and the map data and symbols are downloaded, copy them 
to the /eosstracker directory:

```
eosstracker@tracker:~/src/openstreetmap-carto$ sudo cp -pr mapnik.xml openstreetmap-carto.lua openstreetmap-carto.style /eosstracker/osm/
eosstracker@tracker:~/src/openstreetmap-carto$ sudo cp -pr data symbols /eosstracker/osm/
eosstracker@tracker:~/src/openstreetmap-carto$ sudo chown -R eosstracker:eosstracker /eosstracker/osm
```

Next is the process to download the shape files for the United States and populate the
database.  Download the latest shape files for North America regions 
from [Geofabrik](https://download.geofabrik.de/).  Four shape files will be downloaded
and then combined into a single shape file that covers all of continental United States.

```
eosstracker@tracker:~$ cd /eosstracker/osm/data
eosstracker@tracker:/eosstracker/osm/data$ wget https://download.geofabrik.de/north-america/us-midwest-latest.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ wget https://download.geofabrik.de/north-america/us-northeast-latest.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ wget https://download.geofabrik.de/north-america/us-south-latest.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ wget https://download.geofabrik.de/north-america/us-west-latest.osm.pbf
```

These are quite large downloads...

```
 1.2G   us-midwest-latest.osm.pbf
 759M   us-northeast-latest.osm.pbf
 2.0G   us-south-latest.osm.pbf
 1.7G   us-west-latest.osm.pbf
```

Now use the osmconvert tool combine the shape files into one file:

```
eosstracker@tracker:/eosstracker/osm/data$ osmconvert us-midwest-latest.osm.pbf --out-o5m | osmconvert - us-northeast-latest.osm.pbf -o=us1.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ osmconvert us1.osm.pbf --out-o5m | osmconvert - us-south-latest.osm.pbf -o=us2.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ osmconvert us2.osm.pbf --out-o5m | osmconvert - us-west-latest.osm.pbf -o=us.osm.pbf
eosstracker@tracker:/eosstracker/osm/data$ rm us1.osm.pbf us2.osm.pbf
```

The final step in the process is to populate the shape file into the PostgreSQL `gis` database.  

> This is a processor- and memory-intensive step that may require a large swap space to be successful. 
> The process will fail without much warning if the system runs out of resources. 
> This will take a while.  On a 4-CPU at 2.6 GHz with 8GB RAM it took 44325s (12.31 hr).
> This will create a very large PostgreSQL database (133G).

To begin, create a temporary large (20 Gb) memory swap file which will be deleted once the process is completed:

```
sudo fallocate -l 20G /swapfile
sudo chmod 600 /swapfile 
sudo mkswap /swapfile 
sudo swapon /swapfile
free -h
```
 
Now run the osm2pgsql process.  Preferably overnight!

`osm2pgsql -d gis --create --slim -G --hstore --tag-transform-script /eosstracker/osm/openstreetmap-carto.lua -C 3500 --number-processes 4 -S /eosstracker/osm/openstreetmap-carto.style /eosstracker/osm/data/us.osm.pbf`

You should see something similar to the following if the process was successful:

```
   [... many lines deleted here ...]

 Processing: Node(706313k 256.1k/s) Way(61378k 2.47k/s) Relation(496000 72.23/s)
   parse time: 34475s
 Node stats: total(706313566), max(6302228722) in 2758s
 Way stats: total(61378654), max(672981542) in 24850s 
 Relation stats: total(496142), max(9354584) in 6867s

 Osm2pgsql took 44325s overall
 node cache: stored: 320233591(45.34%), storage efficiency: 69.81% 
 (dense blocks: 36271, sparse nodes: 80809985), hit rate: 45.26%
```

You can then remove the temporary swap file.

```
sudo swapoff /swapfile
sudo rm /swapfile
free -h
```

That's it!  You now have an OpenStreetMap offline database of the continental United States.

## 8. Install and configure renderd

T

