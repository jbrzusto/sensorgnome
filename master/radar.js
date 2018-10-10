//  radar.js - maintain a running instance of rpcapture.js and the corresponding
//  instance of digdar on the digitizer.
//
//  this listens for the following messages on matron:
//
//   - radarStartCapture(): start radar capture
//   - radarStopCapture(): stop radar capture
//   - quit(): stop radar capture and shut down
//
//  and emits these messages:
//   - radarCaptureStarted(): no content
//   - radarCaptureStopped(): no content
//
//  On errors, the capture process is restarted after 5 seconds.

Radar = function(matron) {
    this.matron = matron;
    this.child = null; // child process
    this.shouldrun = false; // should the child be running now?
    this.quitting = false;
    this.inDieHandler = false;
    this.timeout = null;

    // callback closures
    this.this_childDied        = this.childDied.bind(this);
    this.this_quit             = this.quit.bind(this);
    this.this_startCapture     = this.startCapture.bind(this);
    this.this_stopCapture      = this.stopCapture.bind(this);
    this.this_spawnChild       = this.spawnChild.bind(this);
    this.this_handleSweep      = this.handleSweep.bind(this);
    this.this_scanConversionReady = this.scanConversionReady.bind(this);
    this.this_startDigitizer = this.startDigitizer.bind(this);

    matron.on("quit", this.this_quit);
    matron.on("radarStartCapture", this.this_startCapture);
    matron.on("radarStopCapture", this.this_stopCapture);
    matron.on("radarSweepReady", this.this_handleSweep);
    matron.on("radarCaptureReady", this.this_startDigitizer);
}

Radar.prototype.childDied = function(code, signal) {
    console.log("Radar child died: " + code);
    if (this.inDieHandler)
        return;
    this.inDieHandler = true;
    this.child = null;
    if ((! this.quitting) && this.shouldrun) {
        this.timeout = setTimeout(this.this_spawnChild, 5000);
    }
    this.matron.emit("radarCaptureStopped")
    this.inDieHandler = false;
};

Radar.prototype.spawnChild = function() {
    if (this.quitting)
        return;
    var capConfig = JSON.stringify(Deployment.radar.capture);
    console.log("About to spawn radar capture: /usr/bin/nodejs " + "./rpcapture.js" + " " + capConfig);
    var child = ChildProcess.spawn("/usr/bin/nodejs", ["./rpcapture.js", capConfig]);
    child.on("exit", this.this_childDied);
    child.on("error", this.this_childDied);
    this.child = child;
    this.matron.emit("radarCaptureStarted");
};


Radar.prototype.quit = function() {
    this.quitting = true;
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.stopCapture();
};

Radar.prototype.startCapture = function() {
    if (this.child)
        return;
    var par = Deployment.radar.scanConvert;
    this.scanConvertPar = par ? JSON.stringify(par) : null;
    this.shouldrun = true;
    this.spawnChild();
};

Radar.prototype.stopCapture = function() {
    this.shouldrun = false;
    if (this.child) {
        this.child.kill();
    }
};

Radar.prototype.handleSweep = function(path) {
    // a sweep is now available at the given path, so scan-convert
    var par = Deployment.radar.scanConvert;
    if (this.scanConvertPar)
        ChildProcess.exec("/home/pi/proj/capture/Sweep '" +  this.scanConvertPar + "'", this.this_scanConversionReady);
};

Radar.prototype.scanConversionReady = function(err, stdout, stderr) {
    console.log("finished scan conversion");
    this.matron.emit("radarImage", {meta: Deployment.radar.scanConvert.jsonfile, jpg: Deployment.radar.scanConvert.jpgfile});
};

Radar.prototype.startDigitizer = function() {
    var cnf = Deployment.radar.capture;
    var dig = cnf.digitizer;
    var cmd = `sshpass -p ${dig.password} ssh -oStrictHostKeyChecking=no ${dig.user}@${dig.host} 'killall -KILL digdar; /opt/bin/digdar -d${cnf.decim} -n${cnf.ns} -p${cnf.np} --tcp sg:${cnf.port} ${cnf.mode == "sum" ? "--sum" : ""} &'`;
    console.log(`starting digitizer using:\n${cmd}`);
    ChildProcess.exec(cmd);
};

exports.Radar = Radar;
