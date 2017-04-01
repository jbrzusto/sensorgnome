#!/bin/bash
. /etc/default/gpsd
# ideally, we'd do this with a systemd timer unit, but that did not appear
# to work (the timer immediately started gpsd, without waiting for the delay
sleep 10
/usr/sbin/gpsd -F $GPSD_SOCKET -P/var/run/gpsd.pid $GPSD_OPTIONS $GPS_DEVICES
