EOSS Brick Build Notes - Ubuntu 22

Last update:  03/21/2023

Install the base OS

Start with a clean install of Ubuntu 22.04 Server LTS.  During the installation it will ask for a username/password as well as a "computer name" or hostname.  Use the following:

User Name:  EOSS Tracker

Computer name:  eosstracker

username:  eosstracker

Password:  <insert standard password>

Update software

Log in as the "eosstracker" user created during the install, then run these commands:

sudo apt update

sudo apt upgrade

sudo reboot

Networking Configuration

Install/remove packages

First we need to install network manager.

sudo apt install network-manager

Now also remove the modemmanager (it used to mess up GPSD)

sudo apt remove --purge modemmanager

Edit the netplan file to point to NetworkManager

Edit the /etc/netplan/00-installer-config.yaml file such that it only contains these lines:  

network:

  version: 2

  renderer: NetworkManager

Then stop all services that are using networkd:

sudo systemctl | grep networkd

Now mask all of those services so they don't start by using a command like this:

sudo systemctl mask <service>

Now have netplan configure NetworkManager by running these commands:

sudo netplan apply

sudo netplan generate

You should now have a functioning NetworkManager environment:

# sudo nmcli c show

NAME                UUID                                  TYPE      DEVICE 

Wired connection 1  fb1b7644-c634-3452-9ea8-1e5e6fc166c6  ethernet  --     

Wired connection 2  bcb06b9a-9be7-353b-b3d3-7424c2065ead  ethernet  --

Add in your home Wi-Fi (if applicable)

sudo nmcli c add type wifi con-name Home-wifi ifname wlp2s0 ssid 'myssid'

sudo nmcli c modify Home-wifi wifi-sec.key-mgmt wpa-psk wifi-sec.psk 'xxxxxxxx'

sudo nmcli c modify Home-wifi connection.autoconnect true connection.autoconnect-priority 40

nmcli c show

You can try to reboot to verify that everything is working:

sudo reboot

Add in the hotspot wifi configuration

nmcli connection add type wifi ifname wlp2s0 con-name Hotspot autoconnect yes ssid EOSS-11 mode ap

nmcli connection modify Hotspot 802-11-wireless.mode ap 802-11-wireless-security.key-mgmt wpa-psk ipv4.method shared 802-11-wireless-security.psk 'HAB2Space!'

sudo nmcli c modify Hotspot connection.autoconnect true connection.autoconnect-priority 20

Edit /etc/resolv.conf

Edit the file:

sudo vi /etc/resolv.conf

Then change the "search" line at the bottom to look like:

search local

Dnsmasq configuration

Create a new file in /etc that contains an entry for eosstracker.local using the IP address that NetworkManager+dnsmasq uses when in hotspot mode.

An additional hosts file

Edit this file

sudo vi /etc/hosts.dnsmasq

Place these lines therein and save:

10.42.0.1  eosstracker.local  eosstracker

NetworkManager dnsmasq conf file

Now edit this file:

sudo vi /etc/NetworkManager/dnsmasq-shared.d/eoss.conf

Place these lines therein and save:

interface=wlp2s0

addn-hosts=/etc/hosts.dnsmasq

domain=local

dhcp-option=option:ntp-server,10.42.0.1

Reboot to test

You'll likely need to reboot to test all of this:

sudo reboot

Continued Configuration

Convenience Stuff

Add this to the eosstracker's ~/.vimrc file:

filetype plugin indent on

syntax on

set tabstop=4

set shiftwidth=4

set expandtab

if has("autocmd")

  au BufReadPost * if line("'\"") > 0 && line("'\"") <= line("$") | exe "normal! g`\"" | endif

endif

Add this to the end of the eosstracker's ~/.bashrc file:

### Postgresql default database

export PGDATABASE=aprs

set -o vi

Create the ~/.bash_aliases file with the following contents:

alias p='ps -ef | egrep "direwolf|aprsc|gpsd|killsession|kill_session|habtracker-daemon|gpswss" | grep -v grep'

alias r='cat /eosstracker/sql/shortlist.sql | psql -d aprs'

alias blank='echo "update teams set flightid=NULL;" | psql -d aprs'

