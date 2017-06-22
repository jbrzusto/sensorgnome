#!/bin/sh
#
# set_gps_device.sh: set gps device to $1, restarting gpsd
#
# printf "Calling with '%s' and '%s'\n" "$1" "$2" >> /tmp/set_gps_device_log.txt
/bin/sed -i -e "s/tty[A-Za-z0-9]*/$1/g" /etc/default/gpsd
/bin/stty -F /dev/$1 4800;
/etc/init.d/gpsd restart
/usr/bin/awk -f /home/bone/proj/bonedongle/scripts/get_usb_device_port_number.awk $2
