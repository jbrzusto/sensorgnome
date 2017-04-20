/*
  implement a plan for a sensor; this can be a radio source
  (funcubedongle, rtlsdr) or an audio source (usbaudio).

  This object represents a plugged-in sensor and associated plan.
  As soon as it is created, it begins applying the plan.  This means:
  - issuing VAH commands to start the sensor (on whatever schedule)
  - issuing shell commands to set sensor parameters (on whatever schedule)
  - respond to "devRemoved" messages by shutting down
  - respond to "devStalled" messages by and resetting + restarting the
    device

*/

Sensor = function(matron, dev, devPlan) {
// devPlan has items:
// label: text label for output from this device
// plan: the actual plan

    this.matron = matron;
    this.dev = dev;
    this.label = devPlan.devLabel;
    this.plan = devPlan.plan;

    this.isOpen = false;
    this.numOpenRetries = 0;
    this.on = false; // is the device supposed to be on right now?
    this.lastParSetting = null;
    this.rawFiling = false;  // are we supposed to be recording raw files?

    // callback closures
    this.this_init                   = this.init.bind(this);
    this.this_initDone               = this.initDone.bind(this);
    this.this_devRemoved             = this.devRemoved.bind(this);
    this.this_devStalled             = this.devStalled.bind(this);
    this.this_setParamReply          = this.setParamReply.bind(this);
    this.this_requestSetParam        = this.requestSetParam.bind(this);
    this.this_rawFileDone            = this.rawFileDone.bind(this);

    this.matron.on("devRemoved", this.this_devRemoved);
    this.matron.on("quit", this.this_devRemoved);
    this.matron.on("devStalled", this.this_devStalled);
    this.matron.on("requestSetParam", this.this_requestSetParam);
    this.matron.on("rawFileDone", this.this_rawFileDone);

};

getSensor = function(matron, dev, devPlan) {
// factory method

    var rv;

    switch(dev.attr.type) {
    case "funcubePro":
    case "funcubeProPlus":
    case "usbAudio":
        rv = new USBAudio.USBAudio(matron, dev, devPlan);
        break;
    case "rtlsdr":
        rv = new RTLSDR.RTLSDR(matron, dev, devPlan);
        break;
    default:
        rv = null;
    }
    if (rv)
        setTimeout(rv.this_init, 250);
    return(rv);
};

Sensor.prototype.devRemoved = function(dev) {
    if (dev && dev.path != this.dev.path)
        return;
//    this.startStop("off", null, this);
    this.matron.removeListener("devRemoved", this.this_devRemoved);
    this.matron.removeListener("devStalled", this.this_devStalled);
    this.matron.removeListener("requestSetParam", this.this_requestSetParam);
    this.matron.removeListener("rawFileDone", this.this_rawFileDone);
    if (this.schedules != undefined)
        for (var i in this.schedules)
            this.schedules[i].stop();

    this.hw_delete();
    var plugins = this.plan.plugins;
    for (var i in plugins) {
        var plugin = plugins[i];
        this.matron.emit("vahSubmit", "detach " + this.getPluginLabel(plugin.letter));
    }
    this.matron.emit("vahSubmit", "close " + this.dev.attr.port);
};

Sensor.prototype.devStalled = function(vahDevLabel) {
    if (vahDevLabel = this.dev.attr.port)
        this.stalled();
};

Sensor.prototype.init = function() {
    // open (without starting) the device
    if (this.hw_init)
        this.hw_init(this.this_initDone);
    else
        console.log("Weird - got to Sensor.prototype.init with no hw_init method");
};

Sensor.prototype.initDone = function() {
    var cmd = "open " + this.dev.attr.port + " " + this.hw_devPath() + " " + this.plan.rate + " " + this.plan.channels;
    this.matron.emit("vahSubmit", cmd, this.vahOpenReply, this);
};

Sensor.prototype.vahOpenReply = function (reply, self) {
    if (reply.error) {
        // schedule a retry on this device (every 10 seconds up to 10 times)
        if (++self.numOpenRetries < 10) {
            setTimeout (self.this_init, 10000);
        } else {
            self.matron.emit("bad", "Unable to open VAH device: " + JSON.stringify(self.dev));
        }
        return;
    }
    self.isOpen = true;

    // if any schedules exist (because device was restarted, e.g.),
    // don't set them up again.

    if (self.schedules === undefined) {
        // create schedules for the device and its parameters
        self.schedules = [];

        // a schedule for each device parameter
        var dp = self.plan.devParams;
        for (var i in dp) {
            // create a callback to set the specific parameter
            // to a value created in the schedule's state
            self.schedules.push(Schedule.Make(dp[i].schedule, self.setParam, {self: self, par: dp[i].name}));
        };
        self.setupDevSchedule(self);
    }
    var plugins = self.plan.plugins;
    for (var i in plugins) {
        var plugin = plugins[i];
        var pluginParams = "";
        for (var p in plugin.params)
	    pluginParams += " " + plugin.params[p].name + " " + plugin.params[p].value;

	// create a command for vamp-alsa-host to attach this plugin to the device

        self.matron.emit("vahSubmit", Util.format("attach %d %s %s %s %s%s", self.dev.attr.port, self.getPluginLabel(plugin.letter), plugin.library, plugin.name, plugin.outputID, pluginParams), self.vahAttachReply, {self:self, i:i});
    }
};

