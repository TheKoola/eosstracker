# EOSS SDR Tracker WiFi Configuration

Notes by Jeff N2XGL,
Version 1.0, Dated 2019-02-10

## Connecting to your SDR Tracker to the Internet

By default, the EOSS SDR Tracker establishes a WiFi hotpsot in order to 
host multiple clients in or around the balloon tracker vehicle.
The hotspot will provide IP addresses and DNS lookups to each client 
device (e.g. laptop, tablet) that connects.  These IP addresses are on a 10.42.0.0/24 network.  The
hotspot SSID is "EOSS-xx" where "xx" is a unique two-digit number printed
on the front of the tracker computer.  This is done so as to prevent client
connection issues when multiple tracker computers are located in proximity
(such as at the landing site).

If you want to also connect your EOSS SDR Tracker to the Internet, you
can connect it to an Ethernet LAN, such as your home network.  This requires
plugging an Ethernet cable into either the Ethernet-1 or Ethernet-2 sockets
on the tracker computer.  Your LAN needs to provide an IP address and gateway
to the SDR Tracker computer, which most home routers do by default.  Once
connected this way, clients on the hotspot (i.e. connected to "EOSS-xx" via
WiFi) will be able to access both the SDR Tracker web pages as well as get
to the Internet.  The SDR Tracker is serving as a router with NAT between the
10.42.0.0/24 network and the Ethernet LAN.

However, it can be inconvenient to connect the SDR Tracker to your Ethernet LAN,
especially if the tracker computer is permanently mounted in your vehicle.  If
you have a home WiFi network, it would be preferable to have the tracker
computer automatically connect to your home WiFi.  The problem is that the WiFi
hardware in the SDR Tracker can *only* serve as a hotspot or be a WiFi client on
another network, not both at the same time.

The SDR Tracker computer can be configured to first check for the presence of
a known WiFi network, connect to it if present, or then fall back to creating a
hotspot if no known WiFi networks are present.  This functionality is provided by
NetworkManager.  The steps to configure NetworkManager to do just this are
presented below.

## Connecting to the SDR Tracker computer console

The first thing you will have to do is be able to connect to the console of
the SDR Tracker computer, so that you can enter the commands at the commands
line.  You can either connect directly to the computer with a monitor and
keyboard, or you can connect to it over a network by using ssh.  

### Connecting directly to the tracker computer

Simply plug in a USB keyboard to any one of the USB ports, and connect a
computer monitor to the "HD1" HDMI port on the computer.  Press a key on
the keyboard, and you should be presented the login prompt.  Log in as
user `eosstracker` and the user password that was provided.  

### Connecting via ssh

