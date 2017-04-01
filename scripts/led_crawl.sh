#!/bin/bash
#
# make the 4 LED's on a beaglebone display a progress-bar-style pattern
#
for x in 0 1 2 3; do
    DEV=/sys/class/leds/beaglebone\:green\:usr$x
    echo timer > $DEV/trigger
    echo 100 > $DEV/delay_on
    echo 900 > $DEV/delay_off
    echo none > $DEV/trigger
    echo timer > $DEV/trigger
    sleep 0.05
done
