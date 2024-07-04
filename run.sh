#!/bin/bash

set -m

BASEDIR=/opt/aprsc
DIRNAME=aprsc

HOMEDIR=/eosstracker
BINDIR=${HOMEDIR}/bin
LOGDIR=${HOMEDIR}/logs
KILLSESSION=${BINDIR}/kill_session.bash
LOGFILE=${LOGDIR}/killsession_wrapper.log
HABLOGFILE=${LOGDIR}/habtracker.log

# Define the container shutdown procedure
cleanup() {
    echo "Container stopping, shutting down session..."
    ${KILLSESSION} >${LOGFILE} 2>&1
    echo "HABTracker sessions have stopped."
}

#Trap SIGTERM
trap 'true' SIGTERM

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
        su - eosstracker -c "cd /; git clone -q -b brickv2.1 https://www.github.com/thekoola/eosstracker"
        su - eosstracker -c "cd /eosstracker; git status"
        cp -rpa /usr/src/eosstracker/db /eosstracker/
        cp -pa /usr/src/eosstracker/www/nodeid.txt /eosstracker/www/
        
    fi
else

    # /eosstracker does not exist, continue...
    echo "OK ... Creating, setting up and copying /eosstracker directory"
    mkdir -p /eosstracker
    chown -R eosstracker:eosstracker /eosstracker
    echo "Cloning https://www.github.com/thekoola/eosstracker to /eosstracker..."
    cd /
    su - eosstracker -c "cd /; git clone -q -b brickv2.1 https://www.github.com/thekoola/eosstracker"
    su - eosstracker -c "cd /eosstracker; git status"
    cp -rpa /usr/src/eosstracker/db /eosstracker/
    cp -pa /usr/src/eosstracker/www/nodeid.txt /eosstracker/www/

fi

# Fix permissions
/usr/bin/chown -R postgres:postgres /eosstracker/db/postgresql
/usr/bin/chown -R aprsc:aprsc /opt/aprsc/data /opt/aprsc/dev /opt/aprsc/logs
/usr/bin/chown -R aprsc:aprsc /opt/aprsc/sbin /opt/aprsc/web
/usr/bin/chown -R aprsc:eosstracker /opt/aprsc/etc
/usr/bin/chmod 777 /eosstracker/www/configuration /eosstracker/www/audio
/usr/bin/chmod 444 /eosstracker/www/configuration/defaults.txt
/usr/bin/chmod 444 /eosstracker/www/nodeid.txt

# Reset backend process states
echo "Resetting the backend process states in case of improper shutdown..."
rm -f /eosstracker/www/daemonstatus.json

# Check and add necessary directories and mount points for aprsc >= 2.1.5
if [ ! -d $BASEDIR/etc ]; then
	/bin/mkdir -p -m 755 $BASEDIR/etc
fi

if [ ! -d $BASEDIR/dev ]; then
	/bin/mkdir -p -m 755 $BASEDIR/dev
fi

if [ ! -d $BASEDIR/lib ]; then
	/bin/mkdir -p -m 755 $BASEDIR/lib
fi

if [ ! -d $BASEDIR/lib64 ]; then
	/bin/mkdir -p -m 755 $BASEDIR/lib64
fi

if [ ! -d $BASEDIR/usr/lib ]; then
	/bin/mkdir -p -m 755 $BASEDIR/usr/lib
fi

if [ ! -d $BASEDIR/usr/lib64 ]; then
	/bin/mkdir -p -m 755 $BASEDIR/usr/lib64
fi

# Copy files and special devices for aprsc >= 2.1.5 chroot environment
if [ ! -e $BASEDIR/etc/gai.conf ]; then
	/bin/cp -p /etc/resolv.conf /etc/nsswitch.conf /etc/hosts /etc/gai.conf $BASEDIR/etc/
fi

if [ ! -e $BASEDIR/dev/random ]; then
	/bin/cp -pa /dev/urandom /dev/random /dev/null /dev/zero $BASEDIR/dev/
fi

# Start services
service postgresql start && service apache2 start

# Log the EOSS Node ID
echo "EOSS Node ID: ${EOSS_NODEID} ..."
if [ -d /eosstracker/www ]; then
    echo ${EOSS_NODEID} > /eosstracker/www/nodeid.txt
    /bin/chmod 444 /eosstracker/www/nodeid.txt
fi

# Start a process
if [ -f ${HABLOGFILE} ]; then
    tail -f ${HABLOGFILE} &
else
    tail -f /var/log/apache2/access.log &
fi
child=$!

echo "Tail process id: ${child} ..."

# Start the gpsd process 
echo "Using the GPS device ${GPS_DEVICE} ..."
/usr/sbin/gpsd -F /run/gpsd/gpsd.socket -n -N -G ${GPS_DEVICE} &

fg %1

# If we get here, the container is being shutdown
cleanup

exit 0