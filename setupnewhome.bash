#!/bin/bash
#
# This script will setup the /eosstracker directory tree from scratch and assumes that /eosstracker is EMPTY!!!
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

if [ -d /eosstracker ]; then

    # get the number of files in the /eosstracker directory
    let numfiles=$(ls -1a /eosstracker | wc -l)

    if [ ${numfiles} -gt 2 ]; then

        # /eosstracker has something it it.  We exit for fear of messing up something in an existing installation.
        echo "/eosstracker is not empty, exiting..."
        exit 1
    fi
else

    # /eosstracker does not exist, continue...
    echo "Creating /eosstracker directory"
    mkdir /eosstracker

fi


# Change ownership
echo "Changing ownership on /eosstracker"
chown eosstracker:eosstracker /eosstracker

# Add the eosstracker user to these groups
echo "Adding eosstracker to the audio and dialout groups"
adduser eosstracker audio
adduser eosstracker dialout

# Now clone the github repo 
echo "Cloning https://www.github.com/thekoola/eosstracker to /eosstracker..."
cd /
su - eosstracker -c "cd /; git clone https://www.github.com/thekoola/eosstracker"
su - eosstracker -c "cd /eosstracker; git checkout brickv2.1; git status"

echo
echo
echo "/eosstracker successfully setup!"

