#!/bin/bash
#
# EOSS initial setup and config
#
# This script is intended to be run once, after a fresh bare-metal installtion
# of the EOSS "gold" image.  The script will attempt to expand the root partition
# to utilize the full disk and it will prompt the user to configure the SSID
# (e.g. EOSS-04) for the Hotspot.  If using the EOSS Docker container, it will also
# update the EOSS_NODEID environment variable in the docker-compose.yml file.
#
# This script is normally installed in /usr/local/sbin on the EOSS gold image.
# It does not require Internet acces.
#
# It will be run the following command from user eosstracker ~/.bash_login upon 
# login to interactive session.
#     sudo /usr/local/sbin/eoss-setupconfig.bash
# Once executed, it will remove the entire ~/.bash_login file, since having a
# .bash_login file means that ~/.profile is not read by bash upon login.
#
# If this is not what you want to do, don't use this script.
# 
# 2024-07-04
# JTS
#
# Note:  Must be run as root.

EOSS_USER=eosstracker
INTERACTIVE=True
EOSSDOCKER=True

set -e

# Modified from Raspberry Pi raspi-config as example
# Changes:  removed 'p' keystroke after 'n' new partition step in fdisk
do_expand_rootfs() {
  ROOT_PART="$(findmnt / -o source -n)"
  ROOT_DEV="/dev/$(lsblk -no pkname "$ROOT_PART")"

  PART_NUM="$(echo "$ROOT_PART" | grep -o "[[:digit:]]*$")"

  if [ "$PART_NUM" -ne 2 ]; then
    whiptail --msgbox "$PART_NUM is not the second partition. Don't know how to expand." 20 60 2
    return 0
  fi

  LAST_PART_NUM=$(parted "$ROOT_DEV" -ms unit s p | tail -n 1 | cut -f 1 -d:)
  if [ "$LAST_PART_NUM" -ne "$PART_NUM" ]; then
    whiptail --msgbox "$ROOT_PART is not the last partition. Don't know how to expand." 20 60 2
    return 0
  fi

  # Get the starting offset of the root partition
  PART_START=$(parted "$ROOT_DEV" -ms unit s p | grep "^${PART_NUM}" | cut -f 2 -d: | sed 's/[^0-9]//g')
  [ "$PART_START" ] || return 1
  # Return value will likely be error for fdisk as it fails to reload the
  # partition table because the root fs is mounted
  fdisk "$ROOT_DEV" <<EOF
p
d
$PART_NUM
n
$PART_NUM
$PART_START

p
w
EOF
  ASK_TO_REBOOT=1

  # now set up an init.d script
cat <<EOF > /etc/init.d/resize2fs_once &&
#!/bin/sh

### BEGIN INIT INFO
# Provides:          resize2fs_once
# Required-Start:
# Required-Stop:
# Default-Start: 3
# Default-Stop:
# Short-Description: Resize the root filesystem to fill partition
# Description:
### END INIT INFO

. /lib/lsb/init-functions

case "\$1" in
  start)
    log_daemon_msg "Starting resize2fs_once" &&
    resize2fs "$ROOT_PART" &&
    update-rc.d resize2fs_once remove &&
    rm /etc/init.d/resize2fs_once &&
    log_end_msg \$?
    ;;
  *)
    echo "Usage: \$0 start" >&2
    exit 3
    ;;
esac
EOF
  chmod +x /etc/init.d/resize2fs_once &&
  update-rc.d resize2fs_once defaults &&
  if [ "$INTERACTIVE" = True ]; then
    whiptail --msgbox "Root partition has been resized.\nThe filesystem will be enlarged upon the next reboot." 20 60 2
  fi
}

# Set the SSID
do_set_ssid() {
  EOSS_SSID=EOSS-00
  EOSS_CHANNEL=6

  if [ -d /etc/netplan ]; then
    SSID_FILE="$(grep "access-points:" /etc/netplan/*.yaml | cut -f 1 -d:)"
    [ "$SSID_FILE" ] || return 1
  else
    if [ "$INTERACTIVE" = True ]; then
      whiptail --msgbox "Netplan does not appear to be configured correctly." 20 60 2
    fi
    return 0
  fi

  EOSS_SSID="$(cat $SSID_FILE | grep -A1 access | tail -1 | cut -f2 -d\")"
  EOSS_OLDID=$EOSS_SSID
  EOSS_SSID="$(whiptail --title "Set WiFi SSID" --inputbox "Enter the SSID:" 10 30 "$EOSS_SSID" 3>&1 1>&2 2>&3)"
  sed -i "s/${EOSS_OLDID}/${EOSS_SSID}/g" "${SSID_FILE}"

  # Set the Hotspot channel
  EOSS_CHANNEL="$(cat $SSID_FILE | grep channel | cut -f2 -d:)"
  EOSS_OLDCHANNEL=$EOSS_CHANNEL
  EOSS_CHANNEL="$(whiptail --title "Set WiFi Hotspot Channel" --inputbox "Enter the Hostpot Channel (1, 6, or 11):" 10 30 "$EOSS_CHANNEL" 3>&1 1>&2 2>&3)"
  sed -i "s/channel:${EOSS_OLDCHANNEL}/channel: ${EOSS_CHANNEL}/g" "${SSID_FILE}"
  
  if [ "$EOSSDOCKER" = True ]; then
    COMPOSEFILE="/home/eosstracker/docker-compose.yml"
    if [ -f ${COMPOSEFILE} ]; then
      EOSS_OLDID="$(cat ${COMPOSEFILE} | grep EOSS_NODEID | cut -f2 -d=)"
      sed -i "s/EOSS_NODEID=${EOSS_OLDID}/EOSS_NODEID=${EOSS_SSID}/g" "${COMPOSEFILE}"
    else
      COMPOSEFILE="$(whiptail --title "EOSS Docker Compose File" --inputbox "Enter location of docker-compose file:" 10 30 "${COMPOSEFILE}" 3>&1 1>&2 2>&3)"
      if [ -f ${COMPOSEFILE} ]; then
        EOSS_OLDID="$(cat ${COMPOSEFILE} | grep EOSS_NODEID | cut -f2 -d=)"
        sed -i "s/EOSS_NODEID=${EOSS_OLDID}/EOSS_NODEID=${EOSS_SSID}/g" "${COMPOSEFILE}"
      fi
    fi
    if [ "$INTERACTIVE" = True ]; then
      whiptail --msgbox "EOSS Hostpsot updated with SSID=${EOSS_SSID}\nand Channel=${EOSS_CHANNEL}.\n \
      \nDocker compose file\n${COMPOSEFILE}\nupdated with EOSS_NODEID=${EOSS_SSID}." 20 60 2
    fi
  fi
}

# Main script starts here

echo "Running one-time EOSS initial setup script ..."

# Must be run as root
ME=$(whoami)
if [ ${ME} != "root" ]; then
        echo "Not running as root...exiting!"
        exit
fi

do_expand_rootfs
do_set_ssid

# Remove ~/.bash_login file
if [ -f /home/eosstracker/.bash_login ]; then
  rm -fr /home/eosstracker/.bash_login
else
  echo "/home/eosstracker/.bash_login not found ..."
fi

echo "Script completed successfully.  Please reboot."

exit 0
