/*
  implement a plan for a funcube device

  This object represents a plugged-in funcube and associated plan.
  As soon as it is created, it begins applying the plan.  This means:
  - issuing VAH commands to start the funcube (on whatever schedule)
  - issuing shell commands to set funcube parameters (on whatever schedule)
  - respond to "devRemoved" messages by shutting down
  - respond to "devStalled" messages by and resetting + restarting the
    device

*/

Funcube = function(matron, dev, plan) {
    this.matron = matron;
    this.dev = dev;
    this.plan = plan;
    this.command = "/usr/bin/fcd";
    this.baseArgs = ["-p", dev.attr.usbPath];
    this.isOpen = false;

    var self=this;
    matron.on("devRemoved", 
              function(dev) {
                  if (dev.path == self.dev.path)
                      self.startStop("off", null, );
              });

    matron.on("devStalled",
              function(dev) {
                  if (dev.path == self.dev.path)
                      self.stalled();
              });

    self.init();
};

Funcube.prototype.init = function() {
    // create schedules from the plan and run them

    // a schedule for each device parameter
    var dp = this.plan.devParams;
    this.schedules = [];
    for (var i in dp) {
        // create a callback to set the specific parameter
        // to a value created in the schedule's state
        this.schedules.push(Schedule.Make(dp[i].schedule, self.setParam, dp[i].name));
    };

    // a schedule for the device itself
    this.schedules.push(Schedule.Make(this.plan.schedule, self.startStop));

    for (var i in this.schedules)
        this.schedules[i].start();

    matron.emit("VAHopenDevice", this.dev.attr.port, "hw:" + this.dev.attr.alsaDev, this.plan.hwRate, this.plan.channels);

};

Funcube.prototype.startStop = function(newState, oldState, listenerParams) {
    matron.emit("VAHStartStopDevice", this.dev.attr.port)
};

Funcube.prototype.stalled = function() {
    // reset this device
    ChildProcess.execFile(this.command, this.baseArgs.concat("-R"));
};
    
Funcube.prototype.setParam = function(newState, oldState, listenerParams) {
    ChildProcess.execFile(this.command, 
                          this.baseArgs.concat(listenerParams).concat(listenerParms).concat(newState),
                          this.matron.gotSetParam);
                          
};
    

exports.Funcube = Funcube;
