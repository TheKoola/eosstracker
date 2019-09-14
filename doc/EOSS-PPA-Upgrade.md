# EOSS SDR Tracker Personal Package Archive Upgrade

Notes by Jeff N2XGL,
Version 1.0, Dated 2019-09-01

### Background

The baseline Ubuntu Server 18.04.1 LTS "bionic" operating system used on the SDR
Tracker provides a convenient way for users to install and maintain software
packages. [Launchpad](https://launchpad.net/) is a open source suite of tools
that help people and teams to work together on software projects.  EOSS
hosts `eosstracker` package updates (and others) on launchpad at
[Launchpad/EOSS/PPA](https://launchpad.net/~eoss/+archive/ubuntu/ppa)
in a Personal Package Archive (PPA).

## Upgrading your SDR Tracker via the EOSS PPA

If you are configured for the EOSS PPA, the steps to apply any available
upgrades are simple:

1. [Connect your EOSS SDR tracker computer to the Internet and log in](#1-connect-to-internet-and-log-in)
2. [Update and upgrade the packages from the command line](#2-update-and-upgrade-packages)

That's it!  You should do this before each EOSS balloon launch if you can.

### Additional reading

There is some additional reading available below, if interested.

* [What's going on and what to expect](#whats-going-on-and-what-to-expect)
* [Check what versions and see if it worked](#check-and-see-if-it-worked)

If you are unsure whether or not you are connected to the EOSS PPA, follow these steps
to check.  Note, you do not have to be connected to the Internet to check, but
you do have to log into the tracker computer and access the command line.

* Optional:  [Check to see if EOSS PPA is installed](#optional-check-and-see-if-connected-to-eoss-ppa).

### 1. Connect to Internet and log in

Connecting your SDR tracker computer to the Internet can be accomplished
multiple ways, including 1) plugging an [Ethernet LAN cable](EOSS-SDR-Tracker-WiFi.md)
into either jack, or 2) connecting the computer
[via WiFi to a home network](EOSS-SDR-Tracker-WiFi.md), or 3) plugging a
[tethered cellphone hotspot](EOSS-SDR-USB-Cellphone-Tether.md) into a USB port on
the computer.  

To get to the command line, you can either directly connect a keyboard and
monitor to your tracker computer, or you can connect remotely over the network
using a terminal program (e.g. PuTTY).  Details for connecting to the command
line via a terminal application are covered in the above application notes.
Once you are connected and logged into the computer, you should see the
following prompt: `eosstracker@eosstracker:~$`

### 2. Update and upgrade packages

Once your SDR tracker computer has access to the Internet and you are
connected to the command line, you can upgrade all your packages with two
easy steps.  Issue the first command to update the catalog of all the packages:

`sudo apt update`

and then issue the command to upgrade any new packages that are now available:

`sudo apt -y upgrade`

The `-y` switch is to automatically respond "yes" to any prompts for additional
required packages. If you leave it out, you will be asked to confirm before
the installation takes place.

### What's going on and what to expect

When you run the `sudo apt update` command, you should see output similar to the following:
```
eosstracker@eosstracker:~$ sudo apt update
[sudo] password for eosstracker:
Hit:1 http://ppa.launchpad.net/eoss/ppa/ubuntu bionic InRelease
Hit:2 http://archive.ubuntu.com/ubuntu bionic InRelease
Hit:3 http://archive.ubuntu.com/ubuntu bionic-updates InRelease
Hit:4 http://archive.ubuntu.com/ubuntu bionic-backports InRelease
Hit:5 http://archive.ubuntu.com/ubuntu bionic-security InRelease
Reading package lists... Done
Building dependency tree
Reading state information... Done
34 packages can be upgraded. Run 'apt list --upgradable' to see them.
eosstracker@eosstracker:~$
```
The package manager has downloaded all the current lists of packages from the
repositories you have enabled on your computer.  In this example, the EOSS PPA
is the first one listed as `Hit:1`. The package manager reports that 34 packages
are available for upgrade.  If you would like to see which packages will be
upgraded, you can run the command `apt list --upgradable` and it will show you.

When you run the `sudo apt -y upgrade` command, you will see a lot of output
scroll by the screen.  The `apt` command places a progress bar at the bottom of
the screen so you can monitor the progress:

`Progress: [ 61%] [###########################################............................]`

The output will look similar to the following:
```
eosstracker@eosstracker:~$ sudo apt -y upgrade
Reading package lists... Done
Building dependency tree
Reading state information... Done
Calculating upgrade... Done
The following packages will be upgraded:
  bind9-host bsdutils dnsutils eosstracker fdisk libbind9-160 libblkid1 libdns-export1100
  libdns1100 libfdisk1 libirs160 libisc-export169 libisc169 libisccc160 libisccfg160
  liblwres160 libmount1 libnss-systemd libpam-systemd libsmartcols1 libsystemd0 libudev-dev
  libudev1 libuuid1 mount rfkill snapd systemd systemd-sysv udev util-linux uuid-dev
  uuid-runtime xkb-data
34 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.
Need to get 53.7 MB of archives.
After this operation, 1,015 kB of additional disk space will be used.
Get:1 http://ppa.launchpad.net/eoss/ppa/ubuntu bionic/main amd64 eosstracker amd64 1.2-1ppa3 [31.3 MB]
Get:2 http://archive.ubuntu.com/ubuntu bionic-updates/main amd64 bsdutils amd64 1:2.31.1-0.4ubuntu3.4 [60.3 kB]

    [ ... many lines deleted ... ]

Processing triggers for ureadahead (0.100.0-21) ...
ureadahead will be reprofiled on next reboot
Processing triggers for libc-bin (2.27-3ubuntu1) ...
Processing triggers for initramfs-tools (0.130ubuntu3.8) ...
update-initramfs: Generating /boot/initrd.img-4.15.0-58-generic
eosstracker@eosstracker:~$
```

### Check and see if it worked

What you are looking for is the following upgrades (as of Sep 1, 2019):  
`eosstracker (1.2-1ppa3)`, `aprsc-eoss (1.0-1ppa4)` and `direwolf (1.5.2-1ppa2)`.

You can always check what version you have installed with the `apt list` command.
For example, if everything worked and you enter the command `apt list eosstracker`,
you should see the following output: `eosstracker/bionic,now 1.2-1ppa3 amd64 [installed]`.

Here is the output after successfully upgrading:
```
eosstracker@eosstracker:~$ apt list eosstracker aprsc-eoss direwolf
Listing... Done
aprsc-eoss/bionic,now 1.0-1ppa4 amd64 [installed,automatic]
direwolf/bionic,now 1.5.2-1ppa2 amd64 [installed,automatic]
eosstracker/bionic,now 1.2-1ppa3 amd64 [installed]
eosstracker@eosstracker:~$
```

The ultimate test is to bring up the eosstracker.local web page, and click
the "Start" button.  Look in the "Stdout" System Log box for output similar to:

```
###################
Mon Sep  2 06:25:35 MDT 2019
###################
Starting habtracker-daemon.py...
linux; GNU C++ version 7.3.0; Boost_106501; UHD_003.010.003.000-0-unknown

Starting HAB Tracker backend daemon
Callsign:  E0SS
Number of SDRs:  1
Using SDR:   {'rtl': 0, 'product': u'RTL2838UHIDIR', 'serialnumber': u'00000001', 'manufacturer':
u'Realtek'}
INFO:  direwolf seems to support the -Q parameter
Using this filter for APRS-IS uplink: r/39.75/-103.50/400 r/40.198/-105.149/400 b/AE0SS-
12/KC0D-1 f/AE0SS-12/100 f/KC0D-1/100

Aprsc tap error connecting to local aprsc, attempt # 0 :   [Errno 111] Connection refused
Aprsc tap error connecting to local aprsc, attempt # 1 :   [Errno 111] Connection refused
Aprsc tap error connecting to local aprsc, attempt # 2 :   [Errno 111] Connection refused
Aprsc tap error connecting to local aprsc, attempt # 3 :   [Errno 111] Connection refused
Aprsc tap connection to local aprsc successful
```

The `INFO:  direwolf seems to support the -Q parameter` line informs you that
direwolf version 1.5.2-1ppa2 is properly installed. The `Aprsc tap connection
to local aprsc successful` line at the bottom without any
`WARNING:  Syntax error with aprsc Uplink configuration, retrying without custom
uplink filter...`
line informs you that aprsc-eoss version 1.0-1ppa4 is properly installed and working.

### Optional: Check and see if connected to EOSS PPA

A user many need to perform a one-time action to connect to the EOSS PPA.  
From then on, updates and upgrades are automatically installed when entering
the two commands above.  The instructions to connect to the PPA are
[here](EOSS-Install-PPA.md).

> Note:  If you have already enabled the EOSS PPA repository, or if you
> are not sure if the repository is enabled or not, there is no concern running
> the one-time steps to connect the PPA again.  Simply follow the instructions
> to connect to the PPA above and your software will be updated.

If you are connected to the tracker computer via the command line, you can
see if you have enabled the EOSS PPA repository and have installed the
`eosstracker` package with one command:

`apt list eosstracker`

If you are connected to the EOSS PPA, your command will result in something
similar to either
`eosstracker/bionic 1.1-1ppa2 amd64` or
`eosstracker/bionic,now 1.1-1ppa2 amd64 [installed]`
depending on the versions available at the EOSS PPA.  If you don't see the
`[installed]` at the end of the output, then you should perform the
[steps](EOSS-Install-PPA.md) to install the `eosstracker` package.  

If you are NOT connected to the repository, you will get a blank output from
your command.  Follow the [steps](EOSS-Install-PPA.md) to enable the EOSS PPA
repository and install the `eosstracker` package.
