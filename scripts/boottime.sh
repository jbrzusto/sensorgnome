#!/bin/bash
#
# boot-time tasks for Sensor Gnome (for debian 7.0 armhf)
#
# These must be run before network interfaces are brought up!
# This script is linked from /etc/rcS.d, before networking.

# ensure we have /dev/sensorgnome, whose existence is required
# for the master process to work.  It is automatically created
# when USB devices are attached, but otherwise would not exist,
# so we make sure to do that here.  Moreover, we make sure
# to create a usb subdirectory, so that even if every device
# is removed, the /dev/sensorgnome directory does not disappear,
# which would break hubman.js's Fs.watch() of it.

mkdir -p /dev/sensorgnome/usb

# make sure we have a link that points back to the FAT partition's
# SG subfolder

pushd /media
ln -s /dev/sdcard SD_card
popd

# export gpio pins for use with the adafruit pushbutton LED switch
# (see ../overlays/Makefile)

cd /sys/class/gpio
echo 17 > export
echo out > gpio17/direction
echo 0 > gpio17/value
echo 18 > export
echo 1 > gpio18/active_low

# make sure serial number-hostname for local host is in /etc/hosts
sed -i /etc/hosts -e "/127.0.0.1[ \t]\+localhost/s/^.*$/127.0.0.1\tlocalhost `hostname`/"

# if a file called /boot/GESTURES.TXT exists, then disable WiFi at
# boot time.  This should have no effect on the Pi2, unless you plug
# in a WiFi dongle, in which case, who knows.

if [[ -f /boot/GESTURES.TXT ]]; then
    systemctl stop hostapd
    ifdown wlan0
else
    ifup wlan0
    systemctl start hostapd
fi

# make sure the DOS boot partition of the boot SD disk (internal flash
# disk or microSD card on beaglebone black; microSD card on beaglebone white)
# is mounted at /mnt/boot


read BB_ID < /etc/beaglebone_id
# - increment the persistent bootcount in /etc/bootcount

BOOT_COUNT_FILE="/etc/bootcount"
if [[ -f $BOOT_COUNT_FILE ]]; then
    COUNT=`cat $BOOT_COUNT_FILE`;
    if [[ "$COUNT" == "" ]]; then
        COUNT=0;
    fi
    echo $(( 1 + $COUNT )) > $BOOT_COUNT_FILE
else
    echo 1 > $BOOT_COUNT_FILE
fi

# - delete any empty unmounted directores named /media/disk_portX.Y
#   These might be leftover from previous boots with disks plugged
#   into different slots.  As a failsafe, if the directory isn't
#   empty, we don't delete (since we're using rmdir) - the folder
#   might contain real data.

for dir in /media/disk*port*; do
    if ( ! ( mount -l | grep -q " on $dir " ) ); then
        if [ "$(ls -A $dir 2> /dev/null)" == "" ]; then
            rmdir $dir
        fi
    fi
done

# - delete stale udhcpd leases file - else connection from a USB-connected
#   computer might fail since we only allow a single lease.

rm -f /var/lib/misc/udhcpd.leases

# force write to disk
sync

# maybe set the system clock from the RTC
/home/pi/proj/sensorgnome/scripts/maybe_get_clock_from_rtc.sh

# maybe do a software update
/home/pi/proj/sensorgnome/scripts/update_software.sh

# if there's a network.txt file on the boot drive, read the essid and pass phrase
if [[ -f /boot/uboot/network.txt ]]; then
    /home/pi/proj/sensorgnome/scripts/getnetwork
fi

# If this SG is not yet registered, then add an appropriate entry to
# the system crontab vi /etc/cron.d
# Successful registration will delete that file.

UNIQUE_KEY_FILE=/home/pi/.ssh/id_dsa

if [[ ! -f $UNIQUE_KEY_FILE ]]; then
    echo '* * *    *   *   root  /home/pi/proj/sensorgnome/scripts/register_sg' > /etc/cron.d/register_sg
fi
