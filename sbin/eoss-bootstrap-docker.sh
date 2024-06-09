#!/bin/bash
#
# EOSS docker install bootstrap file
# 2024-06-08
# de N2XGL
#
# Note:  Hardcoded for user eosstracker

EOSS_USER=eosstracker

set -e

ME=$(whoami)
if [ ${ME} != "root" ]; then
        echo "Not running as root...exiting"
        exit
fi

echo "Removing any existing docker packages..."
for pkg in docker.io docker-doc docker-compose podman-docker containerd runc; do apt-get -y remove $pkg; done

echo "Installing Docker's official GPG key..."
apt-get update
apt-get -y install ca-certificates curl
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
apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "Creating the docker group..."
groupadd -f docker

echo "Adding $EOSS_USER to docker group..."
usermod -aG docker ${EOSS_USER}
# newgrp docker

# echo "Configuring Docker to start on boot..."
# systemctl enable docker.service && \
# systemctl enable containerd.service && \
# sleep 3

echo "Installing docker compose file into /opt/eosstracker..."
mkdir -p /opt/eosstracker
mkdir -p /opt/eosstracker/data
curl -s -o /opt/eosstracker/docker-compose.yml https://raw.githubusercontent.com/TheKoola/eosstracker/brickv2.1/docker-compose.yml
chown -R ${EOSS_USER}:${EOSS_USER} /opt/eosstracker

echo "All packages installed successfully."
echo "Eosstracker docker-compose.yml file installed in /opt/eosstracker."
echo ""
echo "----  Log out eosstracker and log back in to activate Docker permissions.   ----"
echo "----  Once that is done, run 'docker compose up -d' from /opt/eosstracker.  ----"
echo ""

exit 0