To connect without a keyboard or monitor (i.e. headless), you will need to
have a ssh client software application.  A good one for Windows is 
[PuTTY](https://www.chiark.greenend.org.uk/~sgtatham/putty/).

If you are connected via "EOSS-xx" on your client computer, you can ssh to
`eosstracker@eosstracker.local` or `eosstracker@10.42.0.1` and provide the
password.  If you are already connected via your local Ethernet LAN, then
you will have to know the IP address that the SDR Tracker was provided.  You
can usually find this out from your router, which will show you a table of
DHCP clients.  Once you know the IP address (e.g. 192.168.8.100) then you can
ssh to `eosstracker@192.168.8.100`.

Note:  If you are connecting via "EOSS-xx" then you are unable to perform a
scan for available WiFi networks.  Doing so requires taking down the hotspot,
which will drop your ssh connection to the tracker computer.  If you already
know all the details about your local WiFi, you do not have to scan or drop
the hotspot connection to configure the tracker computer.  Simple skip over
those steps when prompted below.

## Configuring the WiFi on the SDR Tracker computer

Once you are connected and at the command line, you should have a prompt
similar to:

`eosstracker@eosstracker:~$`

#### Checking WiFi device name and scanning for available networks

To begin, type the following command and press enter:

`nmcli d`

You should get an output similar to this:

```
DEVICE  TYPE      STATE        CONNECTION
enp1s0  ethernet  connected    Wired connection 1
wlp2s0  wifi      connected    Hotspot
enp3s0  ethernet  unavailable  --
lo      loopback  unmanaged    --
```

Note the device name for the WiFi, in this case it is `wlp2s0`.  We will need
it later to make the new connection.  You can see that the WiFi is providing a
hotspot.

As mentioned above, if you know all the login details of your WiFi network, you
do not have to perform the next two steps and instead you can go to the next
section on configuring the WiFi.  If you are connected via "EOSS-xx" and you 
perform the next step, you will be disconnected and you will have to connect 
to the tracker computer by another method.

The next step is to turn off the hotspot so that we can configure for WiFi
client mode.  Enter the command:
 
`sudo nmcli c down Hotspot`

This will require you to enter the `eosstracker` password again to perform the
operation as root.

Now enter the following command to scan and list the available WiFi networks
in the proximity of the tracker computer:

`nmcli device wifi list`

You will get an output similar to this:

```
IN-USE  SSID              MODE   CHAN  RATE        SIGNAL  BARS  SECURITY
        MyGr8wifi         Infra  11    405 Mbit/s  100     ▂▄▆█  WPA1 WPA2
        Myhome-guest      Infra  11    405 Mbit/s  100     ▂▄▆█  --
        Kids_Play         Infra  11    260 Mbit/s  92      ▂▄▆█  WPA2
        Guest_Play        Infra  11    260 Mbit/s  92      ▂▄▆█  --
        Dev_Goto          Infra  11    260 Mbit/s  90      ▂▄▆█  WPA2
        Our_WiFi          Infra  6     260 Mbit/s  62      ▂▄▆_  WPA2
```

In this example, we will use the WiFi network "MyGr8wifi" as the network we
want to connect to when the tracker computer is at home.

#### Configuring a home WiFi connection by command line

To create a new network connection from the command line, we use nmcli, part
of NetworkManager.

Begin by entering:

`sudo nmcli c add type wifi con-name Home-wifi ifname wlp2s0 ssid 'MyGr8wifi'`

You may be prompted to enter the `eosstracker` password.  The single quotes are
important in case you have any spaces or non-alphanumeric characters in your
home WiFi SSID.  The profile connection name `Home-wifi` should not have any spaces and you should
avoid special characters.  You will get an output such as:

`Connection 'Home-wifi' (f1f123ab-2889-473a-b881-893678ab3991) successfully added.`

Next, to configure the connection and set the priority, enter the next two commands:

`sudo nmcli c modify Home-wifi wifi-sec.key-mgmt wpa-psk wifi-sec.psk 'xxxxxxxx'`

`sudo nmcli c modify Home-wifi connection.autoconnect true connection.autoconnect-priority 20`

Where `xxxxxxxx` is your password for your home WiFi network.  The single quotes are
important in case you have any non-alphanumeric characters in your password.

At this point, the connection profile is saved.  Enter the following command to
view all the connection profiles:

`nmcli c show`

If you disconnected the hotspot in the section above, and you entered the SSID
and password of your local WiFi network, then the tracker computer should have
already connected.  You will get an output similar to:

```
NAME                UUID                                  TYPE      DEVICE
Home-wifi           f1f123ab-2889-473a-b881-893678ab3991  wifi      wlp2s0
Wired connection 1  c0f3f448-5744-3345-9567-44c36a372130  ethernet  enp1s0
Hotspot             b734f4bb-b48c-4983-b869-e9872bc7457d  wifi      --
Wired connection 2  86987fe6-b834-3983-a908-96aac5347dd8  ethernet  --
```

If you did not disconnect the hotspot in the previous section, then you will
likely see an output similar to:

```
NAME                UUID                                  TYPE      DEVICE
Hotspot             b734f4bb-b48c-4983-b869-e9872bc7457d  wifi      wlp2s0
Wired connection 1  c0f3f448-5744-3345-9567-44c36a372130  ethernet  --
Home-wifi           f1f123ab-2889-473a-b881-893678ab3991  wifi      --
Wired connection 2  86987fe6-b834-3983-a908-96aac5347dd8  ethernet  --
```

At this point the network profiles are configured.  

The SDR Tracker computer, when booting, will look for the known WiFi home 
network first.  If it does not detect the home network after a few tries, 
it will fall back to hosting the "EOSS-xx" WiFi hotspot.  

If you are 
connected to your home network, and you drive away with the tracker
computer in your vehicle, it will automatically detect the network change and
turn on the hotspot.  However, the reverse is not true. If you are in hotspot
mode the tracker is not scanning for available WiFi networks and it will not
detect that you have entered range of a known network.  You can either reboot the
computer or restart the NetworkManager services to force it to check for the local
network.

#### Restarting the NetworkManager service

After everything is configured, it is a good idea to restart the NetworkManager
service.  This reloads all the configuration files and profiles.  Enter the command:

`sudo service NetworkManager restart`

Again, you may be prompted to enter the `eosstracker` password.  If you are connected
via "EOSS-xx" you may be temporarily disconnected at this point, especially as the tracker
computer searches for known WiFi networks.


