# EOSS SDR Tracker Bare Metal Install - Section 1

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

This application note is written in XXX parts in two sections:

### Section 1
1. [Install the baseline Operating System](#1-install-the-baseline-operating-system)
2. Configure the EOSS PPA and user environment
3. Install necessary packages
4. Configure the firewall
5. Install aprsc
6. Create PostgreSQL/PostGIS databases with PostGIS extensions

### Section 2
7. Install OpenStreetMap tile server
8. x
9. Configure Apache for SSL (optional)
10. Configure Apache mod_tile
11. 


## 1. Install the baseline Operating System

EOSS uses [Ubuntu](https://www.ubuntu.com/download/server) 18.04 Server
LTS as the baseline operating system.  This is a stable, long-term support
operating system that works well on most modern hardware.  

Begin by installing a fresh copy of Ubuntu 18.04 LTS on to your hardware.
There are many tutorials on how to do this.  As part of the process, you
should establish a user with root privileges, and use this user to
complete most of the remaining steps.  You may also want to configure
the machine hostname and any networking at this point.  The computer
does need a connection to the Internet to download packages.

## 2. Configure the EOSS PPA and user environment

The EOSS SDR Tracker software is designed to operate under the `eosstracker` 
user with some elevated privileges.  You don't necessarily have to run under
this user, but connections to the database assume this username.  You don't
have to give this user full sudo privileges, but it makes it easier overall
and will match these instructions.

Log in as root and add the [EOSS Personal Package Archive](https://launchpad.net/~eoss).
This will allow for easy updates of the `eosstracker` software as they are
released.

`root@tracker:~# add-apt-repository ppa:eoss/ppa`

You will get some output similar to:
```
Edge of Space Sciences (EOSS) https://www.eoss.org/ software package repository.
More info: https://launchpad.net/~eoss/+archive/ubuntu/ppa
Press [ENTER] to continue or Ctrl-c to cancel adding it.
Hit:1 http://archive.ubuntu.com/ubuntu bionic InRelease
Get:2 http://archive.ubuntu.com/ubuntu bionic-updates InRelease [88.7 kB]
Get:3 http://archive.ubuntu.com/ubuntu bionic-backports InRelease [74.6 kB]
Get:4 http://archive.ubuntu.com/ubuntu bionic-security InRelease [88.7 kB]
Get:5 http://archive.ubuntu.com/ubuntu bionic-updates/main amd64 Packages [523 kB]
Get:6 http://archive.ubuntu.com/ubuntu bionic-updates/universe amd64 Packages [727 kB]
Get:7 http://ppa.launchpad.net/eoss/ppa/ubuntu bionic InRelease [15.9 kB]
Get:8 http://ppa.launchpad.net/eoss/ppa/ubuntu bionic/main amd64 Packages [484 B]
Get:9 http://ppa.launchpad.net/eoss/ppa/ubuntu bionic/main Translation-en [316 B]
Fetched 1,518 kB in 11s (138 kB/s)
Reading package lists... Done
```

Continuing as root, create the `eosstracker` user and configure with sudo
privileges:

`root@tracker:~# useradd -c "EOSS Tracker" -m eosstracker`

Update the password for the `eosstracker` user:

```
root@tracker:~# passwd eosstracker
Enter new UNIX password:
Retype new UNIX password:
passwd: password updated successfully
root@tracker:~#
``` 

Give the `eosstracker` user root user privileges for sudo:

`root@tracker:~# usermod -aG sudo eosstracker`

Next we will create the directory for the EOSS Tracker software.

> By default, the EOSS SDR Tracker software lives at the root level in the
> `/eosstracker` directory.  This was done so to it is straightforward to 
> have a separate partition.  With the full database and map tiles in this
> directory, it is upwards of 250 Gigabytes!

Make a directory for the tracker software and change ownership to `eosstracker`.

```
root@tracker:~# mkdir /eossstracker
root@tracker:~# chown -R eosstracker:eosstracker /eosstracker
root@tracker:~#
```

Finally, add some commands to the sudoers file so that `eosstracker` does not
require a password to execute:

`root@tracker:~# visudo`

This will bring up a text editor for the sudoers file.  Add the following to
the bottom of the file:

```
#### These are for the eosstracker and www-data web user
eosstracker ALL=(ALL) NOPASSWD: /opt/aprsc/sbin/aprsc, /usr/bin/pkill
www-data ALL=(eosstracker) NOPASSWD: /eosstracker/bin/start_session.bash, /eosstracker/bin/killsession_wrapper.bash
```

Type Ctrl-X to exit and 'Y' to save.

At this point, you can perform most of the following steps as the `eosstracker`
user.  Switch to the `eosstracker` user:

```
root@tracker:~# su - eosstracker
eosstracker@tracker:~$
```

Next, clone the latest EOSS SDR Tracker software from GitHub into any directory.  
For this tutorial, we will make a new directory `src` within the `eosstracker`
home directory.  Several of the tools, packages and scripts and will be 
built and used from this directory later in the tutorial.

```
eosstracker@tracker:~$ mkdir src
eosstracker@tracker:~$ cd src
eosstracker@tracker:~/src$ git clone https://github.com/TheKoola/eosstracker.git
Cloning into 'eosstracker'...
remote: Enumerating objects: 98, done.
remote: Counting objects: 100% (98/98), done.
remote: Compressing objects: 100% (97/97), done.
remote: Total 4687 (delta 58), reused 0 (delta 0), pack-reused 4589
Receiving objects: 100% (4687/4687), 19.03 MiB | 35.83 MiB/s, done.
Resolving deltas: 100% (624/624), done.
eosstracker@tracker:~/src$ cd eosstracker
eosstracker@tracker:~/src/eosstracker$
```

## 3. Install necessary packages

The EOSS SDR Tracker software combines several applications running on the
tracker computer.  Hundreds of prerequisite software packages must be
downloaded and installed.  Fortunately, a simple script is included to
automatically install all the required packages.
```
eosstracker@tracker:~$ cd ~/src/eosstracker/sbin
eosstracker@tracker:~/src/eosstracker/sbin$ sudo ./install-packages.bash

  [... many lines deleted here ...]

All packages installed successfully.
eosstracker@tracker:~/src/eosstracker/sbin$
```

To transfer the contents of the EOSS tracker software to the `/eosstracker`
directory, as well as set up permissions, enter the following command
from the same directory:

`eosstracker@tracker:~/src/eosstracker/sbin$ sudo ./initial-stage.bash`

This script will also configure the `/eosstracker` directory with GitHub
and put the `eosstracker` user into the audio and dialout groups.

## 4. Configure the firewall

To configure and enable the firewall, enter the following commands:

```
eosstracker@tracker:~$ sudo ufw app list
Available applications:
  Apache
  Apache Full
  Apache Secure
  OpenSSH
eosstracker@tracker:~$ sudo ufw allow 'OpenSSH'
eosstracker@tracker:~$ sudo ufw allow 'Apache Full'
eosstracker@tracker:~$ sudo ufw allow 14501
eosstracker@tracker:~$ sudo ufw enable
Command may disrupt existing ssh connections. Proceed with operation (y|n)? y
Firewall is active and enabled on system startup
eosstracker@tracker:~$ sudo ufw status
Status: active

To                         Action      From
--                         ------      ----
OpenSSH                    ALLOW       Anywhere
Apache Full                ALLOW       Anywhere
14501                      ALLOW       Anywhere
OpenSSH (v6)               ALLOW       Anywhere (v6)
Apache Full (v6)           ALLOW       Anywhere (v6)
14501 (v6)                 ALLOW       Anywhere (v6)

eosstracker@tracker:~$
```

Afterwards, it is useful to reboot the machine to makes sure all the
updated libraries and modules are loaded.

`eosstracker@tracker:~$ sudo reboot`

## 5. Install aprsc

The EOSS SDR Tracker software uses a local APRS-IS server written in C: 
[aprsc](http://he.fi/aprsc/).  As of the time of this writing, a pre-compiled
package for aprsc was not available on Ubuntu 18.04, so we will build and
install the application from source.  Start with [libevent](http://libevent.org/):

```
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ wget https://github.com/libevent/libevent/releases/download/release-2.1.8-stable/libevent-2.1.8-stable.tar.gz
eosstracker@tracker:~/src$ tar xzvf libevent-2.1.8-stable.tar.gz
eosstracker@tracker:~/src$ cd libevent-2.1.8-stable/
eosstracker@tracker:~/src/libevent-2.1.8-stable$ ./configure
eosstracker@tracker:~/src/libevent-2.1.8-stable$ make
eosstracker@tracker:~/src/libevent-2.1.8-stable$ sudo make install
```

Next, add the aprsc user:

`sudo adduser --system --no-create-home --home /var/run/aprsc --shell /usr/sbin/nologin --group aprsc`

Download, build and install aprsc:

```
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ wget http://he.fi/aprsc/down/aprsc-latest.tar.gz
eosstracker@tracker:~/src$ tar xvzf aprsc-latest.tar.gz
eosstracker@tracker:~/src$ cd aprsc-2.1.4.g408ed49
eosstracker@tracker:~/src/aprsc-2.1.4.g408ed49$ ./configure
eosstracker@tracker:~/src/aprsc-2.1.4.g408ed49$ make
eosstracker@tracker:~/src/aprsc-2.1.4.g408ed49$ sudo make install
```

There are a few files that must be copied into arpsc's chroot environment
in order for aprsc to run properly with `eosstracker`:

```
sudo cp /etc/hosts /etc/nsswitch.conf /etc/resolv.conf /opt/aprsc/etc/
sudo chown -R aprsc:aprsc /opt/aprsc
sudo chgrp -R eosstracker /opt/aprsc/etc
sudo chmod -R g+w /opt/aprsc/etc
```

## 6. Create PostgreSQL/PostGIS databases with PostGIS extensions

The EOSS tracker software uses PostgreSQL databases for both the
OpenStreetMap object database and the aprs balloon data.  The
databases must be set up and given the appropriate schema.  

Start by setting the default timezone for the database.  The
EOSS tracker software assumes the US Mountain time zone.  While the
web-based user interface will allow for the user to set any time
zone to display the data, the data itself is stored consistently
in the database with date/time stamps in the US Mountain time zone.

First set the system time zone:

`sudo timedatectl set-timezone America/Denver`

Next, edit the PostgreSQL configuration file located at 
`/etc/postgresql/10/main/postgresql.conf` to set the default time zone.
Find and change the following lines (around lines 475 and 571) to match
the following:

```
log_timezone = 'America/Denver'

timezone = 'America/Denver'
```

Finally, restart the PostgreSQL service to force the changes to
take effect:

`sudo service postgresql restart`

Now begin setting up the databases by switching to the `postgres` 
master database user:

```
eosstracker@tracker:~$ sudo -u postgres -i
postgres@tracker:~$ creatuser eosstracker
postgres@tracker:~$ psql
psql (10.6 (Ubuntu 10.6-0ubuntu0.18.04.1))
Type "help" for help.

postgres=#
```

To set the `eosstracker` database password within PostgreSQL,
enter the following.  Don't forget the semicolon at the end:

```
postgres=# alter user eosstracker with encrypted password 'Thisisthedatabasepassword!';
ALTER ROLE
postgres=# \q
```

That is the actual password to use (don't change it unless you
know what you are doing).  The tracker software will use this
database password to access the database.

Next, create the GIS database for use with the map:

```
postgres@tracker:~$ createdb -E UTF8 -O eosstracker gis
postgres@tracker:~$ psql -d gis
psql (10.6 (Ubuntu 10.6-0ubuntu0.18.04.1))
Type "help" for help.

gis=# CREATE EXTENSION postgis;
CREATE EXTENSION
gis=# CREATE EXTENSION hstore;
CREATE EXTENSION
gis=# ALTER TABLE geometry_columns OWNER to eosstracker;
ALTER TABLE
gis=# ALTER TABLE spatial_ref_sys OWNER to eosstracker;
ALTER TABLE
gis=# \q
```

Also, create the aprs database used by `eosstracker`:

```
postgres@tracker:~$ createdb aprs -O eosstracker
postgres@tracker:~$ psql -d aprs
psql (10.6 (Ubuntu 10.6-0ubuntu0.18.04.1))
Type "help" for help.

aprs=# create extension postgis;
CREATE EXTENSION
aprs=# \q
```

Exit the PostgreSQL user and enter the aprs database.  Next,
we will import the database schema tables for use with `eosstracker`:

```
postgres@tracker:~$ exit
eosstracker@tracker:~$ cd /eosstracker/sql
eosstracker@tracker:/eosstracker/sql$ psql -d aprs
psql (10.6 (Ubuntu 10.6-0ubuntu0.18.04.1))
Type "help" for help.

aprs=> \i ./aprs-database.v2.sql
 ...
 ...
CREATE TABLE
aprs=> \d
                 List of relations
 Schema |        Name        | Type  |    Owner
--------+--------------------+-------+-------------
 public | flightmap          | table | eosstracker
 public | flights            | table | eosstracker
 public | freqs              | table | eosstracker
 public | geography_columns  | view  | postgres
 public | geometry_columns   | view  | postgres
 public | gpsposition        | table | eosstracker
 public | landingpredictions | table | eosstracker
 public | launchsites        | table | eosstracker
 public | packets            | table | eosstracker
 public | packettypes        | table | eosstracker
 public | predictiondata     | table | eosstracker
 public | raster_columns     | view  | postgres
 public | raster_overviews   | view  | postgres
 public | spatial_ref_sys    | table | postgres
 public | symbols            | table | eosstracker
 public | teams              | table | eosstracker
 public | trackers           | table | eosstracker
(17 rows)
aprs=> \i eoss_specifics.sql
 ...
 ...
CREATE TABLE
aprs=> \q
eosstracker@tracker:/eosstracker/sql$
```

The default locating PostgreSQL stores its databases is
`/var/lib/postgresql/10/main` which may be on a partition
that limited in size. The EOSS installation moves the database to
`/eosstracker/db` which is a separate partition. 
The folks at Digital Ocean provide a nice
[tutorial](https://www.digitalocean.com/community/tutorials/how-to-move-a-postgresql-data-directory-to-a-new-location-on-ubuntu-18-04)
on how to move the PostgreSQL database.


chown -R postgres:postgres /eosstracker/db/

