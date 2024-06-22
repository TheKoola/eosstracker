# EOSS Brick Build Notes - Docker

Last update:  6/22/2024

## High Level Steps

### Basic System and Docker Functionality
1. [Install Base OS](#installbasic)
2. [Install Docker Engine](#installdocker)
3. [Post-install recommendations](#convenience)




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

<a name="convenience"></a>
## Post-install recommendations

Once Docker is installed, we recommend adding your user to the `docker` group.  This will allow the user to execute docker commands without `sudo` and is required for proper operation of the eosstracker web interface.

Per the post-install recommendations [here](https://docs.docker.com/engine/install/linux-postinstall/), add the user to the `docker` group:
```sh
sudo usermod -aG docker $USER
```
Note:  You will need to log out and log back in for the changes to take effect.