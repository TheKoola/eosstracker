# EOSS Brick Build Notes - Ubuntu 24

Last update:  6/22/2024

Warning:  This is to install *only* the base Ubuntu 24.04 operating system.  Eosstracker will *not* run natively on Ubuntu 24.04.
This is intended for Docker installations.  To install eosstracker natively, refer to the Ubuntu 22.04 instructions.

## High Level Steps

### Basic System Functionality
1. [Install Ubuntu 24.04 LTS](#installos)
2. [Configure Networking](#networking)
3. [Convenience Settings](#convenience)

### EOSSTracker Software and Dependencies
1. [Airspy udev Rules](#airspy)

### Necessary System Services
10. [Configure Sudo](#sudo)
11. [Timezones](#timezones)
12. [UFW Firewall](#firewall)
13. [Network Time](#time)


# Basic System Functionality
<a name="installos"></a>
## Install the base OS

Start with a clean install of Ubuntu 24.04 Server LTS.  During the installation it will ask for a 
username/password as well as a "computer name" or hostname.  Use the following:
```
User Name:  EOSS Tracker
Computer name:  eosstracker
username:  eosstracker
Password:  <insert standard password>
```
The installer will prompt you to install the OpenSSH Server.  Select it to install, and choose to allow password authentication over SSH.

## Update software

Log in as the `eosstracker` user created during the install, then run these commands:
```
sudo apt update
sudo apt upgrade
sudo reboot
```
<a name="networking"></a>
## Networking Configuration
When working with the networking subsystem and in particular the commands in this section, it is highly advisable to have a monitor and keyboard directly attached to the system as network connectivity will be interrupted.  

### Install/remove packages

First we need to install network manager.

`sudo apt install network-manager`

Now also remove the modemmanager (it can cause GPSD to misidentify the device)

`sudo apt remove --purge modemmanager`

Edit the netplan file to point to NetworkManager

Edit the `/etc/netplan/00-installer-config.yaml` file such that it only contains these lines:  
```
network:
  version: 2
  renderer: NetworkManager
```

### Then stop all services that are using networkd:

Get a list of those services that are using `networkd`:

`sudo systemctl | grep networkd`

For example:
```
sudo systemctl | grep networkd
  networkd-dispatcher.service                                                               loaded    active running   Dispatcher daemon for systemd-networkd
● systemd-networkd-wait-online.service                                                      loaded    failed failed    Wait for Network to be Configured
  systemd-networkd.service                                                                  loaded    active running   Network Configuration
  systemd-networkd.socket  
```

Then stop each of those services:
```
sudo systemctl stop networkd-dispatcher.service   
sudo systemctl stop systemd-networkd-wait-online.service
sudo systemctl stop systemd-networkd.service
sudo systemctl stop systemd-networkd.socket  
```

Now mask all of those services so they don't start by using a command like this:

`sudo systemctl mask <service>`

### Now have netplan configure NetworkManager by running these commands:
```
sudo netplan apply
sudo netplan generate
```

You should now have a functioning NetworkManager environment:
```
sudo nmcli c show

NAME                UUID                                  TYPE      DEVICE 
Wired connection 1  fb1b7644-c634-3452-9ea8-1e5e6fc166c6  ethernet  --     
Wired connection 2  bcb06b9a-9be7-353b-b3d3-7424c2065ead  ethernet  --
```

If you don't see any output (like above) from the nmcli command, the a reboot is likely the next course of action:
```
sudo reboot
```

### Add in your home Wi-Fi (if applicable)
```
sudo nmcli c add type wifi con-name Home-wifi ifname wlp2s0 ssid 'myssid'
sudo nmcli c modify Home-wifi wifi-sec.key-mgmt wpa-psk wifi-sec.psk 'xxxxxxxx'
sudo nmcli c modify Home-wifi connection.autoconnect true connection.autoconnect-priority 40

nmcli c show
```

### Add in the hotspot wifi configuration
```
sudo nmcli connection add type wifi ifname wlp2s0 con-name Hotspot autoconnect yes ssid EOSS-11 mode ap
sudo nmcli connection modify Hotspot 802-11-wireless.mode ap 802-11-wireless-security.key-mgmt wpa-psk ipv4.method shared 802-11-wireless-security.psk '<wifi password>'
sudo nmcli c modify Hotspot wifi-sec.pmf 1 connection.autoconnect true connection.autoconnect-priority 20
```

### Edit `/etc/resolv.conf`

First, edit the file:

`sudo vi /etc/resolv.conf`

Then change the "search" line at the bottom to look like:
```
..
search local
```

### Dnsmasq configuration

Create a new file in `/etc` that contains an entry for `eosstracker.local` using the IP address that NetworkManager+dnsmasq uses when in hotspot mode.

#### An additional hosts file

Edit this file

`sudo vi /etc/hosts.dnsmasq`

Place these lines therein and save:

`10.42.0.1  eosstracker.local  eosstracker`

#### NetworkManager dnsmasq conf file

Now edit this file:

`sudo vi /etc/NetworkManager/dnsmasq-shared.d/eoss.conf`

Place these lines therein and save:
```
interface=wlp2s0
addn-hosts=/etc/hosts.dnsmasq
domain=local
dhcp-option=option:ntp-server,10.42.0.1
```

### Reboot to test

You'll likely need to reboot to test all of this:

`sudo reboot`

<a name="convenience"></a>
## Convenience Stuff

### VI Editor preferences
Add this to the eosstracker's `~/.vimrc` file:
```
filetype plugin indent on
syntax on
set tabstop=4
set shiftwidth=4
set expandtab
if has("autocmd")
  au BufReadPost * if line("'\"") > 0 && line("'\"") <= line("$") | exe "normal! g`\"" | endif
endif
```

### Bashrc entries
Add this to the end of the eosstracker's `~/.bashrc` file:
```
export PGDATABASE=aprs
set -o vi
```

### Bash command aliases
Create the `~/.bash_aliases` file with the following contents:
```
alias p='ps -ef | egrep "direwolf|aprsc|gpsd|killsession|kill_session|habtracker-daemon|gpswss" | grep -v grep'
alias r='cat /eosstracker/sql/shortlist.sql | psql -d aprs'
alias blank='echo "update teams set flightid=NULL;" | psql -d aprs'
```

<a name="airspy"></a>
## Fixing Airspy Udev Rules

In the odd chance that the airspy rules are not installed, you'll need to create a file under `/etc/udev/rules.d/` so that any airspy SDR devices attached to the system are usable by non-root users.

### Edit or create airspy rules file

`sudo vi /etc/udev/rules.d/52-airspy.rules`

Then add this line to the file and save

`ATTR{idVendor}=="1d50", ATTR{idProduct}=="60a1", SYMLINK+="airspy-%k", MODE="660", GROUP="plugdev"`

### `plugdev` group membership
Make sure that the `eosstracker` user is a member of the `plugdev` group.  For example:

```
eosstracker@eosstracker:~$ id
uid=1000(eosstracker) gid=1000(eosstracker) groups=1000(eosstracker),4(adm),20(dialout),24(cdrom),27(sudo),29(audio),30(dip),46(plugdev),110(lxd)
```

### Testing
If you have an airspy device, you can test things are working with this command after attaching the airspy sdr device to the system:

```
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
```

# Necessary System Services



<a name="timezones"></a>
## Timezones

### Set the operating system timezone
Set the Timezone for the OS and the database:

`sudo timedatectl set-timezone America/Denver`


<a name="firewall"></a>
## Firewall

### Check status
Check status of the firewall

`sudo ufw status`

### Update IP forwarding defaults for the UFW firewall
Edit the `/etc/ufw/sysctl.conf` file and uncomment the following lines.

Edit the file:

```sudo vi /etc/ufw/sysctl.conf```

Now uncomment these lines (i.e. remote the `#` character the begining of the line):

```
net/ipv4/ip_forward=1
net/ipv6/conf/default/forwarding=1
net/ipv6/conf/all/forwarding=1
```

### Update the firewall configuration:
Run these commands to update the firewall configuration (port 67 is for DHCP when in hotspot mode).
```
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow OpenSSH
sudo ufw allow 14501
sudo ufw allow 14580
sudo ufw allow gpsd
sudo ufw allow 53
sudo ufw allow 67
```

Next you'll need to allow for incoming traffic on the system's wifi adapter to be routed through the system and out to an internet connection (i.e. you're tethering with a phone or are using another physical network connection through the RJ45 ports).  The interface name on your system might be different from `wlp2s0` in which case you'll need to run `ifconfig -a` to determine the wifi adapter's interface name and use that instead in the command below:

```
sudo ufw route allow in on wlp2s0 to any
```

### Now enable the firewall
```
sudo ufw enable
sudo ufw reload
sudo ufw status
```

<a name="time"></a>
## Time Server Configuration

### Install the chrony time service
`sudo apt-get install chrony`

### Edit the time configuration configuration file:

`sudo vi /etc/chrony/chrony.conf`

Add these lines at the bottom of the file:
```
# set larger delay to allow the NMEA source to overlap with
# the other sources and avoid the falseticker status
refclock SHM 0 refid GPS precision 1e-1 offset 0.9999 delay 0.2
refclock SHM 1 refid PPS precision 1e-9

# Allow access from NTP clients
allow
```

### Now reboot the system for the chrony changes to take effect:

`sudo reboot`

### Install additonal packages
```sh
sudo apt-get -y install ipheth-utils htop alsa-utils
sudo apt-get -y remove pulseaudio
```