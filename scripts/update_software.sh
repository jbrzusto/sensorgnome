#!/bin/bash
#
# look for a file called sensorgnome_update.tgz on the boot partition.
# If found, copy it to /tmp, remove it from the boot partition,
# then extract it to the root partition.  This allows for arbitray files
# to be upgraded.

UPDATE_FILE=/boot/uboot/sensorgnome_update.tar.bz2
DISABLED_UPDATE_FILE=/boot/uboot/used_sensorgnome_update.tar.bz2
if [[ ! -f $UPDATE_FILE ]]; then
    echo No file "$UPDATE_FILE" found on DOS partition of micro SD flash.
    exit 1
fi;

cd /
tar -xhpjvf $UPDATE_FILE
rm -f $DISABLED_UPDATE_FILE
mv $UPDATE_FILE ${DISABLED_UPDATE_FILE}

## look for debian package files to be installed in /newdebs
## These should be given numeric prefixes to ensure they 
## are installed in a dependency-respecting order.

NEWDEBS_DIR=/newdebs

if [[ -d "$NEWDEBS_DIR" ]]; then
    cd $NEWDEBS_DIR
    NEWDEBS=`ls -1 *.deb`
    for DEB in $NEWDEBS; do
        dpkg -i ./$DEB && rm -f ./$DEB
    done
fi;

echo Software Update Successful.
echo You may want to restart the master process, or reboot the sensorgnome.

exit 0

