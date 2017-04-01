#! /bin/bash
##
## detect and enable the compudata / adafruit gps cape 
##
## This script needs to be symlinked from /etc/rcS.d/S14sensorgnome-gpscape.
##
## This device attaches to ttyO4 on header P9 for the serial
## interface, and to pin 15 of header P9 for the PPS signal.
##
## It does not have a serial number eeprom, so we have to 
## detect it by waiting for a sentence on the port.
## 
## Also, the kernel requires a device overlay to see ttyO4
## This is in file (with md5sum):
##  /lib/firmware/ttyO4_armhf.com-00A0.dtbo  966f6111c5d28b3fb1b0a37962826d02 
##

## enable ttyO4 on P9 via an overlay
echo bone-ttyO4 > /sys/devices/bone_capemgr.*/slots

## Not sure this is needed, but allow for the device to 
sleep 0.3

GPS=/dev/ttyO4

## configure the serial port; the adafruit board's firmware
## is set to talk at 9600 bps.  We set a timeout here so
## that if no cape is present, we don't hang indefinitely,
## fixing the problem with the 2014 Sept. 10 software update.

stty -F $GPS raw 9600 min 0 time 50

## wait for a GPRMC sentence and use it to set the system clock.
## This cape has a battery-backed RTC, whose date and time appear
## immediately in GPRMC sentences, but the 'status of fix' field
## is marked as 'V' (invalid), so that gpsd ignores it.
## This means GPSD won't set the system clock from the RTC,
## waiting instead for a GPS fix which might never arrive,
## if the unit has poor sky view.

## here's a sample RMC sentence:
##  $GPRMC,174226.000,A,4505.3764,N,06422.1597,W,1.93,78.67,250814,,,A*4D
##   RMC   HHMMSS     C LAT       D LON        E  F   G     DDMMYY H I J BAD
## read until we've seen 50 sentences or a total elapsed time of 10 seconds

## we do this as a pipeline to avoid losses from opening and closing $GPS
## multiple times.  Only try read 50 sentences or for up to 10 seconds.
## This will add 10 seconds to the boot time of a non-GPS-cape SG.
## FIXME: see how low we can reduce this.

MAXTRIES=10

cat $GPS | (
    RMC=""
    COUNT=0
    TIME=0
    BAD="" ## not sure this is needed, but detects cruft after a sentence
           ## which might indicate we didn't read the line clearly
           ## Ideally, we'd use the checksum but you don't really want
           ## me to code that in bash, do you?

    while [[ "${RMC:0:6}" != '$GPRMC' && $COUNT -lt 50 && $TIME -lt $MAXTRIES ]]; do
        IFS=" "
        read -t 1 SENTENCE
        
        if [[ $? -eq 0 ]]; then
            IFS=","
            read RMC HHMMSS C LAT D LON E F G DDMMYY H I J BAD <<< "$SENTENCE"
            COUNT=$(( $COUNT + 1 ))
            if [[ "$BAD" != "" ]]; then
                BAD=""
                RMC=""
            fi
        else
            TIME=$(( $TIME + 1 ))
        fi
    done
    if [[ $TIME -ge $MAXTRIES ]]; then
       exit 10
    fi
    echo $RMC $HHMMSS $DDMMYY
) | (
    read -t 10 RMC HHMMSS DDMMYY
    ## verify that we got a valid GPRMC sentence

    if [[ "${RMC:0:6}" == '$GPRMC' ]]; then
        ## If the GPS is cold starting from new battery, the RTC year will be 1980.
        ## In that case, don't set the date now - we'll wait for the usual
        ## chrony/gpsd method.  Our sanity check will begin failing in the year 2080.
        if [[ "${DDMMYY:4:2}" -lt 80 ]]; then
            ## set the system clock from the RMC; forcing '20' as the century.
            DATE=${DDMMYY:2:2}${DDMMYY:0:2}${HHMMSS:0:2}${HHMMSS:2:2}20${DDMMYY:4:2}.${HHMMSS:4:2}
            date -u $DATE
        fi
        ## kludge: create a symlink to the GPS serial port from
        ## the location expected by gpsd
        ln -f -s $GPS /dev/ttyUSB0
        mkdir /dev/sensorgnome
        ## add a link in /dev/sensorgnome so the web interface can indicate
        ## this GPS is present.
        ln -f -s $GPS /dev/sensorgnome/gps.port=0.pps=1.type=cape
    fi
)
