#!/bin/bash

# Look in two specific json files for instances where the hostname eosstracker.local
# is used and replace that with the actual hostname.



# our main function
main() {

    oldname="eosstracker.local"
    newname=${HOSTNAME}

    if [ -z ${newname} ]; then
        echo "New name cannot be null"
        return 1
    fi

    # do some checks on ${newname} to determine if it's given as an FQDN (or not)
    if [[ ${newname} != *"."* ]]; then
        # no dots were in the newname so we just append .local to it
        newname=${newname}".local"
    fi

    # Loop through the style.json files, changing the hostnames in each of them.
    for f in "/eosstracker/www/tileserver/basic/style.json" "/eosstracker/www/tileserver/osm-bright/style.json"
    do
        echo "Replacing ${oldname} with ${newname} in ${f}..."
        replacename ${f} ${oldname} ${newname} || echo "Unable to make changes to, ${f}"
    done

    echo "Done."

}


################ no user servicable parts below ###############


# function to replace a string within a file
# syntax:
#   replacename <filename> <search str> <replace str>
#
replacename() {
    if [ $# -lt 3 ]; then
        return 0
    fi

    # arguments to this function
    filename=$1
    needle=$2
    newname=$3


    SED_SCRIPT="s/${needle}/${newname}/g"

    sed --in-place -e ${SED_SCRIPT} ${filename}
    let retcode=$?
    return ${retcode}
}


# Call the main function and run this script
main 

