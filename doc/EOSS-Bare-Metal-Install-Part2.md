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
7. [Install OpenStreetMap tile server](#installosm)
8. [Configure renderd](#renderd)
9. [Configure Apache](#apache)
11. Configure GPSD
12. Install Direwolf


<a name="installosm"></a>
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
sudo apt install osm2pgsql
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
eosstracker@tracker:~/src/openstreetmap-carto$ sudo cp -pr data symbols patterns /eosstracker/osm/
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

<a name="renderd"></a>
## 8. Configure renderd

Renderd will listen for map rendering requests, read data from the `gis` database about the geographic area in question, and create metatiles (bundled groups of small PNG images) at the zoom level requested.  Metatiles are saved within a specific location that is specified in two locations:  `/usr/local/etc/renderd.conf` and `/etc/apache2/sites-enabled/default-ssl.conf`.


### The Renderd configuration file

Edit the renderd configuration file:
```
sudo vi /usr/local/etc/renderd.conf
```

Edit the paths so that your `renderd.conf` looks like this example:
```
[renderd]
num_threads=4
tile_dir=/eosstracker/maps
stats_file=/var/run/renderd/renderd.stats

[mapnik]
plugins_dir=/usr/lib/mapnik/3.0/input
font_dir=/usr/share/fonts/truetype
font_dir_recurse=1

[maps]
URI=/maps/
TILEDIR=/eosstracker/maps
XML=/eosstracker/osm/mapnik.xml
HOST=localhost
TILESIZE=256
MAXZOOM=20
```

### The renderd service

This will create the renderd service and set it to automatically start at system boot.  First edit the copy of renderd.init within the mod_tile source tree:
```
cd ~/src/mod_tile/debian
vi renderd.init
```

Then change the `RUNASUSER=` line to indicate that we want the renderd service to run as the `eosstracker` user:
```
RUNASUSER=eosstracker
```

Then save and exit.

Next copy that file to the `/etc/init.d` directory, change its permissions, and copy the service file to the `/lib/systemd/system` directory:
``` 
sudo cp ~/src/mod_tile/debian/renderd.init /etc/init.d/renderd
sudo chmod u+x /etc/init.d/renderd
sudo cp ~/src/mod_tile/debian/renderd.service /lib/systemd/system
```

Try and start the service.  It shoud reply with `[ ok ] Starting renderd (via systemctl): renderd.service.`:
```
sudo /etc/init.d/renderd start
```


Assuming that was successful, then enable renderd to start automatically at every system restart:
``` 
sudo systemctl enable renderd
```


### Create touch file to prevent tile re-rendering

This touch file (a file with zero size) will prevent renderd from re-rendering old tiles.  Since this is an offline (so to speak) version of OSM the database will never be updated with new/changed content from OpenStreetMaps.  By default when renderd looks at a metatile that's older than 3 days it will initiate a re-render job, creating a new metatile for that geographic area.  That's great if the database is being updated with new content, but with this install, that data is static.  Therefore, we want to prevent renderd from re-rendering tiles. 

To do that, we need to create the `tiles` sub-directory (if it doesn't already exist) and create a touch file therein.  Like this:
```
mkdir -p /eosstracker/maps/tiles
touch -t /eosstracker/maps/tiles/planet-import-complete
```


<a name="apache"></a>
## 9. Configure Apache

### Enable apache modules

Enable these modules for Apache:

```
sudo a2enmod ssl
sudo a2enmod rewrite
```

### Edit the two site configuration files

The two Apache site confguration files will need to be edited to reflect the new location of the DocumentRoot and to enable redirection to the SSL port 443.  Start by editing the `/etc/apache2/sites-enabled/000-default.conf`.  

Edit the file as root:
```
sudo vi /etc/apache2/sites-enabled/000-default.conf
```


Change the `DocumentRoot` directive to reflect the `/eosstracker/www` path.  Then paste in these lines so that HTTP requests are redirected to their HTTPS equivalents:

```
        RewriteEngine On
        RewriteCond %{HTTPS} off
        RewriteRule (.*) https://%{SERVER_NAME}/$1 [R,L]
```


Example, final version of the `/etc/apache2/sites-enabled/000-default.conf` file:

```
<VirtualHost *:80>
        # The ServerName directive sets the request scheme, hostname and port that
        # the server uses to identify itself. This is used when creating
        # redirection URLs. In the context of virtual hosts, the ServerName
        # specifies what hostname must appear in the request's Host: header to
        # match this virtual host. For the default virtual host (this file) this
        # value is not decisive as it is used as a last resort host regardless.
        # However, you must set it for any further virtual host explicitly.
        #ServerName www.example.com

        ServerAdmin webmaster@localhost
        DocumentRoot /eosstracker/www

        RewriteEngine On
        RewriteCond %{HTTPS} off
        RewriteRule (.*) https://%{SERVER_NAME}/$1 [R,L]

        # Available loglevels: trace8, ..., trace1, debug, info, notice, warn,
        # error, crit, alert, emerg.
        # It is also possible to configure the loglevel for particular
        # modules, e.g.
        #LogLevel info ssl:warn

        ErrorLog ${APACHE_LOG_DIR}/error.log
        CustomLog ${APACHE_LOG_DIR}/access.log combined

        # For most configuration files from conf-available/, which are
        # enabled or disabled at a global level, it is possible to
        # include a line for only one particular virtual host. For example the
        # following line enables the CGI configuration for this host only
        # after it has been globally disabled with "a2disconf".
        #Include conf-available/serve-cgi-bin.conf
</VirtualHost>

# vim: syntax=apache ts=4 sw=4 sts=4 sr noet
```


Next, paste in lines that will support the renderd daemon and update the DocumentRoot directive within the SSL site, apache configuration file, `/etc/apache2/sites-enabled/default-ssl.conf`.

Edit the file:
```
sudo vi /etc/apache2/sites-enabled/default-ssl.conf
```

Make sure the top of the file looks like this:
```
<IfModule mod_ssl.c>
        <VirtualHost _default_:443>
                ServerAdmin webmaster@localhost

                DocumentRoot /eosstracker/www

                ##### this is for OSM tile rendering...
                LoadTileConfigFile /usr/local/etc/renderd.conf
                ModTileRenderdSocketName /var/run/renderd/renderd.sock
                # Timeout before giving up for a tile to be rendered
                ModTileRequestTimeout 0
                # Timeout before giving up for a tile to be rendered that is otherwise missing
                ModTileMissingRequestTimeout 30
                #######

```

### Edit apache2.conf

The primary apache configuration file will need to be updated to allow web trafic to the `/eosstracker/www` directory.

Edit the file:
```
sudo vi /etc/apache2/apache2.conf
```

Then near the bottom of the file (amongst the other `directory` initatives) paste in these lines:
```
<Directory /eosstracker/www/>
        Options Indexes FollowSymLinks
        AllowOverride None
        Require all granted
</Directory>
```

### Update apache to load the mod_tile module

Apache will need to know about the mod_tile module. Edit a new file called `/etc/apache2/conf-available/mod_tile.conf` and a directive that indicates where the library module is located at. 

Edit the file:
```
sudo vi /etc/apache2/conf-available/mod_tile.conf
```

Now add this single line to that file, save, and exit:
```
LoadModule tile_module /usr/lib/apache2/modules/mod_tile.so
```

Now enable this module:
```
sudo a2enconf mod_tile
```


### Restart Apache

Finally, restart apache services:
```
sudo systemctl restart apache
```




