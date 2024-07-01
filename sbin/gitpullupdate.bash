#!/bin/bash

# script to perform a git-pull on the eosstracker directory

set -m

# The local location for things
HOMEDIR=/eosstracker

# Check to make sure we are root
ME=$(whoami)
if [ ${ME} != "root" ]; then
	echo "Not running as root...exiting"
	exit
fi

# Inform user
echo "Attempting to update the eosstracker software (timeout 20 seconds)..."

# Perform the git pull
su - eosstracker -c "cd ${HOMEDIR}; timeout --foreground 20 git pull -q"
let ret=$?

if [ $ret -eq 124 ]; then

    # Git command timed out
    echo "Eosstracker update command timed out.  Possibly no Internet connection..."
    echo "Done."

else

    if [ $ret -eq 0 ]; then

    # Git pull worked, but there are no new files
    echo "Eosstracker software is up-to-date..."
    echo "Done."

    else

    # Git downloaded files and performed updates
    echo "Eosstracker software has been updated to the latest version..."
    echo "Done."

fi

echo 0

#EOF

