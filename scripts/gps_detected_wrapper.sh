#!/bin/sh
#
# A GPS has been plugged in, so set up things to make it work.
#
# We spawn gps_detected.sh which will sleep for a couple of seconds
# before doing the real work, so that all device-related symlinks
# have been established.

/home/pi/proj/sensorgnome/scripts/gps_detected.sh &