Clone the eosstracker repo to /tmp, install packages, and setup /eosstracker

First we need to clone the eosstracker repo to /tmp so we can get the list of packages to install (i.e. to support build steps further down).

cd /tmp

git clone <https://www.github.com/thekoola/eosstracker>

cd /tmp/eosstracker

git pull

git checkout brickv2

Switch to the sbin directory and run the installation script to get the vast majority of packages installed.

cd /tmp/eosstracker/sbin

sudo ./install-packages.sh

Now run the setupnewhome.bash script to create the /eosstracker directory and clone the eosstracker GitHub repo to it.

cd /tmp/eosstracker

sudo ./setupnewhome.bash

Setup the Database

Switch to the Postgres user:

sudo su - postgres

Create the eosstracker database user and update the password:

postgres@eosstracker:~$ createuser eosstracker

postgres@eosstracker:~$ psql

psql (14.5 (Ubuntu 14.5-0ubuntu0.22.04.1))

Type "help" for help.

postgres=# alter user eosstracker with encrypted password 'Thisisthedatabasepassword!';

ALTER ROLE

postgres=#

Create a new database:

createdb aprs -O eosstracker

echo "create extension postgis;" | psql -d aprs

>>> Log off as the postgres user.

Create The Database Schema

As the eosstracker user, create the database schema for the aprs database.

cd /eosstracker/sql

psql -d aprs -f ./aprs-database.v2.sql 

psql -d aprs -f ./eoss_specifics.sql

Update sudo

Edit the /etc/sudoers file by running the "visudo" command.  Paste in the following lines at the end of that file, then press CTRL-X and answer 'y' to save changes:

sudo visudo

--------- paste in these following three lines (but not this one) ----------

#### These are for the eosstracker and www-data web user

eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /usr/bin/pkill

www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash

---------------------- end of paste.  do not paste in this line -------------------

Switch Apache to use SSL:

