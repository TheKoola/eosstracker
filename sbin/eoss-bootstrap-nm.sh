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
apt-get -y install network-manager hostapd dnsmasq

echo "Removing modemmanager if present..."
apt-get -y remove --purge modemmanager

echo -en "\nEnter the WiFi hotspot SSID (e.g. EOSS-XX): "
read EOSS_HOTSPOT

echo "Connfiguring hotspot SSID $EOSS_HOTSPOT..."
nmcli connection add type wifi ifname wlp2s0 con-name Hotspot autoconnect yes ssid ${EOSS_HOTSPOT} mode ap
nmcli connection modify Hotspot 802-11-wireless.mode ap 802-11-wireless-security.key-mgmt wpa-psk \
  ipv4.method shared 802-11-wireless-security.psk 'abcd1234'
nmcli connection modify 802-11-wireless.powersave disable
nmcli connection modify Hotspot wifi-sec.pmf disable
nmcli connection modify Hotspot connection.autoconnect true connection.autoconnect-priority 20




echo "All packages installed successfully."

exit 0
