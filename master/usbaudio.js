/*
  implement a plan for a usbaudio device

  This object represents a plugged-in usb audio device and associated plan.
  As soon as it is created, it begins applying the plan.  This means:
  - issuing VAH commands to start the device (on whatever schedule)
  - issuing shell commands to set device parameters (on whatever schedule)
  - respond to "devRemoved" messages by shutting down
  - respond to "devStalled" messages by and resetting + restarting the
    device

*/

USBAudio = function(matron, dev, devPlan) {
// devPlan has items:
// label: text label for output from this device
// plan: the actual plan

    Sensor.Sensor.call(this, matron, dev, devPlan);
    if(dev.attr.type.match(/funcube/)) {
        this.command = "/usr/bin/fcd";
        this.baseArgs = ["-p", dev.attr.usbPath];
    } else {
        this.command = null;
    }
    this.paramNameTable = this.paramNameTables[dev.attr.type];
};

USBAudio.prototype = Object.create(Sensor.Sensor.prototype);
USBAudio.prototype.constructor = USBAudio;

USBAudio.prototype.paramNameTables = {
    funcubeProPlus:
    {
        // options to the fcd parameter setting program for FCD Pro +
        frequency:  "-m",
        lna_gain:   ["-w", "0x00"],
        rf_filter:  ["-w", "0x03"],
        mixer_gain: ["-w", "0x04"],
        if_gain:    ["-w", "0x07"],
        if_filter:  ["-w", "0x0c"],
        bias_tee:   ["-w", "0x10"]
    },

    funcubePro:
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
    }
};

USBAudio.prototype.hw_devPath = function() {

    // the device path known by vamp-alsa-host/DevMinder
    // looks like hw:ALSADEV

    return "hw:" + this.dev.attr.alsaDev;
};

USBAudio.prototype.hw_init = function(callback) {
    // nothing to do for usbaudio; handled by VAH
// DEBUG:    console.log("usbaudio: hw_init\n");
    callback();
};

USBAudio.prototype.hw_delete = function() {
    // nothing to do for usbaudio; handled by VAH
};

USBAudio.prototype.translateParamName = function(name) {
    // convert parameter name to something appropriate for the
    // command-line parameter setting program by looking it up
    // in paramNameTable.  If not found, leave name as-is.

    if (this.paramNameTable)
        return this.paramNameTable[name] || name;
    return name;
};


USBAudio.prototype.hw_startStop = function(on) {
    // nothing needed here, as VAH starts/stops USB audio devices
};

USBAudio.prototype.hw_stalled = function() {
    // reset this device
    if (this.command) {
	console.log("got to hw_stalled\n");
        ChildProcess.execFile(this.command, this.baseArgs.concat("-R"));
    }
    var dev = JSON.parse(JSON.stringify(this.dev));
    // re-add after 5 seconds
    setTimeout(function(){TheMatron.emit("devAdded", dev)}, 5000);
    // remove now
    this.matron.emit("devRemoved", this.dev);
};


USBAudio.prototype.hw_setParam = function(parSetting, callback) {
    var parName = this.translateParamName(parSetting.par);
    ChildProcess.execFile(this.command,
                          this.baseArgs.concat(parName, parSetting.val),
                          callback);
};

exports.USBAudio = USBAudio;
