#!/bin/bash

# EOSS ICAO number for reference
icao="A59EE9"

nohup /eosstracker/sbin/adsbclient.py ${icao} > /eosstracker/logs/adsbclient_${icao}.out 2>&1 &
nohup /eosstracker/sbin/eoss_adsb.bash >/dev/null 2>&1 &
