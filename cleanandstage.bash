#!/bin/bash


# This script will clean up the /eosstracker directory tree to enable git commands to pull down updated code.
# 
# Run this as the root user:
# 
#     For example:
#     $ sudo ./cleanandstage.bash

ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "not running as root...exiting"
	exit
fi


echo "Running apt update..."
apt update

sleep 2
echo "Installing alsa-utils..."
apt install -y  alsa-utils

sleep 2
echo "Removing pulseaudio..."
apt remove -y pulseaudio

echo "Checking eosstracker permissions and group membership..."
chown eosstracker:eosstracker /eosstracker
adduser eosstracker audio
adduser eosstracker dialout

echo "Cleaning up /eosstracker..."
cd /eosstracker
rm bin/COPYING
rm www/COPYING
rm -rf www/images/aprs/aprs-symbol-index/
rm www/images/aprs/index.html
rm www/images/aprs/makeall.bash
rm www/images/aprs/makeimages-overlays.bash
rm www/images/aprs/makeimages.bash
rm www/images/aprs/makeimages2.bash
rm www/images/aprs/makeimages3.bash
rm www/images/aprs/symbols-new.txt
rm www/images/aprs/symbols.csv
rm www/images/aprs/symbols.txt
rm www/images/aprs/symbols2.csv
rm www/images/aprs/tocalls.bash
rm www/images/aprs/tocalls.txt
rm www/images/aprs/tocalls2.bash
rm www/images/aprs/tocalls3.bash
rm -rf /eosstracker/.git
cp -rpa /tmp/eosstracker/.git /eosstracker
cp -pa /tmp/eosstracker/.gitignore /eosstracker

su eosstracker -c "git checkout -- LICENSE"
su eosstracker -c "git checkout -- README.md"
su eosstracker -c "git checkout -- doc/EOSS-Install-PPA.md"
su eosstracker -c "git checkout -- doc/EOSS-SDR-Tracker-WiFi.md"
su eosstracker -c "git checkout -- etc/README"
su eosstracker -c "git checkout -- logs/.gitignore"
su eosstracker -c "git checkout -- logs/README"
su eosstracker -c "git checkout -- sql/eoss_specifics.sql"
su eosstracker -c "git checkout -- cleanandstage.bash"

echo
echo
su eosstracker -c "git status"
