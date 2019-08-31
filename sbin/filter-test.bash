#! /bin/sh

# Test script to add upstream filter to already running aprsc instance
# Not for production -- setting/code eventually implemented elsewhere
# Only for testing and development
#
# Must have compiled and installed modified aprsc to use filters
# Must be run as root -- will add filter and reload aprsc daemon

PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/eosstracker/sbin
BASEDIR=/opt/aprsc
DAEMON=$BASEDIR/sbin/aprsc
CONFIG_DIR=$BASEDIR/etc
LOG_DIR=$BASEDIR/logs
NAME=aprsc
DIRNAME=aprsc
DESC="APRS-IS server"
AUTOSTART="all"

CONFIG_FILE=tracker-aprsc.conf
FILTER="r/39.75/-103.5/380"

test -x $DAEMON || exit 0
test -d $CONFIG_DIR || exit 0

. /lib/lsb/init-functions

signal_aprsc () {
	PIDNAME=$NAME

	if start-stop-daemon --stop --signal $SIGNAL --quiet --pidfile $LOG_DIR/$PIDNAME.pid --exec $DAEMON; then
		echo "Success..."
	else
		echo "Error:  Signal failed."
	fi
}

instance_action () {
	ACTION="$1"
	ADESC="$2"
	shift
	shift
	if test -z "$2" ; then
		PIDFILE=
		for PIDFILE in `ls $LOG_DIR/aprsc*.pid 2> /dev/null`; do
			NAME=`echo $PIDFILE | cut -c17-`
			NAME=${NAME%%.pid}
			echo "  $ADESC aprsc '$NAME'"
			eval $ACTION
		done
		if test -z "$PIDFILE" ; then
			echo "  No aprsc is running."
		fi
	else
		while shift ; do
			[ -z "$1" ] && break
			PIDFILE="$LOG_DIR/$1.pid"
			if test -e $PIDFILE ; then
				echo "  $ADESC aprsc '$1'"
				PIDFILE=`ls $PIDFILE 2> /dev/null`
				NAME=`echo $PIDFILE | cut -c17-`
				NAME=${NAME%%.pid}
				eval $ACTION
			else
				echo "  $ADESC aprsc '$1': No such aprsc is running."
			fi
		done
	fi
}

# main

# Uplink "Core rotate" full  tcp  noam.aprs2.net 10152
# Changes to
# Uplink "Core rotate" full  tcp  noam.aprs2.net 14580 filter r/39.75/-103.5/380
# Then reload aprsc daemon

echo "Adding filter to aprsc config file."
if test -e "$CONFIG_DIR/$CONFIG_FILE" ; then
	sed -i 's,net 10152.*,net 14580 filter '"$FILTER"',g' $CONFIG_DIR/$CONFIG_FILE
else
	echo "Error:  $CONFIG_DIR/$CONFIG_FILE not found.  No filter added."
fi

echo "Reloading $DESC configuration files."
SIGNAL=USR1
instance_action "signal_aprsc" "Reloading" $@

# EOF
