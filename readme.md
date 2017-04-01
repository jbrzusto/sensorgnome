## Sensorgnome Software for Beaglebone; 2017 version ##

- start with image 1e164ee34d77d87d5ceceb36024c22657e74430bd67a1800c74d257d721a8530
  from 2016-12-09 ("Alternative Debian Image Jesse IoT")

  https://debian.beagleboard.org/images/bone-debian-8.6-iot-armhf-2016-12-09-4gb.img.xz

- apt-get update
- apt-get install aptitude

### create user sg ###

adduser bone  # with password bone; becomes user 1001

### give user bone sudo privileges; remove them for user debian ###
```
visudo                   ## delete entry for debian, add following line:
bone ALL=NOPASSWD: ALL
```
### logout; login as bone ###
mkdir proj
cd proj
git clone https://github.com/jbrzusto/sensorgnome
cd sensorgnome
## convert old 'bonedongle' to 'sensorgnome'
sed -i -e "s/bonedongle/sensorgnome/g" *.js

## import udev-rules to sensorgnome.
ln -s /home/bone/proj/sensorgnome/udev-rules/usb-hub-devices.rules /etc/udev/rules.d/usb-hub-device.rules

## fix automount of USB drive in hub
   sed -i -e 's/MountFlags=slave/MountFlags=shared/' /lib/systemd/system/systemd-udevd.service
   systemctl daemon-reload
   systemctl restart udev

## TODO:

- support GPS cape
  echo BB-UART4 > /sys/devices/platform/bone_capemgr/slots
  stty -F /dev/ttyS4 raw 9600 min 0 time 50
  cat /dev/ttyS4
#but still need PPS integration into kernel?

  apt-get install gpsd gpsd-util  ## gpsd-util brings in many libs;  I just want gpsmon!
  sed -i -e 's/USBAUTO="true"/USBAUTO="false"/;s/DEVICES=""/DEVICES="\/dev\/ttyS4"/' /etc/default/gpsd

- build vamp-alsa-host, lotek-plugins.so, fcd

# turn off DNS lookup for sshd
echo UseDNS no >> /etc/ssh/sshd_config
systemctl restart sshd.service
