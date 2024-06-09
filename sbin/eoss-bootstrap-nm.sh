#!/bin/bash
#
# EOSS nnetwork-manager install bootstrap file
# 2024-06-08
# de N2XGL
#
# Note:  Hardcoded for user eosstracker

EOSS_USER=eosstracker

# set -e

ME=$(whoami)
if [ ${ME} != "root" ]; then
        echo "Not running as root...exiting"
        exit
fi

echo "Installing network manager and hostapd..."
apt-get update
apt-get -y install network-manager hostapd

echo "Removing modemmanager if present..."
apt-get -y remove --purge modemmanager




echo "All packages installed successfully."

exit 0
