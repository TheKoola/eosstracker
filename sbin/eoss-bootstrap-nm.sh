#!/bin/bash
#
# EOSS nnetwork-manager install bootstrap file
# 2024-06-08
# de N2XGL
#
# Note:  Hardcoded for user eosstracker

EOSS_USER=eosstracker

ME=$(whoami)
if [ ${ME} != "root" ]; then
        echo "Not running as root...exiting"
        exit
fi

echo "Installing network manager..."
apt-get update
apt-get install network-manager

echo "Removing modemmanager if present..."
apt remove --purge modemmanager



echo "All packages installed successfully."

exit 0
