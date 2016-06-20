/*
  tagfinder.js: manage a tagfinder child process, sending it vahData and setParam messages, then
  emitting gotTag messages.
*/

function TagFinder(matron, prog, tagFile, params) {
    this.matron = matron;
    this.prog = prog;
    this.tagFile = tagFile;
    this.params = params || [];
    this.child = null;
    this.quitting = false;
    this.inDieHandler = false;
    this.this_spawnChild    = this.spawnChild.bind(this);
    this.this_quit          = this.quit.bind(this);
    this.this_childDied     = this.childDied.bind(this);
    this.this_gotInput      = this.gotInput.bind(this);
    this.this_gotParamInput = this.gotParamInput.bind(this);
    this.this_gotOutput     = this.gotOutput.bind(this);
    matron.on("quit", this.this_quit);
};

TagFinder.prototype.ignore = function() {
    // for ignoring errors on child process stdio, since these just
    // precede death of the child process
};

TagFinder.prototype.start = function() {
    this.spawnChild();
};

TagFinder.prototype.quit = function() {
    if (this.child) {
        this.quitting = true;
        this.child.kill("SIGKILL");
    }
};

TagFinder.prototype.childDied = function(code, signal) {
    if (! this.inDieHandler) {
        this.inDieHandler = true;
        this.matron.removeListener("vahData", this.this_gotInput);
        this.matron.removeListener("setParam", this.this_gotParamInput);
        if (! this.quitting) {
            setTimeout(this.this_spawnChild, 30000);
        }
        this.inDieHandler = false;
    }
};

TagFinder.prototype.spawnChild = function() {
    if (this.quitting)
        return;

    var child = ChildProcess.spawn(this.prog, this.params.concat("-c", "8", this.tagFile))
        .on("exit", this.this_childDied)
        .on("error", this.this_childDied);
        
    child.stdout.on("data", this.this_gotOutput);
    child.stdout.on("error", this.ignore);
    child.stdin.on("error", this.ignore);

    this.child = child;
    this.matron.on("vahData", this.this_gotInput);
    this.matron.on("setParam", this.this_gotParamInput);
};

TagFinder.prototype.gotInput = function(x) {
    try {
        this.child.stdin.write(x.toString());
    } catch(e) {};
};

TagFinder.prototype.gotParamInput = function(s) {
    if (s.par != '-m')
        return;
    try {
        this.child.stdin.write("S," + s.time + "," + s.port + "," + s.par + "," + s.val + "," + s.errCode + "," + s.err + "\n");
    } catch(e) {};
};

TagFinder.prototype.gotOutput = function(x) {
    this.matron.emit("gotTag", x.toString());
};

exports.TagFinder = TagFinder;
