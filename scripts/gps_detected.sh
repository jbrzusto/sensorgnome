#!/bin/sh
#
# A GPS has been plugged in, so set up things to make it work.
#
#
# FIXME: once we're using the PPS-enabled serial GPS, change this appropriately

# sleep to make sure we've left enough time for udev to create the
# /dev/bonedongle/gps symlink

sleep 5

# force the USB GPS to communicate at 4800. This seems to be necessary for 
# the US GlobalSat BU353 USB to work, even though it eventually switches
# to binary mode at 9600 bps.

stty -F /dev/bonedongle/gps 4800 -parenb cs8 -cstopb -crtscts -ixon -ixoff

# restart gpsd so it can now read from the GPS

systemctl restart gpsd.service

# set the system date from GPS to bring it within NTP's reach

gawk -f /home/bone/proj/bonedongle/scripts/set_system_date_from_gpsd.awk


