#!/bin/bash

# maybe_get_clock_from_rtc.sh - if found, use an attached RTC to
# set the system clock, but only if the RTC has a date/time later
# than now.

NOW_TS=`date +%s`
RTCS=`cd /dev; ls -1 rtc*`
declare -A old_rtcs
for x in $RTCS; do
    old_rtcs[$x]="1"
done

# look for a DS1307-compatible RTC at address 0x68 
# on I2C bus #3 (pins 19,20 of header P9 on the beaglebone)

echo ds1307 0x68 > /sys/class/i2c-dev/i2c-1/device/new_device 
sleep 1
RTCS=`cd /dev; ls -1 rtc*`

for x in $RTCS; do
    if [[ "${old_rtcs[$x]}" == "" ]]; then 
        RTC_TS=`date +%s -d"\`hwclock --show -f /dev/$x\`"`
        if [[ "$RTC_TS" -ge "$NOW_TS" ]]; then
## in case timestamp.service tries to use the following, remove it
            rm -f /etc/timestamp
            sleep 1
            hwclock --hctosys --utc -f /dev/$x
            echo System clock set from RTC.
            exit 0
        else
            echo Did not set system clock: RTC time is in the past.
            exit 1
        fi
    fi
done
echo Did not set system clock: no RTC detected at I2C address 0x68 on bus 2.
exit 1
