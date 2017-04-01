#!/bin/bash
#
# make the 4 LED's on a beaglebone display a warning flashing pattern
# we use tee to make the settings (nearly) simultaneous

DEV=/sys/class/leds/beaglebone\:green\:usr
DEVTRIG="${DEV}0/trigger ${DEV}1/trigger ${DEV}2/trigger ${DEV}3/trigger"
DEVON="${DEV}0/delay_on ${DEV}1/delay_on ${DEV}2/delay_on ${DEV}3/delay_on"
DEVOFF="${DEV}0/delay_off ${DEV}1/delay_off ${DEV}2/delay_off ${DEV}3/delay_off"
echo timer | tee $DEVTRIG
echo 50 | tee $DEVON
echo 100 | tee $DEVOFF
