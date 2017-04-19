## compile and install an overlay to allow use of an LED-lit
## pushbutton switch such as:  https://www.adafruit.com/product/559
##
## We use gpio17 to power the LED, and gpio18 to read the switch.
## The overlay serves mainly to enable the internal pull-up resistor
## on gpio18, so we don't have to use an external one.

all:
	dtc -@ -I dts -O dtb -o gpio_pull-overlay.dtb gpio_pull-overlay.dts
	sudo cp gpio_pull-overlay.dtb /boot/overlays
	sudo su -c 'if ( ! grep -q dtoverlay=gpio_pull /boot/config.txt ); then printf "#load overlay for SG LED-pushbutton switch\ndtoverlay=gpio_pull\n" >> /boot/config.txt; fi'