Sensor.prototype.getPluginLabel = function(letter) {
    // for now, we assume only one plugin per port and just label
    // everything with the devLabel, which is "pX" (X = USB hub port
    // number) in the default deployment
    if (letter != undefined)
        return letter + this.label.substr(1);
    return this.label;
};

Sensor.prototype.vahAttachReply = function (reply, pars) {

    var self = pars.self, pno=pars.i, plugin = self.plan.plugins[pno];
    if (reply.error) {
        self.matron.emit("bad", "Error: " + reply.error + "\n so I'm unable to attach plugin " + plugin.library + ":" + plugin.name + ":" + plugin.outputID + " to " + JSON.stringify(self.dev));
    } else {
        self.matron.emit("vahAccept", self.getPluginLabel(plugin.letter));
    }

};

Sensor.prototype.setupDevSchedule = function(self) {
    // set up a schedule for the device itself

    self.schedules.push(Schedule.Make(self.plan.schedule, self.startStop, self));

    // check for whether we're to output raw data

    var raw = self.plan.raw;
    if (raw && raw.enabled) {
        self.frames = raw.chunkMinutes * 60 * self.plan.rate;
        self.rawFiling = true;
    }

    // start all schedules
    for (var i in self.schedules)
        self.schedules[i].start();

};

Sensor.prototype.ignore = function(reply) {
    // nil function for ignoring vah server reply
};

Sensor.prototype.startStopRawFiler = function(start) {
    // if we're not on, don't try to write a file
    if (! this.rawFiling)
        return;
    if (start) {
        timestamp = new Date().getTime() / 1000.0
        cmd = "rawFile " + this.dev.attr.port + " " + this.plan.rate + " "
            + this.frames + " 1 " + "\"" + DataSaver.getStream(DataSaver.getRelPath(this.dev.attr.port, "%"), ".wav", true) + "\"";
    } else {
        cmd = "\nrawFileOff " + this.dev.attr.port;
    }
    this.matron.emit("vahSubmit", cmd, this.ignore);
};

Sensor.prototype.rawFileDone = function(devLabel, msg) {
    if (this.dev.attr.port == devLabel) {
        this.startStopRawFiler(true);
    }
};

Sensor.prototype.startStop = function(newState, oldState, self) {
    self.on = (newState == "on");
    if (!self.on) {
        clearTimeout(self.restartTimeout);
        self.restartTimeout = null;
    }
    var cmd = (self.on ? "start " : "stop ") + self.dev.attr.port;
    self.startStopRawFiler(self.on);
    self.hw_startStop(self.on);
    self.matron.emit("vahSubmit", cmd, self.startStopReply, self);
};

Sensor.prototype.startStopReply = function(reply, self) {
    if (reply.error)
        self.matron.emit("warning", "In trying to start/stop device, got: " + reply.error);
};

Sensor.prototype.stalled = function() {
    // call subclass function
    this.hw_stalled();
};

Sensor.prototype.requestSetParam = function(req) {
    // req has items port, par, val
    // only act if this message is for us
    if (req.port != this.dev.attr.port)
        return;
    this.setParam(req.val, this.lastParSetting.val, {self:this, par:req.par});
};

Sensor.prototype.setParam = function(newState, oldState, extra) {
    // set a parameter, with callback setParamReply
    var self = extra.self;
    var par = extra.par;
    var parSetting = {time:(new Date()).getTime()/1000, par: par, val: newState, port:self.dev.attr.port};
    self.lastParSetting = Util._extend({}, parSetting);
    self.hw_setParam(parSetting, self.setParamReply.bind(self, parSetting));
};

Sensor.prototype.setParamReply = function(parSetting, code, stdout, stderr) {
    // stdout is ignored.
    if ( (!code) || (! code.code)) {
        parSetting.errCode = 0;
        parSetting.err = "";
    } else {
        parSetting.errCode = code;
        parSetting.err = stderr;
    };
    this.matron.emit("setParam", parSetting);
};

exports.Sensor = Sensor;
exports.getSensor = getSensor;
