#!/bin/bash
#
# make the 4 LED's stay on

DEV=/sys/class/leds/beaglebone\:green\:usr
DEVTRIG="${DEV}0/trigger ${DEV}1/trigger ${DEV}2/trigger ${DEV}3/trigger"
echo default-on | tee $DEVTRIG
