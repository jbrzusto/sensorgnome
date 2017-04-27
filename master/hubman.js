/*

  USB Hub manager

  Handle devices as they appear or disappear from a specified
  directory by emitting events.  Anyone interested in the devices
  can register a listener on the device manager for relevant events.

  Devices have names like "funcubePro.port=3.alsaDev=2.usbPath=1:22"
  where "." separates the device type and attributes settings
  so that in this example:
    - the device type is "funcubePro"
    - the usb port is 3
    - the ALSA device number is 2
    - the USB path is 1:22 (bus 1, device #22); this is as required by libusb

  This hub manager ignores any devices without the "port=X" attribute.

  Note that these device names are symlinks in special directory
  created by udev rules; e.g. /dev/sensorgnome.  That directory is
  meant to include only devices which we recognize and make visible to
  end users.

  Other objects can force the device manager to emit an event by
  calling its "emit" method.

  Events emitted
  ==============

  Events have a name, and the object sent with them has associated
  properties.

  "devAdded":  a device has been plugged into a USB port
   arg is:
   {
     path: full path to device symlink
     attr: list of attribute settings.  Following the example above,
           this would be {type:"funcubePro", port:3, alsaDev:2, usbPath:"1:22"}
     stat: filesystem stat object
     }

  "devRemoved" : a device has been removed from a USB port
  arg is:
    {
     path: full path to device symlink
     attr: as for "devAdded"
     stat: filesystem stat object (from when device was first detected)
     }

*/

HubMan = function(matron, root) {

    var devs = {}; // port-number-indexed map of devices and their properties

    attrOf = function(filename) {
        // return the attributes
        var parts = filename.split('.');
        attr = {type:parts[0]};
        for (var i = 1; i < parts.length; ++i) {
            var sides = parts[i].split('=');
            attr[sides[0]] = sides[1];
        }
        return attr;
    };

    this.enumeratePreExistingDevices = function() {
        var ls = Fs.readdirSync(root);
        for (var i in ls)
            rootChanged("rename", ls[i]);
    };

    rootChanged = function(event, filename) {
        var attr = attrOf(filename);
        if (! attr.port)
            return;  // not a USB-port device - we don't care
        var port = attr.port;
        try {
            var path = root + "/" + filename;
            var stat = Fs.statSync(path);
        } catch (e) {
            // looks like the device has been removed
            // only emit a message if we already knew about this device
//            console.log("hubman.js got error: " + e.toString());
            if (devs[port]) {
                matron.emit("devRemoved", devs[port]);
                console.log("Removed " + JSON.stringify(devs[port]));
                devs[port] = null;
            }
            return;
        }
        if (! devs[port]) {
            devs[port] = {path:path, attr:attr, stat:stat};
            console.log("Added " + JSON.stringify(devs[port]));
            matron.emit("devAdded", devs[port]);
        }
    };

    // once listeners have been added to the device manager for device
    // add and remove, the "start" method should be called.
    // I think this guarantees all devices already present and any
    // detected by the OS afterwards will have events emitted for them

    this.start = function() {
        try {
            Fs.watch(root, rootChanged);
            // we assume the watch is active once Fs.watch returns, so
            // the following should guarantee an event has been emitted
            // for every device.
            enumeratePreExistingDevices();
        } catch (e) {
            // presumably we failed because /dev/sensorgnome doesn't
            // exist; wait 10 seconds for user to plug in a hub and
            // try again.
            setTimeout(this.this_start, 10000);
        };
    };

    // return a list of attached devices
    this.getDevs = function() {
        return devs;
    };

    this.VAHstarted =  function() {
        // if device server restarted, re-start all devices as appropriate
        this.enumeratePreExistingDevices();
    };

    this.VAHdied =  function() {
        // if VAH died, forget usbaudio and funcube devices; when VAH
        // restarts, we'll re-enumerate
        for (var i in devs) {
            if (devs[i] && devs[i].attr.type.match(/funcube|usbAudio|rtlsdr/)) {
                matron.emit("devRemoved", Util._extend({}, devs[i]));
                delete devs[i];
            }
        }
    };


    // callbacks
    this.this_start = this.start.bind(this);
    this.this_VAHstarted = this.VAHstarted.bind(this);
    this.this_VAHdied = this.VAHdied.bind(this);

    matron.on("VAHstarted", this.this_VAHstarted);
    matron.on("VAHdied", this.this_VAHdied);

};

exports.HubMan = HubMan;
