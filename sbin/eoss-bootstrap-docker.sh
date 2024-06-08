#!/bin/bash
#
# EOSS docker install bootstrap file
# 2024-06-08
# N2XGL
#
# Note:  Hardcoded for user eosstracker

EOSSUSER=eosstracker

ME=$(whoami)
if [ ${ME} != "root" ]; then
        echo "Not running as root...exiting"
        exit
fi

echo "Installing Docker's official GPG key..."
apt-get update
apt-get install ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "Adding the Docker repository to Apt sources..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update

echo "Installing Docker and Docker Compose..."
apt-get install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Creating the docker group..."
groupadd docker

echo "Adding ${EOSSUSER} to docker group..."
usermod -aG docker ${EOSSUSER}

echo "Configuring Doccker to start on boot..."
systemctl enable docker.service
systemctl enable containerd.service

echo "All packages installed successfully."
exit 0