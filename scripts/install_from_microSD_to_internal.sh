#!/bin/bash

cd /home/bone/proj/bonedongle/scripts

if [[ "$1" != "" ]]; then
    TARGET_BOOT_DEV=$1
else
    TARGET_BOOT_DEV=/dev/mmcblk1p1
fi;

if [[ "$2" != "" ]]; then
    TARGET_ROOT_DEV=$2
else
    TARGET_ROOT_DEV=/dev/mmcblk1p2
fi;

umount $TARGET_BOOT_DEV
umount $TARGET_ROOT_DEV

TARGET_BOOT_DIR=/tmp/intboot
TARGET_ROOT_DIR=/tmp/introot

mkdir $TARGET_ROOT_DIR
mkdir $TARGET_BOOT_DIR

mount -t vfat $TARGET_BOOT_DEV $TARGET_BOOT_DIR
mount -t ext4 $TARGET_ROOT_DEV $TARGET_ROOT_DIR

SOURCE_BOOT_DIR=/boot/uboot

read -d "," SOURCE_VERSION < $SOURCE_BOOT_DIR/SENSORGNOME_VERSION.TXT
read -d "," TARGET_VERSION < $TARGET_BOOT_DIR/SENSORGNOME_VERSION.TXT

# KLUDGE: text comparison of timestamps with decimal portion.
# Relies on number of integer digits staying the same.
# Will fail in the year 2286 CE.

if [[ "$TARGET_VERSION" != "" && "$TARGET_VERSION">="$SOURCE_VERSION" ]]; then
    umount $TARGET_BOOT_DIR
    umount $TARGET_ROOT_DIR
    echo INSTALLATION CANCELLED - resuming normal operation.
    echo Note: you are using a micro SD card with the operating system on it
    echo as a data disk in a beaglebone black.  This is okay, but you are
    echo not getting the full amount of storage that would be available if you
    echo used a micro SD card with only a single partition formatted as DOS VFAT.
    exit 1
fi

PRESERVE_FILES="deployment.txt plan.json network.txt SG_tag_database.sqlite SG_tag_database.csv"
for f in $PRESERVE_FILES; do
    if [[ -f "$TARGET_BOOT_DIR/$f" ]]; then
        cp -f "$TARGET_BOOT_DIR/$f" /tmp/$f
    fi
done

echo ABOUT TO START COPYING TO DRIVES $TARGET_BOOT_DEV and $TARGET_ROOT_DEV
echo Hit break or power down to abort.

./led_alert.sh

# wait for 10 seconds to allow user to abort
sleep 10

# set led crawling pattern
./led_crawl.sh

if [[ ! -f $TARGET_ROOT_DIR/fastbootalways ]]; then
    umount $TARGET_BOOT_DEV
    umount $TARGET_ROOT_DEV
    mkfs -t vfat $TARGET_BOOT_DEV
    mkfs -t ext4 $TARGET_ROOT_DEV
    mount -t vfat $TARGET_BOOT_DEV $TARGET_BOOT_DIR
    mount -t ext4 $TARGET_ROOT_DEV $TARGET_ROOT_DIR
fi

# backup everything except the version file; that is done last separately, so
# that its value confirms all other files have already been sync'd.
# This means an interrupted sync (e.g. power shut off while updating)
# won't prevent a full sync on next boot.

rsync -acv --exclude "SENSORGNOME_VERSION.TXT" $SOURCE_BOOT_DIR/ $TARGET_BOOT_DIR/

rsync -acv --exclude "/etc/bootcount" --exclude "/home/bone/.ssh/id_dsa.pub" --exclude "/home/bone/.ssh/id_dsa" --exclude "/home/bone/.ssh/authorized_keys" --exclude "/home/bone/.ssh/tunnel_port" --delete --exclude "/media/**" --exclude "/var/log/**" --exclude "/tmp/**" --exclude "/proc/**" --exclude "/sys/**" --exclude "/run/**" --exclude "/dev/pts/**" --exclude "$SOURCE_BOOT_DIR/**" / $TARGET_ROOT_DIR/

mkdir $TARGET_ROOT_DIR/media/internal_SD_card

# copy back any files to be preserved
for f in $PRESERVE_FILES; do
    if [[ -f "/tmp/$f" ]]; then
        cp -f "/tmp/$f" "$TARGET_BOOT_DIR/$f"
    fi
done

sync

# This file saved until the end so that if its contents are up to date,
# that implies all other files have been updated.

cp $SOURCE_BOOT_DIR/SENSORGNOME_VERSION.TXT $TARGET_BOOT_DIR

sync

umount $TARGET_BOOT_DIR
umount $TARGET_ROOT_DIR
rmdir $TARGET_BOOT_DIR $TARGET_ROOT_DIR

# set led steady pattern
./led_steady.sh

# wait for user to hit Enter
# as a failsafe, in case user leaves card installed without repowering
# and is expecting BBB to operate as it normally would after a reboot,
# wait only 10 minutes and then proceed as if a reboot had occurred.
# except don't reset LEDs so in the situation where a unit is left
# for a long time when imaging, the user will see that it has finished.

echo DONE - HIT ENTER TO RESTORE LEDS TO NORMAL

read -t 600 x
