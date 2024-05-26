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
        chown -R eosstracker:eosstracker /eosstracker
        echo "Cloning https://www.github.com/thekoola/eosstracker to /eosstracker..."
        cd /
        su - eosstracker -c "cd /; git clone -b brickv2.1 https://www.github.com/thekoola/eosstracker"
        su - eosstracker -c "cd /eosstracker; git status"
        cp -rpa /usr/src/eosstracker/db /eosstracker/
        su eosstracker -c 'echo "EOSS-Docker" >> /eosstracker/www/nodeid.txt'
        
    fi
else

    # /eosstracker does not exist, continue...
    echo "OK ... Creating, setting up and copying /eosstracker directory"
    mkdir -p /eosstracker
    chown -R eosstracker:eosstracker /eosstracker
    echo "Cloning https://www.github.com/thekoola/eosstracker to /eosstracker..."
    cd /
    su - eosstracker -c "cd /; git clone -b brickv2.1 https://www.github.com/thekoola/eosstracker"
    su - eosstracker -c "cd /eosstracker; git status"
    cp -rpa /usr/src/eosstracker/db /eosstracker/
    su eosstracker -c 'echo "EOSS-Docker" >> /eosstracker/www/nodeid.txt'

fi

# Fix permissions
/usr/bin/chown -R postgres:postgres /eosstracker/db/postgresql
/usr/bin/chown -R aprsc:aprsc /opt/aprsc/data /opt/aprsc/dev /opt/aprsc/logs
/usr/bin/chown -R aprsc:aprsc /opt/aprsc/sbin /opt/aprsc/web
/usr/bin/chown -R aprsc:eosstracker /opt/aprsc/etc
/usr/bin/chmod 777 /eosstracker/www/configuration /eosstracker/www/audio
/usr/bin/chmod 444 /eosstracker/www/configuration/defaults.txt
/usr/bin/chmod 444 /eosstracker/www/nodeid.txt

# Run rc.local
/bin/bash /eosstracker/sbin/rc.local

# Start services
service postgresql start && service apache2 start

# Start a process
tail -f /var/log/apache2/access.log &

# Start the gpsd process 
echo "Using the GPS device ${GPS_DEVICE} ..."
/usr/sbin/gpsd -F /run/gpsd/gpsd.socket -n -N -G ${GPS_DEVICE} &

fg %1

