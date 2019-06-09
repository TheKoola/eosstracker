#!/bin/bash
#
# This script will clean up the /eosstracker directory tree to enable git commands to pull down updated code.
# 
# Run this as the root user:
# 
#     For example:
#     $ sudo ./cleanandstage.bash
#
#

ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "not running as root...exiting"
	exit
fi


echo "Running apt update..."
apt update

sleep 2
echo "Installing alsa-utils and ipheth-utils..."
apt install -y  alsa-utils
apt install -y ipheth-utils

sleep 2
echo "Removing pulseaudio..."
apt remove -y pulseaudio

sleep 2
echo "Removing eosstracker..."
apt remove -y eosstracker

sleep 2
echo "Running autoremove..."
apt autoremove -y 

echo "Checking eosstracker permissions and group membership..."
chown eosstracker:eosstracker /eosstracker
adduser eosstracker audio
adduser eosstracker dialout

echo "Cleaning up /eosstracker..."
cd /eosstracker
rm -f bin/COPYING
rm -f www/COPYING
rm -rf www/images/aprs/aprs-symbol-index/
rm -f www/images/aprs/index.html
rm -f www/images/aprs/makeall.bash
rm -f www/images/aprs/makeimages-overlays.bash
rm -f www/images/aprs/makeimages.bash
rm -f www/images/aprs/makeimages2.bash
rm -f www/images/aprs/makeimages3.bash
rm -f www/images/aprs/symbols-new.txt
rm -f www/images/aprs/symbols.csv
rm -f www/images/aprs/symbols.txt
rm -f www/images/aprs/symbols2.csv
rm -f www/images/aprs/tocalls.bash
rm -f www/images/aprs/tocalls.txt
rm -f www/images/aprs/tocalls2.bash
rm -f www/images/aprs/tocalls3.bash
rm -f www/images/flightindicators/flightindicators
rm -f www/common/COPYING
rm -f www/common/sessionvariables.php
rm -f www/common/symbols.js
rm -f www/images/graphics/eosslogo.png
rm -f www/predictiondata/*.txt
rm -f www/preferences.php
rm -rf /eosstracker/.git
cp -rpa /tmp/eosstracker/.git /eosstracker
cp -pa /tmp/eosstracker/.gitignore /eosstracker
chown -R eosstracker:eosstracker /eosstracker/.git*

su eosstracker -c "git checkout -- LICENSE"
su eosstracker -c "git checkout -- README.md"
su eosstracker -c "git checkout -- CHANGES.md"
su eosstracker -c "git checkout -- CUSTOMIZATION.md"
su eosstracker -c "git checkout -- doc"
su eosstracker -c "git checkout -- etc"
su eosstracker -c "git checkout -- logs"
su eosstracker -c "git checkout -- sql"
su eosstracker -c "git checkout -- sbin"
su eosstracker -c "git checkout -- bin"
su eosstracker -c "git checkout -- www"
su eosstracker -c "git checkout -- cleanandstage.bash"
su eosstracker -c "git checkout -- fixperms.bash"
su eosstracker -c "git pull"

./fixperms.bash

echo
echo
su eosstracker -c "git status"
