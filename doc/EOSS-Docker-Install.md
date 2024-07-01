# EOSS SDR Tracker Docker Install

Notes by Jeff N2XGL, Version 1.0, Dated 2024-06-22

## First-time Installation High-level Steps

### Basic System and Docker Functionality
1. [Install Base OS](#installbasic)
2. [Install Docker Engine](#installdocker)
3. [Post-install recommendations](#postinstall)

### Exclude RTL-SDR Kernel Modules
4. [Update and Unload Kernel Modules](#kernelmods)

### Eosstracker Docker Compose YAML file
5. [Install additional packages](#installaddpack)
6. [Create directory and Compose file](#dockercompose)
7. [Configure Devices and Environment](#configdevenv)
8. [Start Eosstracker container](#eosstrackerstart)

### Configure Eosstracker
9. [Synchronize with EOSS Kiosk](#kiosksync)
10. [Configure Eosstracker settings (optional)](#eosssettings)

### Download Map Files
11. [Downloading Eosstracker map files](#getmapfiles)


## Updating and Maintaining Eosstracker

### Updating Eosstracker
1. [Updating the Eosstracker container](#updatecontainer)
2. [Updating the EOSS map files](#updatemapfiles)
3. [Helpful Docker commands](#otherdockercommands)


# Basic System and Docker Functionality
<a name="installbasic"></a>
## Install the Base OS

Prepare your host system with an Operating System and a user with sudo privileges.  For the EOSS tracker "brick" computers, the 
recommended host OS is [Ubuntu Server](https://ubuntu.com/server) 24.04 LTS.  The standard configuration is:
```
User Name:  EOSS Tracker
Computer name:  eosstracker
username:  eosstracker
Password:  <insert standard password>
```

<a name="installdocker"></a>
## Install Docker engine

Install the Docker engine on your host OS.  See the Docker [documentation](https://docs.docker.com/engine/install/) for instructions.  
For the EOSS tracker "brick" computers running Ubuntu 24.04 LTS, the instructions for installing the Docker engine ([reference](https://docs.docker.com/engine/install/ubuntu/)) are included here:

1. Uninstall any old packages:
```sh
for pkg in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt-get remove $pkg; done
```
Note:  `apt-get` might report that you don't have any of these pacakages installed.

2. Install Docker's official signing key:
```sh
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

3. Set up Docker's repository as an Apt source:
```sh
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
```

4. Install the Docker engine and related packages:
```sh
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

<a name="postinstall"></a>
## Post-install recommendations

Once Docker is installed, we recommend adding your user to the `docker` group.  This will allow the user to execute docker 
commands without `sudo` and is required for proper operation of the eosstracker web interface.

Per the post-install recommendations [here](https://docs.docker.com/engine/install/linux-postinstall/), add the user to 
the `docker` group:
```sh
sudo usermod -aG docker $USER
```
Note:  You will need to log out and log back in for the changes to take effect.


# Exclude RTL-SDR Kernel Modules

<a name="kernelmods"></a>
## Update and unload RTL-SDR kernel modules

The RTL DVB kernel modules must be blacklisted on the Docker host computer. RTL-SDR itself is not required on the host. 
This can be accomplished using the following commands:
```sh
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
sudo modprobe -r dvb_usb_rtl28xxu
```
Note:  If the `modprobe -r` command errors, a reboot may be required to unload the module.


# Create directory and Compose file

<a name="installaddpack"></a>
## Install some additional packages

Eosstracker requires access to [avahi](https://avahi.org/), [net-tools](https://sourceforge.net/projects/net-tools/), 
and libraries for usb SDR devices.  Perform the following command to install them.
```sh
sudo apt-get install -y avahi-daemon net-tools librtlsdr2 libairspy0
```

<a name="dockercompose"></a>
## Choose a location for eosstracker

Choose a location and create a directory to keep the eosstracker Docker Compose file.  A Docker volume 
will contain the eosstracker flight database and map files.  For the EOSS brick computers, the default 
location is in the user's home directory `/home/eosstracker`.  

## Create the Docker Compose file

> Note:  A convenient way to install the Compose file for the EOSS brick computer is to execute the following command:
> ```sh
> curl -o docker-compose.yml https://raw.githubusercontent.com/TheKoola/eosstracker/brickv2.1/docker-compose.yml
> ```
> Continue reading to learn about a Compose file for different configurations.  Otherwise, jump to [Start Eosstracker](#eosstrackerstart).

Create a `docker-compose.yml` text file.  The contents of 
the Compose file will vary depending on your configuration.  For the EOSS brick computers, a default Compose file can be 
found [here](https://github.com/TheKoola/eosstracker/blob/brickv2.1/docker-compose.yml) and consists of:
```yaml
services:
  eosstracker:
    image: thekoola/eosstracker:brickv2.1
    devices:
      - /dev/bus/usb
      - /dev/ttyACM0
    container_name: eosstracker
    restart: unless-stopped
    network_mode: host
    command: /run.sh
    environment:
      - TZ=America/Denver
      - GPS_DEVICE=/dev/ttyACM0
    cap_add:
      - SYS_ADMIN
    volumes:
      - data:/eosstracker

volumes:
  data:
```

<a name="configdevenv"></a>
## Configure devices and environment

In order for the eosstracker Docker container to have access to the devices on your host computer, the Compose file
needs to have settings unique to your system, otherwise eosstracker may fail to start.  The container will need
access to the SDR devices on your USB bus.  If you use a local GPS receiver on your computer, the container will
also need access to it.  Note:  Even if your GPS receiver is plugged into a USB port, it enumerates as a serial
device with a "tty" designation, and must be mapped separately.

In the devices section of `docker-compose.yml`, include the following modified for your configuration:
```yaml
    devices:
      - /dev/bus/usb
      - /dev/ttyACM0
```
Both the `/dev/bus/usb` and `/dev/ttyACM0` may be different for your configuration.  These are the settings for
the EOSS brick computer.  The Compose file will fail if you point these devices to non-existing locations.

The `GPS_DEVICE` environment variable is used to pass the default device location to the `gpsd` daemon running
inside the container.  In the environment section of `docker-compose.yml`, include the following for your
configuration, matching the device setting for your GPS receiver.
```yaml
    environment:
      - TZ=America/Denver
      - GPS_DEVICE=/dev/ttyACM0
```
Note:  A valid GPS device is required, otherwise eosstracker may fail to start.

<a name="eosstrackerstart"></a>
## Start Eosstracker

The first time you run eosstracker, you must connect your computer to a network with access to the Internet.  
In the console, change to the directory where the `docker-compose.yml` file is saved.  Execute the following 
command from the console:
```sh
docker compose up -d
```
Note:  The first time you run the eosstracker container, Docker will pull the latest image and build it.  Depending
on the speed of your computer and Internet connection, this can take several minutes.  Furthermore, once the
container is running, it will detect the empty Docker volume and will download and populate it with eosstracker
files.  This will take a few additional minutes.

Once it is up and running, you can see what the Eosstracker container is doing by following the log file.  Use the 
following command to view the eosstracker log file, and press CTRL-C to exit when done.
```sh
docker compose logs -f
```

# Configure Eosstracker

<a name="kiosksync"></a>
## Synchronize with kiosk
In order to auto-populate the EOSS launch sites and standard frequencies, use your web browser to synchronize with the kiosk. 
Navigate to the `SETUP` tab, and expand the `Synchronize Flights, Trackers, etc.` section.  Click on the `Synchronize...` button.

<a name="eosssettings"></a>
## Configure eosstracker settings (optional)
To optionally conigure the callsign and other settings specific to your installation, use your web browswer and navigate to the `SETUP` tab.
Expand the `System Configuration` section and make changes.  Don't forget to click `Save Settings` at the bottom of the page.


# Download map files

<a name="getmapfiles"></a>
## Download latest eosstracker map files
To properly display streets and names on the map page, you need to download and save the latest map files for your geographical region 
of interest.  Building map files is beyond the scope of this tutorial.  For EOSS users, a map file containing all of North America is 
pre-built and available.  A convenient bash script will check to see if you have the latest map file, and automatically download it 
for you if needed.

Begin by connecting your computer to a network with access to the Internet.  Execute the following command from the console: 
```sh
docker exec -it --user eosstracker eosstracker /eosstracker/sbin/getlatestmap.bash
```
Note:  Depending on the speed of your host computer and Internet connection, this can take a while.  You will be downloading 
approximately 32 GB.  For the EOSS tracker computers on a high-speed Internet connection, this takes approximately 15 minutes.

You can run this command any time you are connected to the Internet and it will check to see if you have the latest map files.


# Updating Eosstracker Container

<a name="updatecontainer"></a>
## Updating the eosstracker container
As updates to Eosstracker are released, the Docker container version will be updated to match. 

Connect your computer to a network with access to the Internet.  In the console, change to the directory where 
the `docker-compose.yml` files is saved.  Execute the following command from the console:
```sh
docker compose pull
```
Note:  If there is a new version of the eosstracker container, Docker will pull the latest image and build it.  Depending
on the speed of your computer and Internet connection, this can take several minutes.

If there is no new version, the command will simply exit.  

If you do see a new version, execute the following command to restart the container, after the pull and build are complete:
```sh
docker compose down && docker compose up -d
```

You can run the `docker compose pull` command any time you are connected to the Internet and it will check to see if you have the latest
Eosstracker container.

<a name="updatemapfiles"></a>
## Downloading latest EOSS map files
For EOSS users, a map file containing all of North America is available.  To check to see if you have the latest map file, 
and automatically download it if you don't, follow this step.

Connect your computer to a network with access to the Internet.  Log in and execute the following command from the console: 
```sh
docker exec -it --user eosstracker eosstracker /eosstracker/sbin/getlatestmap.bash
```
Note:  Depending on the speed of your host computer and Internet connection, this can take a while.  You will be downloading 
approximately 32 GB.  For the EOSS tracker computers on a high-speed Internet connection, this takes approximately 15 minutes.

You can run this command any time you are connected to the Internet and it will check to see if you have the latest map files.

<a name="otherdockercommands"></a>
## Helpful Docker commands
Additional general Docker commands, as well as some specificly for Eosstracker, are provided here.

### GPS output
To check the GPS receiver is working:
```sh
docker exec -it eosstracker cgps
```
Note:  Type 'q' to quit.

### Prune old and unused containers
To clean up old, obsolete and unused containers (freeing up disk space):
```sh
docker system prune
```

### Open a shell within the running Docker container
To open a shell as the Eosstracker user within the running container:
```sh
docker exec -it --user eosstracker eosstracker /bin/bash
```
Note:  Enter 'exit' to close the shell.

### Stop Eosstracker processes (*e.g.* habtracker, aprsc, direwolf)
To cleanly shutdown processes within the container:
```sh
docker exec -it --user eosstracker eosstracker /eosstracker/bin/kill_session.bash
```
