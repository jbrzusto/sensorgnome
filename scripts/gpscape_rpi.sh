#! /bin/bash
##
## detect and enable the compudata / adafruit gps cape - raspberry Pi version
## or allow for a USB GPS.
##
## Depending on whether the cape is detected, different configuration files
## are set up for use by gpsd and chrony, and these are started here.
##
## The GPS cape device presents as ttyAMA0, with PPS on GPIO pin #4,
## so we have to detect it by waiting for a sentence on the port.

## assume gps will be a USB device
cp -f /etc/default/gpsd-usb /etc/default/gpsd
cp -f /etc/chrony/chrony.conf-usb /etc/chrony/chrony.conf

GPS=/dev/ttyAMA0

## configure the serial port; the adafruit board's firmware
## is set to talk at 9600 bps.  We set a timeout here so
## that if no cape is present, we don't hang indefinitely,
## fixing the problem with the 2014 Sept. 10 software update.

stty -F $GPS raw 9600 min 0 time 100

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
## multiple times.  Only try read 50 sentences or for up to 20 seconds.
## This will add 20 seconds to the boot time of a non-GPS-cape SG.
## FIXME: see how low we can reduce this.

MAXTIME=120 ## maximum time (in seconds) before we accept there's no gps cape
HAVECAPE=0

TS_START=`cat /proc/uptime | sed -e 's/\..*$//'`
TS_DONE=$(( $TS_START + $MAXTIME ))
export IFS=","
while (( ! $HAVECAPE && `cat /proc/uptime | sed -e 's/\..*$//'` < $TS_DONE )); do
    read -t5  RMC HHMMSS C LAT D LON E F G DDMMYY H I J REST < $GPS
    if [[ "${RMC:0:3}" == '$GP' ]]; then
        HAVECAPE=1
    fi
done
if (( $HAVECAPE )); then
        ## kludge: set gpsd defaults
	cp -f /etc/default/gpsd-cape /etc/default/gpsd
        cp -f /etc/chrony/chrony.conf-cape /etc/chrony/chrony.conf

        mkdir /dev/sensorgnome
        ## add a link in /dev/sensorgnome so the web interface can indicate
        ## this GPS is present.
        ln -f -s $GPS /dev/sensorgnome/gps.port=0.pps=1.type=cape
fi

systemctl restart chrony
sleep 1
systemctl restart gpsd.service
