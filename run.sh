#!/bin/bash

set -m

ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "not running as root...exiting"
	exit
fi

if [ -d /eosstracker ]; then

    # get the number of files in the /eosstracker directory
    let numfiles=$(ls -1a /eosstracker | wc -l)

    if [ ${numfiles} -gt 2 ]; then

        # /eosstracker has something it it.  We exit for fear of messing up something in an existing installation.
        echo "OK ... /eosstracker is not empty, continuing..."

    else

	# /eosstracker is empty, continue...
        echo "OK ... Setting up and copying /eosstracker directory"
        chown eosstracker:eosstracker /eosstracker
        cp -rpa /usr/src/eosstracker/* /eosstracker/

    fi
else

    # /eosstracker does not exist, continue...
    echo "OK ... Creating, setting up and copying /eosstracker directory"
    mkdir -p /eosstracker
    chown eosstracker:eosstracker /eosstracker
    cp -rpa /usr/src/eosstracker/* /eosstracker/

fi

# Run rc.local
/bin/bash /eosstracker/sbin/rc.local

# Start services
# service php8.1-fpm start && \
service postgresql start && \
# service renderd start && \
service apache2 start

# Start a process
tail -f /var/log/apache2/access.log &

# Start the gpsd process 
# /usr/sbin/gpsd -F /run/gpsd/gpsd.socket -n -N -G tcp://gps:8888
/usr/sbin/gpsd -F /run/gpsd/gpsd.socket -n -N -G /dev/ttyUSB0 &
# /usr/sbin/gpsd -F /run/gpsd/gpsd.socket -n -N -G /dev/bus/usb/003/013 &

fg %1

