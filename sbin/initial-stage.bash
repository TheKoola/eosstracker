#!/bin/bash
#
# This script will set up the /eosstracker directory tree with initial configuration 
# 
# Run this as the root user:
# 
#     For example:
#     $ sudo ./initial-stage.bash
#
#

ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "not running as root...exiting"
	exit
fi

echo "Checking eosstracker permissions and group membership..."
chown eosstracker:eosstracker /eosstracker
adduser eosstracker audio
adduser eosstracker dialout

echo "Staging /eosstracker..."
cp -rpa ../bin /eosstracker/
cp -rpa ../doc /eosstracker/
cp -rpa ../etc /eosstracker/
cp -rpa ../logs /eosstracker/
cp -rpa ../sbin /eosstracker/
cp -rpa ../sql /eosstracker/
cp -rpa ../www /eosstracker/

cp -rpa ../.git /eosstracker/
cp -pa ../.gitignore /eosstracker/

mkdir /eosstracker/osm
chown -R eosstracker:eosstracker /eosstracker/osm

mkdir /eosstracker/maps
chown -R eosstracker:eosstracker /eosstracker/maps

mkdir /eosstracker/db
chown -R postgres:postgres /eosstracker/db

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

su eosstracker -c "git checkout -- LICENSE"
su eosstracker -c "git checkout -- README.md"
su eosstracker -c "git checkout -- doc/EOSS-Install-PPA.md"
su eosstracker -c "git checkout -- doc/EOSS-SDR-Tracker-WiFi.md"
su eosstracker -c "git checkout -- etc/README"
su eosstracker -c "git checkout -- logs/.gitignore"
su eosstracker -c "git checkout -- logs/README"
su eosstracker -c "git checkout -- sql/eoss_specifics.sql"
su eosstracker -c "git checkout -- cleanandstage.bash"
su eosstracker -c "git pull"

echo
echo
su eosstracker -c "git status"
