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

If you are unsure whether or not you are connected to the EOSS PPA, follow these steps
to check.  Note, you do not have to be connected to the Internet to check, but
you do have to log into the tracker computer and access the command line.
Optional:  [Check to see if EOSS PPA is installed](#optional-check-and-see-if-connected-to-eoss-ppa).

### 1. Connect to Internet and log in

Connecting your SDR tracker computer to the Internet can be accomplished
multiple ways, including 1) plugging an [Ethernet LAN cable](EOSS-SDR-Tracker-WiFi.md)
into either jack, or 2) connecting the computer
[via WiFi to a home network](EOSS-SDR-Tracker-WiFi.md), or 3) plugging a
[tethered cellphone hotspot](EOSS-SDR-USB-Cellphone-Tether.md) into a USB port on
the computer.  

Details for connecting to the command line via a terminal application are
covered in the above application notes. Once you are connected, you should
see the following prompt:

`eosstracker@eosstracker:~$`

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
76 packages can be upgraded. Run 'apt list --upgradable' to see them.
```

### Optional: Check and see if connected to EOSS PPA

A user many need to perform a one-time action to connect to the EOSS PPA.  
From then on, updates and upgrades are automatically installed when entering
the two commands above.  The instructions to connect to the PPA are
[here](EOSS-Install-PPA.md).

> Note:  If you have already enabled the EOSS PPA repository, or if you
> are not sure if the repository is enabled or not, there is no concern running
> the one-time steps to connect the PPA again.  Simply follow the link above
> and your software will be updated.

If you are connected to the tracker computer via the command line, you can
see if you have enabled the EOSS PPA repository and have installed the
`eosstracker` package with one command:

`apt list eosstracker`

If you are connected to the EOSS PPA, your command will result in something
similar to either:

`eosstracker/bionic 1.1-1ppa2 amd64`

or

`eosstracker/bionic,now 1.1-1ppa2 amd64 [installed]`

depending on the versions available at the EOSS PPA.  If you don't see the
`[installed]` at the end of the output, then you should perform the
[steps](EOSS-Install-PPA.md) to install the `eosstracker` package.  

If you are NOT connected to the repository, you will get a blank output from
your command.  Follow the [steps](EOSS-Install-PPA.md) to enable the EOSS PPA
repository and install the `eosstracker` package.