Apache needs to be configured to use SSL and to redirect all non-encrypted traffic (ex. http://...) to the SSL equivalent page (ex. Https://...)

sudo a2enmod ssl

sudo a2enmod rewrite

sudo systemctl restart apache2

Now enable the SSL virtual host:

sudo a2ensite default-ssl

sudo systemctl restart apache2

Now edit the /etc/apache2/sites-enabled/000-default.conf file to add a "redirect" statement that will cause apache to redirect unencrypted traffic to the encrypted virtual host (i.e. the default-ssl.conf file).

sudo vi /etc/apache2/sites-enabled/000-default.conf

After the "ServerAdmin..." line, paste in the following 4 lines and save your changes:

### this is so unencrypted web connections are redirected to the SSL URL

RewriteEngine On

RewriteCond %{HTTPS} off

RewriteRule (.*) https://%{SERVER_NAME}/$1 [R,L]

While still editing that file, change the DocumentRoot to the following.  Then save your changes and exit the vi editor.

DocumentRoot /eosstracker/www

Now edit the SSL apache file and change the DocumentRoot to the following:

sudo vi /etc/apache2/sites-enabled/default-ssl.conf

...change the DocumentRoot to be the following:

DocumentRoot /eosstracker/www

Once finished with edits, restart apache one last time:

sudo systemctl restart apache2

Update Apache Configuration

The /etc/apache2/apache2.conf file needs to be updated to add the following lines:

<Directory /eosstracker/www/>

    Options Indexes FollowSymLinks

    AllowOverride None

    Require all granted

</Directory>

Run this to edit the file:

sudo vi /etc/apache2/apache2.conf

Once finished adding the lines above, restart apache2:

sudo systemctl restart apache2

Update GPS

One will need to update the /etc/default/gpsd configuration file so that this line contains the "-n -G" options:

GPSD_OPTIONS="-n -G"

Modify the /lib/systemd/system/gpsd.socket service to allow connections to GPSD from systems external to the local system:

[Unit]

Description=GPS (Global Positioning System) Daemon Sockets

[Socket]

ListenStream=/run/gpsd.sock

ListenStream=[::1]:2947

#ListenStream=127.0.0.1:2947

# To allow gpsd remote access, start gpsd with the -G option and

# uncomment the next two lines:

# ListenStream=[::]:2947

ListenStream=0.0.0.0:2947

SocketMode=0600

BindIPv6Only=yes

[Install]

WantedBy=sockets.target

Then restart the services:

sudo systemctl daemon-reload

sudo systemctl restart gpsd.service

sudo systemctl restart gpsd.socket

One should then be able to run the "cgps" command to observe the daemon obtain a position fix from satellites.

cgps

Verification of GPS

Then check that GPSD is communicating with the GPS puck.  You should see in the upper left hand box the status of the GPS as either "NO FIX" or hopefully "3D FIX".  In the top, righthand box there should be a list of satellites listed.  The point being if you see data flying by, things are working.

Run this command to check the GPS:

cgps

Here is an example screen shot:

![Screen Shot 2019-01-28 at 11.38.41 AM.png](blob:https://linux.local/83086a62-3297-405f-ad62-289ac7dcde2a)

Timezones

Set the Timezone for the OS and the database:

sudo timedatectl set-timezone America/Denver

Edit the /etc/postgresql/14/main/postgresql.conf file and update these two lines with the correct Timezone (ex. 'America/Denver'):

sudo su - postgres

vi /etc/postgresql/14/main/postgresql.conf

Change these two lines to correctly specify the default timezone for postgresql:

log_timezone = 'America/Denver'

timezone = 'America/Denver'

Save your changes to the postgresql.conf file, then log off as the Postgres user:

>>> Log off as the postgres user.

Now restart the database for these changes to take effect:

sudo systemctl restart postgresql

Firewall

Update the firewall configuration:

sudo ufw status

Run these commands to update the firewall configuration (port 67 is for DHCP when in hotspot mode):

sudo ufw allow Apache

sudo ufw allow "Apache Secure"

sudo ufw allow OpenSSH

sudo ufw allow 14501

sudo ufw allow 14580

sudo ufw allow gpsd

sudo ufw allow 53

sudo ufw allow 67

Now enable the firewall

sudo ufw enable

sudo ufw reload

sudo ufw status

Time Server Configuration

Edit the time configuration configuration file:

sudo vi /etc/chrony/chrony.conf

Add these lines at the bottom of the file:

# set larger delay to allow the NMEA source to overlap with

# the other sources and avoid the falseticker status

refclock SHM 0 refid GPS precision 1e-1 offset 0.9999 delay 0.2

refclock SHM 1 refid PPS precision 1e-9

# Allow access from NTP clients

allow

Now reboot the system for the chrony changes to take effect:

sudo reboot

Verification of Time

Now check that chrony (the time service on Ubuntu) is connecting to the GPS.  Using the following command should list all of the time sources (GPS included) that chrony has contacted to evaluate as a potential time sync source:

chronyc sources

An example of a system that is connect to the internet.  Notice the "GPS" line and that in the far right column there is an offset value "200ms".  You should see some non-zero number there.

210 Number of sources = 10

MS Name/IP address         Stratum Poll Reach LastRx Last sample               

===============================================================================

#? GPS                           0   4     1    15    +43ms[  +43ms] +/-  200ms

#? PPS                           0   4     0     -     +0ns[   +0ns] +/-    0ns

^+ alphyn.canonical.com          2   6    17    14  -2746us[-1023us] +/-   83ms

^- golem.canonical.com           2   6    17    12  -5068us[-5068us] +/-   95ms

^- pugot.canonical.com           2   6    17    13  -4846us[-4846us] +/-   87ms

^- chilipepper.canonical.com     2   6    17    13  -5460us[-5460us] +/-   97ms

^+ lithium.constant.com          2   6    17    14  -3792us[-2069us] +/-   75ms

^- ec2-34-198-67-116.comput>     3   6    17    13  -5748us[-5748us] +/-  103ms

^* i.will.not.be.extorted.o>     2   6    17    14  +7708us[+9431us] +/-   42ms

^+ fry.gwi.net                   2   6    17    15  -7847us[  -48ms] +/-   76ms

Secondly one can run this command that shows time data coming from the GPS assuming the GPS has a FIX on some satellites.  One has to be root to run this command:

sudo ntpshmmon -n 5

Example output:

ntpshmmon version 1

#      Name Seen@                Clock                Real                 L Prec

sample NTP0 1548699816.644704781 1548699816.643714859 1548699815.640000104 0 -20

sample NTP0 1548699820.717288106 1548699820.716170449 1548699819.640000104 0 -20

sample NTP0 1548699821.088285007 1548699821.087243473 1548699819.740000009 0 -20

sample NTP0 1548699821.351885356 1548699821.350920519 1548699819.840000152 0 -20

sample NTP0 1548699822.192025998 1548699822.191887564 1548699820.840000152 0 -20

Creating rc.local

Edit or create the /etc/rc.local file and place the following contents therein.  

sudo vi /etc/rc.local

============= rc.local contents (don't paste in this line) ===========

#!/bin/bash

#

# Added by JTS and JED on 2019-01-28

# Updated by JTS on 2019-09-07

# Autogenerated by EOSS to set up aprsc >= 2.1.5 chroot environment

#

BASEDIR=/opt/aprsc

DIRNAME=aprsc

# Fixing network on boot

#nmcli con up Hotspot

# Grab the hotspot SSID and put that into the WWW home directory for display on the main web page

if [ -f /etc/NetworkManager/system-connections/Hotspot ]; then

    awk -F"=" '/^ssid=/ {print $2;}' /etc/NetworkManager/system-connections/Hotspot > /eosstracker/www/nodeid.txt

    chmod 444 /eosstracker/www/nodeid.txt

else

    rm -f /eosstracker/www/nodeid.txt

fi

# Check and add necessary directories and mount points for aprsc >= 2.1.5

if [ ! -d $BASEDIR/etc ]; then

        /bin/mkdir -p -m 755 $BASEDIR/etc

fi

if [ ! -d $BASEDIR/dev ]; then

        /bin/mkdir -p -m 755 $BASEDIR/dev

fi

if [ ! -d $BASEDIR/lib ]; then

        /bin/mkdir -p -m 755 $BASEDIR/lib

fi

if [ ! -d $BASEDIR/lib64 ]; then

        /bin/mkdir -p -m 755 $BASEDIR/lib64

fi

if [ ! -d $BASEDIR/usr/lib ]; then

        /bin/mkdir -p -m 755 $BASEDIR/usr/lib

fi

if [ ! -d $BASEDIR/usr/lib64 ]; then

        /bin/mkdir -p -m 755 $BASEDIR/usr/lib64

fi

# Copy files and special devices for aprsc >= 2.1.5 chroot environment

if [ ! -e $BASEDIR/etc/gai.conf ]; then

        /bin/cp -p /etc/resolv.conf /etc/nsswitch.conf /etc/hosts /etc/gai.conf $BASEDIR/etc/

fi

if [ ! -e $BASEDIR/dev/random ]; then

        /bin/cp -pa /dev/urandom /dev/random /dev/null /dev/zero $BASEDIR/dev/

fi

# Mount libraries read-only for aprsc >= 2.1.5 chroot environment

grep -q "$DIRNAME/lib " /proc/mounts || ( mount --bind /lib $BASEDIR/lib && mount -o remount,ro,bind $BASEDIR/lib )

if [ -e /lib64 ]; then

        grep -q "$DIRNAME/lib64 " /proc/mounts || ( mount --bind /lib64 $BASEDIR/lib64 && mount -o remount,ro,bind $BASEDIR/lib64 )

fi

grep -q "$DIRNAME/usr/lib " /proc/mounts || ( mount --bind /usr/lib $BASEDIR/usr/lib && mount -o remount,ro,bind $BASEDIR/usr/lib )

if [ -e /usr/lib64 ]; then

        grep -q "$DIRNAME/usr/lib64 " /proc/mounts || ( mount --bind /usr/lib64 $BASEDIR/usr/lib64 && mount -o remount,ro,bind $BASEDIR/usr/lib64 )

fi

exit 0

================ end of rc.local contents (don't paste in this line) ==============

After editing this file, change the permissions on it and reboot to test.

sudo chmod 755 /etc/rc.local

sudo reboot

Once the system comes back online, check that the following directory structure exists:

eosstracker@eosstracker:~$ ls -l /opt/aprsc

total 20

drwxr-xr-x   2 root root 4096 Nov 19 18:53 dev

drwxr-xr-x   2 root root 4096 Nov 19 18:53 etc

drwxr-xr-x 103 root root 4096 Nov 19 18:14 lib

drwxr-xr-x   2 root root 4096 Nov 19 18:53 lib64

drwxr-xr-x   4 root root 4096 Nov 19 18:53 usr

eosstracker@eosstracker:~$

Building direwolf 

For direwolf, this will need to be built from source and installed (from here:  <https://github.com/wb2osz/direwolf>).  This is using the "dev" branch - I've not tested this with the production branch, 'master', yet.

cd ~

git clone https://www.github.com/wb2osz/direwolf

cd direwolf

Edit direwolf.h

Now edit the ./src/direwolf.h file so that the number of audio devices is 8 instead of 3 (line ):

Change this:

    #define MAX_ADEVS 3

To this:

    #define MAX_ADEVS 8

Edit rrbb.c

Now edit the ./src/rrbb.c file so that the number of memory buffers used for checking leaks is higher (line 100):

Change this:

        if (new_count > delete_count + 100) {

To this:

        if (new_count > delete_count + 500) {

Edit fsk_demod_state.h

Now edit the ./src/fsk_demod_state.c file so that the number of memory buffers used for checking leaks is higher (line 100):

Change this:

#define MAX_FILTER_SIZE 320

To this:

#define MAX_FILTER_SIZE   500

Compiling

Now build direwolf and install it.

cd ~/direwolf

mkdir build && cd build

cmake ..

make -j4

sudo make install

Building aprsc

For aprsc, this will need to be built from source and installed (from here:  <https://github.com/hessu/aprsc>).  Reference this document for build instructions, if needed:  <http://he.fi/aprsc/BUILDING.html>.

NOTE:  If you haven't already created the /etc/rc.local file and rebooted the system, then do that first before proceeding with the build of aprsc.

This will build the EOSS fork of aprsc that includes ability to filter upstream connections to APRS-IS servers that reduces bandwidth requirements.

cd ~

sudo adduser --system --no-create-home --home /var/run/aprsc --shell /usr/sbin/nologin --group aprsc

git clone https://github.com/edgeofspace/aprsc.git

cd aprsc/src

./configure --prefix /opt/aprsc

make

sudo make install

Now adjust the permissions on the /opt/aprc/etc directory so the eosstracker user can place configuration files therein:

sudo chmod 774 /opt/aprsc/etc

sudo chown aprsc:eosstracker /opt/aprsc/etc

And finally fix up the ownership on the files under /opt/aprsc

sudo chown aprsc:aprsc /opt/aprsc/logs /opt/aprsc/web /opt/aprsc/sbin /opt/aprsc/data

Building Dump1090-fa

<TBD>

The existing dump1090-fa repo under Edgeofspace on GitHub needs to be brought up to current levels of the main dump1090-fa repo.  There seem to be a lot of changes/fixes/feature updates since we created the 'eoss' branch.  Likely means reapplying those brick specific changes to the latest code in the 'master' branch.

Fixing Airspy Udev Rules

In the odd chance that the airspy rules are not installed, you'll need to create a file under /etc/udev/rules.d/ so that any airspy SDR devices attached to the system are usable by non-root users.

Edit this file:

sudo vi /etc/udev/rules.d/52-airspy.rules

Then add this line to the file and save:

ATTR{idVendor}=="1d50", ATTR{idProduct}=="60a1", SYMLINK+="airspy-%k", MODE="660", GROUP="plugdev"

Make sure that the eosstracker user is a member of the "plugdev" group.  For example:

eosstracker@eosstracker:~$ id

uid=1000(eosstracker) gid=1000(eosstracker) groups=1000(eosstracker),4(adm),20(dialout),24(cdrom),27(sudo),29(audio),30(dip),46(plugdev),110(lxd)

If you have an airspy device, you can test things are working with this command after attaching the airspy sdr device to the system:

eosstracker@eosstracker:/etc/udev$ airspy_info

airspy_lib_version: 1.0.11

Found AirSpy board 1

Board ID Number: 0 (AIRSPY)

Firmware Version: AirSpy NOS v1.0.0-rc10-3-g7120e77 2018-04-28

Part ID Number: 0x6906002B 0x00000030

Serial Number: 0x910865C8254DB0C3

Supported sample rates:

        10.000000 MSPS

        2.500000 MSPS

Close board 1

Open Street Map Configuration (INCOMPLETE)

Initial Prerequisites

Install these packages (a number of them are likely already installed):

sudo apt install screen locate libapache2-mod-tile renderd git tar unzip wget bzip2 apache2 lua5.1 mapnik-utils python3-mapnik python3-psycopg2 python3-yaml gdal-bin npm fonts-noto-cjk fonts-noto-hinted fonts-noto-unhinted fonts-unifont fonts-hanazono postgresql postgresql-contrib postgis postgresql-14-postgis-3 postgresql-14-postgis-3-scripts osm2pgsql net-tools curl

Database Updates and Extensions

First create a new user for map rendering and create a database for OSM map data:

sudo su - postgres

createuser _renderd

created _E UTF8 -O _renderd gis

Now run psql (still as the Postgres user) and execute these SQL commands:

psql -d gis

CREATE EXTENSION postgis;

CREATE EXTENSION hstore;

ALTER TABLE geometry_columns OWNER TO _renderd;

ALTER TABLE spatial_ref_sys OWNER TO _renderd;

\q

exit

Download Stylesheet and Configure

Create a directory for saving/building some of the map configuration info and sources:

mkdir /eosstracker/maps

cd /eosstracker/maps

git clone <https://github.com/gravitystorm/openstreetmap-carto>

Now configure carto and create a mapnik stylesheet

cd openstreetmap-carto

sudo npm install -g carto

carto project.mml > mapnik.xml

Shapefile

Download the shapefile:

cd /eosstracker/maps/openstreetmap-carto

mkdir data

sudo chown _renderd data

sudo -u _renderd scripts/get-external-data.py

Install Fonts

cd /eosstracker/maps/openstreetmap-carto/

scripts/get-fonts.sh

Update the Renderd Apache Configuration

The "Directory" path within the /etc/apache2/conf-available/renderd.conf file needs to be updated to reflect the new tiles location.  

sudo vi /etc/apache2/conf-available/renderd.conf

At the top of the file, update the "<Directory ...>" line to be:

<Directory /eosstracker/maps/tiles>

Then modify the ModTileTileDir directive to reflect the same directory.  Change it to look like:

ModTileTileDir /eosstracker/maps/tiles

Save the file, then restart renderd and apache2:

sudo systemctl restart renderd

sudo systemctl restart apache2

Issues connecting to hotspot from brick

Issue has to do with the new wpasupplicant package 2.10 that comes with Ubuntu 22.  This needs to be downgraded to 2.9.

Follow this link for howto:

[](https://askubuntu.com/questions/1406149/cant-connect-to-ubuntu-22-04-hotspot)

<https://askubuntu.com/questions/1406149/cant-connect-to-ubuntu-22-04-hotspot>

Then the hotspot works as intended.

First you have to edit the /etc/apt/sources.list file:

sudo vi /etc/apt/sources.list

Then add these lines at the bottom:

deb http://old-releases.ubuntu.com/ubuntu/ impish main restricted universe multiverse

deb http://old-releases.ubuntu.com/ubuntu/ impish-updates main restricted universe multiverse

deb http://old-releases.ubuntu.com/ubuntu/ impish-security main restricted universe multiverse

Then you need to run (the brick will need to be on a network w/ Internet somewhere for this to work):

sudo apt update

Then install the downgraded wpasupplicant package:

sudo apt --allow-downgrades install wpasupplicant=2:2.9.0-21build1

Then mark the wpasupplicant package as something to "not upgrade":

sudo apt-mark hold wpasupplicant

The hotspot NetworkManager connection should then accept incoming join requests from other wireless devices.
