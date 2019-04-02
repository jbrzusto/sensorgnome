/*

  uploader.js - a singleton class for uploading data to a server via
  an internet connection

  requires global: Machine

*/


function Uploader(matron) {

    this.matron = matron;
    this.prog = "/bin/nc";
    this.prog_args = [
        "localhost",
        "59024"
    ];

    this.child = null;
    this.quitting = false;
    this.inDieHandler = false;
    this.lineBuf = "";

    // callback closures
    this.this_spawnChild      = this.spawnChild.bind(this);
    this.this_quit            = this.quit.bind(this);
    this.this_childDied       = this.childDied.bind(this);
    this.this_pushTag         = this.pushTag.bind(this);
    this.this_pushDevAdded    = this.pushDevAdded.bind(this);
    this.this_pushDevRemoved  = this.pushDevRemoved.bind(this);
    this.this_pushGPSFix      = this.pushGPSFix.bind(this);
    this.this_pushSetParam    = this.pushSetParam.bind(this);
    this.this_pushGPSSetClock = this.pushGPSSetClock.bind(this);

    matron.on("quit", this.this_quit);

};

Uploader.prototype.ignore = function() {
    // for ignoring errors on child process stdio, since these just
    // precede death of the child process
};

Uploader.prototype.start = function() {
    this.spawnChild();
};

Uploader.prototype.quit = function() {
    this.quitting = true;
    if (this.child)
        this.child.kill("SIGKILL");
};

Uploader.prototype.childDied = function(code, signal) {
    if (! this.inDieHandler) {
        this.inDieHandler = true;
        this.matron.removeListener('gotGPSFix'  , this.this_pushGPSFix);
        this.matron.removeListener('gotTag'     , this.this_pushTag);
        this.matron.removeListener('setParam'   , this.this_pushSetParam);
        this.matron.removeListener('devAdded'   , this.this_pushDevAdded);
        this.matron.removeListener('devRemoved' , this.this_pushDevRemoved);
        this.matron.removeListener("gpsSetClock", this.this_pushGPSSetClock);
        if (! this.quitting) {
            setTimeout(this.this_spawnChild, 30000);
        }
        this.inDieHandler = false;
    }
};

Uploader.prototype.spawnChild = function() {
    if (this.quitting)
        return;

    this.child = ChildProcess.spawn(this.prog, this.prog_args, {env: process.env});
    this.child.on("exit", this.this_childDied);
    this.child.on("error", this.this_childDied);
    this.child.stdout.on("error", this.ignore)
    this.child.stdin.on("error", this.ignore)
    this.matron.on('gotGPSFix'  , this.this_pushGPSFix);
    this.matron.on('gotTag'     , this.this_pushTag);
    this.matron.on('setParam'   , this.this_pushSetParam);
    this.matron.on('devAdded'   , this.this_pushDevAdded);
    this.matron.on('devRemoved' , this.this_pushDevRemoved);
    this.matron.on("gpsSetClock", this.this_pushGPSSetClock);
    this.pushStartupInfo();
};

Uploader.prototype.pushGPSFix = function(fix) {
    this.child.stdin.write("G," + fix.time + "," + fix.lat + "," + fix.lon + "," + fix.alt + "\n" )
};

Uploader.prototype.pushSetParam = function(s) {
    this.child.stdin.write("S," + s.time + "," + s.port + "," + s.par + "," + s.val + "," + s.errCode + "," + s.err + "\n");
};

Uploader.prototype.pushGPSSetClock = function(prec, elapsed) {
    this.child.stdin.write("C," + (new Date()).getTime() / 1000 + "," + prec + "," + elapsed + "\n");
};

Uploader.prototype.pushTag = function(s) {
    // since s comes from output of a program, there's no guarantee it
    // is broken according to lines, and generally won't be.  So we buffer
    // and deal with one line at a time.
    this.lineBuf += s.toString();
    for (;;) {
        var nl = this.lineBuf.indexOf('\n');
        if (nl < 0)
            break;
        var line = this.lineBuf.substring(0, nl - 1);
        this.lineBuf = this.lineBuf.substring(nl + 1);
        var parts = line.split(/,/);
        // parts are    port,ts,id,freq,freqsd,sig,sigsd,noise,runid,inarow,slop,burstslop,hitrate,antfreq
        //              0    1  2   3     4     5    6    7      8     9     10     11       12      13
        // we keep only port,ts,id,freq,freqsd,sig,sigsd,noise,slop,burstslop,antfreq
        // i.e. drop parts with indices 8, 9, 12
        if (parts.length == 14 && parts[0] != "ant") { // don't send header
            parts.splice(8, 2);
            parts.splice(10, 1);
            this.child.stdin.write(parts.join(",") + "\n");
        }
    }
};

Uploader.prototype.pushDevAdded = function(msg) {
    // msg has fields path, attr, stat
    var ts = (new Date()).getTime()/1000;
    this.child.stdin.write("A," + ts + "," + msg.attr.port + "," + msg.attr.type + "," + msg.path + "\n");
};

Uploader.prototype.pushDevRemoved = function(msg) {
    // msg has fields path, attr, stat
    var ts = (new Date()).getTime()/1000;
    this.child.stdin.write("R," + ts + "," + msg.attr.port + "," + msg.attr.type + "," + msg.path + "\n");
};

Uploader.prototype.pushStartupInfo = function() {
    var ts = (new Date()).getTime()/1000;
    this.child.stdin.write( "SG-" + Machine.machineID + "\n" + "M," + ts + ",machineID," + Machine.machineID + "\n" +
                            "M," + ts + ",bootCount," + Machine.bootCount + "\n");
};

exports.Uploader = Uploader;
