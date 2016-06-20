/*
  matron.js: provide a global object through which all events are routed
  (event listeners are registered here, and events are emitted from here).
  This way, if an Event Emitter must be recreated (e.g. after its child
  process dies), listener registration is preserved.

*/

Matron = function() {
    var self = this;
    this.devices = [];

    // callback closures
    this.this_devAdded = this.devAdded.bind(this); 
    this.this_VAHdied = this.VAHdied.bind(this);

    this.on("devAdded", this.this_devAdded);
    this.on("bad", function(msg) {console.log(msg + "\n");});
    this.on("VAHdied", this.this_VAHdied);
};

Util.inherits(Matron, Events.EventEmitter);

Matron.prototype.funcubeProPlusOptions = 
    {
        // options to the fcd parameter setting program for FCD Pro +
        frequency:  "-m",
        lna_gain:   ["-w", "0x00"],
        rf_filter:  ["-w", "0x03"],
        mixer_gain: ["-w", "0x04"],
        if_gain:    ["-w", "0x07"],
        if_filter:  ["-w", "0x0c"],
        bias_tee:   ["-w", "0x10"]
    };

Matron.prototype.funcubeProOptions = 
    {
        // options to the fcd parameter setting program for FCD Pro
        frequency:    "-m",
        lna_gain:     ["-w", "0x00"],
        lna_enhance:  ["-w", "0x01"],
        tuner_band:   ["-w", "0x02"],
        rf_filter:    ["-w", "0x03"],
        mixer_gain:   ["-w", "0x04"],
        bias_current: ["-w", "0x05"],
        mixer_filter: ["-w", "0x06"],
        if_gain1:     ["-w", "0x07"],
        if_gain_mode: ["-w", "0x08"],
        if_rc_filter: ["-w", "0x09"],
        if_gain2:     ["-w", "0x0a"],
        if_gain3:     ["-w", "0x0b"],
        if_filter:    ["-w", "0x0c"],
        if_gain4:     ["-w", "0x0d"],
        if_gain5:     ["-w", "0x0e"],
        if_gain6:     ["-w", "0x0f"]
    };

Matron.prototype.devAdded = function(dev) {
// DEBUG:    console.log("Got devAdded " + JSON.stringify(dev) + "\n");
    var devPlan = Deployment.lookup(dev.attr.port, dev.attr.type);
    if (devPlan) {
// DEBUG:        console.log("Got plan " + JSON.stringify(devPlan));
        switch(dev.attr.type) {
        case "funcubePro":
            this.devices.push(new USBAudio.USBAudio(this, dev, devPlan, "/usr/bin/fcd", this.funcubeProOptions));
            break;
        case "funcubeProPlus":
            this.devices.push(new USBAudio.USBAudio(this, dev, devPlan, "/usr/bin/fcd", this.funcubeProPlusOptions));
            break;
        case "usbAudio":
            this.devices.push(new USBAudio.USBAudio(this, dev, devPlan));
            break;
        }
    }
};

Matron.prototype.VAHdied = function() {
    // destroy device objects, since device server has died
    this.devices.length = 0;
};

exports.Matron = Matron;
