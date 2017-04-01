#!/bin/bash
#
# this script runs nodejs on master.js
# after that process exits, this script waits 60 seconds and retries

# before trying to use them, update any attached funcubes to use the 48 kHz firmware
# this can be prevented by including the string "NO_AUTO_FCD_UPDATE" somewhere in
# the deployment.txt file

if ! grep -q NO_AUTO_FCD_UPDATE /boot/uboot/deployment.txt; then
    /home/bone/proj/bonedongle/scripts/update_fcd_firmware
fi

/home/bone/proj/bonedongle/scripts/maintain_ssh_tunnel 

cd /home/bone/proj/bonedongle/master
export NODE_ENV=production VAMP_PATH=/home/bone/vamp NODE_PATH=/usr/local/lib/node_modules
for (( ; ; )) do
nice -n -15 /usr/bin/node ./master.js > /var/log/nodelog.txt 2>&1
sleep 60
done

