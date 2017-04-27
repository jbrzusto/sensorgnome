/*
  matron.js: provide a global object through which all events are routed
  (event listeners are registered here, and events are emitted from here).
  This way, if an Event Emitter must be recreated (e.g. after its child
  process dies), listener registration is preserved.

*/

Matron = function() {
    var self = this;
    this.devices = {};

    // callback closures
    this.this_devAdded = this.devAdded.bind(this);
    this.this_devRemoved = this.devRemoved.bind(this);
    this.this_VAHdied = this.VAHdied.bind(this);

    this.on("devAdded", this.this_devAdded);
    this.on("devRemoved", this.this_devRemoved);
    this.on("bad", function(msg) {console.log(msg + "\n");});
    this.on("VAHdied", this.this_VAHdied);
};

Util.inherits(Matron, Events.EventEmitter);

Matron.prototype.devAdded = function(dev) {
//DEBUG: console.log("Got devAdded " + JSON.stringify(dev) + "\n");
    var devPlan = Deployment.lookup(dev.attr.port, dev.attr.type);
    if (devPlan) {
//DEBUG: console.log("Got plan " + JSON.stringify(devPlan));
        this.devices[dev.attr.port] = Sensor.getSensor(this, dev, devPlan);
    }
};

Matron.prototype.devRemoved = function(dev) {
//DEBUG: console.log("Got devRemoved " + JSON.stringify(dev) + "\n");
    if (this.devices[dev.attr.port]) {
        this.devices[dev.attr.port] = null;
    };
};

Matron.prototype.VAHdied = function() {
    // destroy device objects, since device server has died
    this.devices.length = 0;
};

exports.Matron = Matron;
