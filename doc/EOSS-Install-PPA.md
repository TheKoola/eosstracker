# EOSS SDR Tracker Personal Package Archive

Notes by Jeff N2XGL,
Version 1.1, Dated 2019-04-28

## Upgrading your SDR Tracker to the EOSS PPA

The initial build of the EOSS SDR Tracker computers was accomplished by
imaging each hard drive with a "gold" image.  While this greatly simplified
deploying the initial units, it does not provide an easy way to supply
upgrades or enhancements to `eosstracker` or other software.  Furthermore,
it does not allow for an advanced user to easily install the software on their
own hardware.

The baseline Ubuntu Server 18.04.1 LTS operating system used on the SDR
Tracker provides a convenient way for users to install and maintain software
packages. [Launchpad](https://launchpad.net/) is a open source suite of tools
that help people and teams to work together on software projects.  EOSS will
host `eosstracker` package updates (and others) on launchpad at
https://launchpad.net/~eoss in a Personal Package Archive (PPA).

A user can perform a one-time action to connect to the EOSS PPA.  From then
on, updates and upgrades are automatically installed whenever the users
enters a couple simple commands.  The packages are built by the development
team and placed on the PPA repository.  All a user needs to do is connect
their SDR Tracker computer to the Internet and issue the update/upgrade
commands.  The steps are described below.

> Note:  If you have already enabled the EOSS PPA repository, or if you
> are not sure if the repository is enabled or not, there is no concern running
> the one-time steps again.  Simply follow the one-time steps anyway and
> your software will be updated.

## Connecting your SDR Tracker to the EOSS PPA (one-time)

To be able to download EOSS packages and install them, you need to perform
a one-time setup to connect to the EOSS PPA.  This will require having your
tracker computer connected to the Intenet in some fashion (e.g. Ethernet or
WiFi to home network).  See
[here](https://github.com/TheKoola/eosstracker/blob/master/doc/EOSS-SDR-Tracker-WiFi.md)
for instructions on connecting your tracker computer to the Internet via home
WiFi. You will also need to be logged into the computer at the command line.  

Note that these steps are for Ubuntu >= 9.10 only. Further information
regarding installing PPAs can be found
[here](https://help.launchpad.net/Packaging/PPA/InstallingSoftware).

Once you are logged in, you should be at the command
prompt:

`eosstracker@eosstracker:~$`

Begin by entering the following command:

`sudo add-apt-repository ppa:eoss/ppa`

This may prompt you to enter the `eosstracker` password in order to perform
the command as root. Your system will now fetch the PPA's key. This enables
your tracker computer to verify that the packages in the PPA have not been
interfered with since they were built.  You should see some output that
looks like:
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

Once that is complete, enter the command:

`sudo apt-get update`

This will tell the tracker computer to pull down the latest list of software
from each package archive it knows about, including the PPA you just added.

Finally, the first time you add the PPA, you need to install the `eosstracker`
package.  This will add it to the list of packages that are installed on your
machine.  Enter the command:

`sudo apt-get install eosstracker`

You are now all set with adding the EOSS PPA repository.  Future updates and
upgrades will not require this step.  

## Updating and Upgrading EOSS software packages

To download the list of latest package update releases, connect you SDR
Tracker computer to the Internet (e.g. Ethernet or WiFi to home network)
and log into the console as the `eosstracker` user.

Once at the prompt, issue the command:

`sudo apt-get update`

This will download the latest list of software from all of the known package
archives, including the EOSS PPA.  Then enter the command:

`sudo apt-get upgrade`

This command will download, build and install any new versions of the
software above your current versions.  

You can perform these commands as often as you like.  New versions will
only be installed if they are released in the package archives.  This is
an easy way to keep your operating system up-to-date as well as receive
new enhancements to the `eosstracker` software.

## Advanced users

The EOSS PPA repository will also allow an advanced user to install the
`eosstracker` software on a new computer or recover a tracker computer
from a bare-metal install.  Those instructions are being developed and
will be posted in the near future.
