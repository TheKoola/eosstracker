#!/bin/bash

# script to check the latest mbtiles map file on the kiosk (track.eoss.org), compare that to what is already in /eosstracker/www/tileserver/, and download if necessary.
#
# The primary assumption with this script is that whatever map file (mbtiles file) up on the kiosk (track.eoss.org) is the latest revision.  

# The local location for things
MAPSLOC=/eosstracker/www/tileserver
LATEST=${MAPSLOC}/latestmap.txt
LATEST_MAP=${MAPSLOC}/north-america-latest.mbtiles

# URLs 
KIOSK_LATEST_URL=https://track.eoss.org/mbtiles/latestmap.txt
KIOSK_MAP_URL=https://track.eoss.org/mbtiles/north-america-latest.mbtiles


# make sure the latestmap.txt file exists on the brick
if [ ! -s ${LATEST} ]; then
    echo 0 > ${LATEST}
fi

# now get the latestmap.txt file from the kiosk
wget -q --show-progress -O /tmp/kiosk-latestmap.txt ${KIOSK_LATEST_URL}

# Check if the mbtiles file on the kiosk is different that what we have on the brick
diff /tmp/kiosk-latestmap.txt ${LATEST} > /dev/null
let ret=$?

# check if the mbtiles file exists or not.  If not, then we want to download a copy of it regardless.
if [ ! -s ${LATEST_MAP} ]; then
    let ret=1
fi

if [ $ret -eq 0 ]; then

    # we've already got the latest map file.
    echo "Already have the most recent map."
    echo "Done."

else 
    # there was a different version up on the kiosk, so we try to download it.
    # download it to a temporary file first
    wget -q --show-progress --backups=3 ${KIOSK_MAP_URL}

    # now place the latestmap.txt file here on the brick
    mv /tmp/kiosk-latestmap.txt ${LATEST}

    echo "Latest map downloaded: "
    ls -lh ${LATEST_MAP} | cut -d" " -f5,9-
    echo "Done."
fi

