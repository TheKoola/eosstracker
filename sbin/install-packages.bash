#!/bin/bash
#
# This script will automagically install all the required packages from a bare metal
# Ubuntu 22.04 LTS required for the EOSS tracker software.
# 
# Run this as the root user:
# 
#     For example:
#     $ sudo ./install-packages.bash
#
#

ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "Not running as root...exiting"
	exit
fi

echo "Running apt update..."
apt-get update
echo ""

echo "Running apt upgrade..."
apt-get -y upgrade
echo ""

sleep 1
echo "Installing Apache web server..."
apt-get -y install apache2 apache2-dev php php-pgsql php-sqlite3
echo ""

#sleep 1 
#echo "Installing OpenStreetMap..."
#apt-get -y install libboost-all-dev git-core tar unzip wget bzip2 build-essential autoconf libtool libxml2-dev libgeos-dev libgeos++-dev libpq-dev libbz2-dev libproj-dev munin-node munin libprotobuf-c0-dev protobuf-c-compiler libfreetype6-dev libtiff5-dev libicu-dev libgdal-dev libcairo-dev libcairomm-1.0-dev apache2 apache2-dev libagg-dev liblua5.2-dev ttf-unifont lua5.1 liblua5.1-dev libgeotiff-epsg curl
#echo ""

sleep 1
echo "Installing PostgreSQL..."
#apt-get -y install postgresql postgresql-contrib postgis postgresql-10-postgis-2.4 postgresql-10-postgis-scripts
apt-get -y install postgresql-14 postgis 
echo ""

sleep 1
echo "Installing Python libraries..."
#apt-get -y install python-mapnik python-matplotlib python-numpy python-pip python-psutil python-psycopg2 python-scipy python-usb
apt-get -y install python3-mapnik python3-matplotlib python3-numpy python3-pip python3-psutil python3-psycopg2 python3-scipy python3-usb
echo ""

sleep 1
echo "Installing build libraries..."
#apt-get -y install make cmake g++ libboost-dev libboost-system-dev libboost-filesystem-dev libexpat1-dev zlib1g-dev libbz2-dev libpq-dev libgeos-dev libgeos++-dev libproj-dev lua5.2 liblua5.2-dev
apt-get -y install git gcc g++ make cmake libasound2-dev libudev-dev libevent-dev
echo ""

#sleep 1
#echo "Installing OSM Renderer libraries, tools and fonts..."
#apt-get -y install autoconf apache2-dev libtool libxml2-dev libbz2-dev libgeos-dev libgeos++-dev libproj-dev gdal-bin libmapnik-dev mapnik-utils python-mapnik osmctools
#apt-get -y install fonts-noto-cjk fonts-noto-hinted fonts-noto-unhinted ttf-unifont
#echo ""

sleep 1
echo "Installing Gnuradio and libraries..."
apt-get -y install gnuradio gnuradio-dev gr-osmosdr rtl-sdr airspy 
echo ""

sleep 1
echo "Installing GPSD"
apt-get -y install gpsd gpsd-clients libgps-dev
echo ""

sleep 1
echo "Installing some additional packages..."
apt-get -y install ipheth-utils libttspico-utils ffmpeg net-tools htop wavemon chrony avahi-daemon avahi-utils
echo ""

sleep 1
echo "Installing alsa-utils and removing pulseaudio..."
apt-get -y install alsa-utils
apt-get -y remove pulseaudio
echo ""

#sleep 1
#echo "Installing NPM, Node.js and Carto..."
#apt-get -y install npm nodejs
#npm install -g carto

sleep 1
echo "Installing aprslib..."
su - -c "pip3 install aprslib"
echo ""

sleep 1
echo "Removing ModemMananager..."
apt-get -y remove modemmanager
echo ""


sleep 1
echo "Autoremoving unused software..."
apt-get -y autoremove
echo ""


echo "All packages installed successfully."
exit 0
