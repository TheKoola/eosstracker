# EOSS Brick Build Notes - Docker

Last update:  6/22/2024

## High Level Steps

### Basic System and Docker Functionality
1. [Install Base OS](#installbasic)
2. [Install Docker Engine](#installdocker)
3. [Post-install recommendations](#postinstall)

### Exclude RTL-SDR Kernel Modules
4. [Update and Unload Kernel Modules](#kernelmods)

### Eosstracker Docker Compose YAML file
5. [Create directory and Compose file](#dockercompose)

### Configure Eosstracker
6. [Synchronize with EOSS Kiosk](#kiosksync)
7. [Configure Eosstracker Settings]

### Download Map Files
8. [Download Eosstracker map files](#getmapfiles)


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

The RTL DVB kernel modules must be blacklisted on the Docker host. RTL-SDR itself is not required on the host. This can 
be accomplished using the following commands:
```sh
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
sudo modprobe -r dvb_usb_rtl28xxu
```
Note:  If the `modprobe -r` command errors, a reboot may be required to unload the module.


# Create directory and Compose file

<a name="dockercompose"></a>
## Choose a location for eosstracker

Choose a location and create a directory to contain the eosstracker Docker Compose file and the eosstracker data.  The data 
directory will contain the eosstracker balloon flight database and map files.  For the EOSS brick computers, the default 
location is in the user's home directory `/home/eosstracker`.  Within that directory, create a folder for storing the data:
```sh
mkdir data
```

## Create the Docker Compose file
Create a `docker-compose.yml` file within the directory, alongside the data folder you just created.  The contents of the 
Compose file will vary depending on your configuration.  For the EOSS brick computers, a default Compose file can be 
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
      - ./data:/eosstracker
```
## Configure devices
In order for the eosstracker Docker container to have access to the devices on your host computer, 


# Configure Eosstracker

<a name="kiosksync"></a>
## Synchronize with kiosk
In order to auto-populate the EOSS launch sites and standard frequencies, use your web browser to synchronize with the kiosk. 

## Configure eosstracker settings
To conigure the callsign and settings specific to your installation, use your web browswer and navigate to `System Configuration`.


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
Note:  Depending on the speed of your host computer and Internet connection, this can take a while.  You will be downloading approximately 
32 GB.  For the EOSS tracker computers on a high-speed Internet connection, this takes approximately 15 minutes.

You can run this command any time you are connected to the Internet and it will check to see if you have the latest map files.
