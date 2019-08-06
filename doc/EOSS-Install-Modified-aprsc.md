# Installing the EOSS-modified aprsc

Notes by Jeff N2XGL,
Version 1.0, Dated 2019-08-05

## Installing the modified EOSS aprsc software from source

The EOSS SDR Tracker software uses an APRS-IS server written in C:
[aprsc](http://he.fi/aprsc/).  This local server running on the tracker
computer establishes an uplink/downlink to APRS-IS for exchanging APRS packets
via the Internet (if available).  The full global feed from APRS-IS consumes
a fair amount of bandwidth and places an unwelcome load on the APRS-IS backbone
servers, many of which are maintained by volunteers who have to pay for
that bandwidth.

Beginning with the EOSS SDR Tracker software v1.2, a slightly modified version
of `aprsc` is provided which enables server-side filters on the uplink/downlink.
The overall bandwidth is significantly reduced (to ~1%) by limiting
the full feed down to a ~400 km region of interest around the balloon flights.
Additional filters are configurable should there be any need to collect APRS
packets outside of the 400 km geographic region.

For users on the github branches (i.e. not on the EOSS PPA repository),
the modified `aprsc` needs to be downloaded, compiled and installed prior to
installing `eosstracker` v1.2 and above.  The instructions to do so are
provided below.

> These instructions assume you already have a running EOSS SDR tracker
> installation. These steps will overwrite your original `aprsc` installation.  

Begin by shutting down the `eosstracker` software if it is running.  Click the
"Stop" button on the Home page.  Next log in to the tracker computer and
make a source directory (if it does not exist).  Download the EOSS-modified
version of `aprsc`:

```
eosstracker@tracker:~$ mkdir -p src
eosstracker@tracker:~$ cd ~/src
eosstracker@tracker:~/src$ git clone https://github.com/edgeofspace/aprsc.git

Cloning into 'aprsc'...
remote: Enumerating objects: 26, done.
remote: Counting objects: 100% (26/26), done.
remote: Compressing objects: 100% (23/23), done.
remote: Total 9692 (delta 5), reused 10 (delta 3), pack-reused 9666
Receiving objects: 100% (9692/9692), 5.65 MiB | 1.16 MiB/s, done.
Resolving deltas: 100% (5167/5167), done.
```
Change to the `src` directory within the newly created `aprsc` directory and
configure the Makefile.
```
eosstracker@tracker:~/src$ cd aprsc/src
eosstracker@tracker:~/src/aprsc/src$ ./configure

     [... lines deleted ...]
configure: creating ./config.status
config.status: creating Makefile
config.status: creating ac-hdrs.h
```
Now compile the modified `aprsc` into the binary applications by running `make`.
```
eosstracker@tracker:~/src/aprsc/src$ make

     [... lines deleted ...]
perl -ne "s{\@DATEVERSION\@}{2.1.4-g80f1dea - 2019 August 06}g; \
          s{\@VARRUN\@}{/opt/aprsc/logs}g;                      \
          s{\@VARLOG\@}{/opt/aprsc/logs}g;                      \
          s{\@CFGFILE\@}{/opt/aprsc/etc/aprsc.conf}g;                   \
          print;"                                       \
< aprsc.8.in > aprsc.8
```
Finally, install the binaries into their proper locations, overwriting the
old versions.  Run the command `make install` as the superuser.
```
eosstracker@tracker:~/src/aprsc/src$ sudo make install
[sudo] password for eosstracker:

    [... lines deleted ...]
if [ ! -f  /opt/aprsc/etc/aprsc.conf ] ; then \
        ./install-sh  -m 644 aprsc.conf /opt/aprsc/etc/aprsc.conf ; \
else true ; fi
```
The new modified version of `aprsc` is now installed.  You can pull the latest
branch of the `eosstracker` software, refresh your browser window, and
start up the processes by clicking on the "Start" button on the Home page.
