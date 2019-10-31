#!/bin/bash


EOSS="A59EE9"

nc localhost 30003 | grep -i "${EOSS}" >  /eosstracker/logs/eoss_${EOSS}.out
