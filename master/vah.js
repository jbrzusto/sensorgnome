/*
  
  vah.js - maintain a running instance of vamp-alsa-host and communicate
  with it.

  vamp-alsa-host accepts commands and sends replies over a unix domain
  connection.  It also outputs data from plugins or raw devices over a
  unix domain connection.

*/

VAH = function(matron, prog, sockName) {
 
    this.matron = matron;
    this.prog = prog;
    this.sockName = sockName;
    this.sockPath = "/tmp/" + sockName;
    this.cmdSock = null; // control socket
    this.dataSock = null; // data socket
    this.child = null; // child process
    this.replyHandlerQueue = []; // list of reply handlers in order of commands being sent out
                                 // each handler is an object with these fields:
                                 // callback: function(reply, par) to call with reply and extra parameter
                                 // par:  extra parameter for callback
                                 // n: number of times to use this handler
  
    this.commandQueue = []; // list of commands queued before command connection is established
    this.replyBuf = "";
    this.quitting = false;
    this.inDieHandler = false;
    this.connectCmdTimeout = null;
    this.connectDataTimeout = null;

    // callback closures
    this.this_childDied        = this.childDied.bind(this);
    this.this_cmdSockConnected = this.cmdSockConnected.bind(this);
    this.this_connectCmd       = this.connectCmd.bind(this);
    this.this_connectData      = this.connectData.bind(this);
    this.this_doneReaping      = this.doneReaping.bind(this);
    this.this_gotCmdReply      = this.gotCmdReply.bind(this);
    this.this_gotData          = this.gotData.bind(this);
    this.this_quit             = this.quit.bind(this);
    this.this_serverReady      = this.serverReady.bind(this);
    this.this_cmdSockProblem   = this.cmdSockProblem.bind(this);
    this.this_dataSockProblem  = this.dataSockProblem.bind(this);
    this.this_spawnChild       = this.spawnChild.bind(this);
    this.this_vahAccept        = this.vahAccept.bind(this);
    this.this_vahSubmit        = this.vahSubmit.bind(this);

    matron.on("quit", this.this_quit);
    matron.on("vahSubmit", this.this_vahSubmit);
    matron.on("vahAccept", this.this_vahAccept);

    this.reapOldVAHandSpawn();
}


VAH.prototype.childDied = function(code, signal) {
//    console.log("VAH child died\n")
    if (this.inDieHandler)
        return;
    this.inDieHandler = true;
    if (this.cmdSock) {
        this.cmdSock.destroy();
        this.cmdSock = null;
    }
    if (this.dataSock) {
        this.dataSock.destroy();
        this.dataSock = null;
    }
    if (! this.quitting)
        setTimeout(this.this_spawnChild, 5000);
    if (this.connectCmdTimeout) {
        clearTimeout(this.connectCmdTimeout);
        this.connectCmdTimeout = null;
    }
    if (this.connectDataTimeout) {
        clearTimeout(this.connectDataTimeout);
        this.connectDataTimeout = null;
    }
    this.inDieHandler = false;
    this.matron.emit("VAHdied")
};

VAH.prototype.reapOldVAHandSpawn = function() {
    ChildProcess.execFile("/usr/bin/killall", ["-KILL", "vamp-alsa-host"], null, this.this_doneReaping);
};

VAH.prototype.doneReaping = function() {
    this.spawnChild();
};

VAH.prototype.spawnChild = function() {
    if (this.quitting)
        return;
    this.cmdSock = null;
//    console.log("VAH about to spawn child\n");
    var child = ChildProcess.spawn(this.prog, ["-q", "-s", this.sockName]);
    child.on("exit", this.this_childDied);
    child.on("error", this.this_childDied);
    child.stdout.on("data", this.this_serverReady);
    this.child = child;
};


VAH.prototype.cmdSockConnected = function() {
    // process any queued command
    while (this.commandQueue.length) {
//        console.log("VAH about to submit queued: " + this.commandQueue[0] + "\n");
        this.cmdSock.write(this.commandQueue.shift());
    }
};

VAH.prototype.serverReady = function(data) {
    this.child.stdout.removeListener("data", this.this_serverReady);
    this.connectCmd();
    this.connectData();
    this.matron.emit("VAHstarted");
};

VAH.prototype.connectCmd = function() {
    // server is listening for connections, so connect
    if (this.cmdSock) {
        return;
    }
//    console.log("about to connect command socket\n")
    this.cmdSock = Net.connect(this.sockPath, this.this_cmdSockConnected);
    this.cmdSock.on("error" , this.this_cmdSockProblem);
//    this.cmdSock.on("end"   , this.this_cmdSockProblem);
//    this.cmdSock.on("close" , this.this_cmdSockProblem);
    this.cmdSock.on("data"  , this.this_gotCmdReply);
};

VAH.prototype.connectData = function() {
    if (this.dataSock) {
        return;
    }
//    console.log("about to connect data socket\n")
    this.dataSock = Net.connect(this.sockPath, function() {});
    
    this.dataSock.on("error" , this.this_dataSockProblem);
//    this.dataSock.on("end"   , this.this_dataSockProblem);
//    this.dataSock.on("close" , this.this_dataSockProblem);
    this.dataSock.on("data"  , this.this_gotData);
}

VAH.prototype.cmdSockProblem = function(e) {
//    console.log("Got command socket problem " + e.toString() + "\n");
    if (this.cmdSock) {
        this.cmdSock.destroy();
        this.cmdSock = null;
    }
    if (this.quitting || this.inDieHandler)
        return;
    setTimeout(this.this_connectCmd, 5001);
};

VAH.prototype.dataSockProblem = function(e) {
//    console.log("Got data socket problem " + e.toString() + "\n");
    if (this.dataSock) {
        this.dataSock.destroy();
        this.dataSock = null;
    }
    if (this.quitting || this.inDieHandler)
        return;
    setTimeout(this.this_connectData, 5001);
};


VAH.prototype.vahSubmit = function (cmd, callback, callbackPars) {
    // add the callback to the reply queue and
    // issue the command; if there are multiple commands, send all
    // replies to the callback with a single call.
    // Also, if callback is null, the command is assumed not to return
    // a reply.

    if (!Array.isArray(cmd))
        cmd = [cmd];
    if (callback)
        this.replyHandlerQueue.push({callback: callback, par: callbackPars});
    if (this.cmdSock) {
//        console.log("VAH about to submit: " + cmd + "\n");
        for (var i in cmd)
            this.cmdSock.write(cmd[i] + '\n');
    } else {
//        console.log("VAH about to queue: " + cmd + "\n");
        for (var i in cmd)
            this.commandQueue.push(cmd + '\n');
    }
};


VAH.prototype.gotCmdReply = function (data) {
    // vamp-alsa-host replies are single JSON-formatted strings on a single line ending with '\n'
    // if multiple commands are submitted with a single call to vahSubmit,
    // their replies are returned in an array with a single call to the callback.
    // Otherwise, the reply is sent bare (i.e. not in an array of 1 element).

    this.replyBuf += data.toString();
    for(;;) {
	var eol = this.replyBuf.indexOf("\n");
	if (eol < 0)
	    break;
        var replyString = this.replyBuf.substring(0, eol);
	this.replyBuf = this.replyBuf.substring(eol + 1);

//        console.log("VAH replied: " + replyString + "\n");
	var reply = JSON.parse(replyString);

        if (reply.async) {
            // if async field is present, this is not a reply to a command
            this.matron.emit(reply.event, reply.devLabel, reply);
        } else {
            // deal with the new reply
            var handler = this.replyHandlerQueue.shift();
            
            if (!handler) 
                continue;
            if (handler.callback)
                handler.callback(reply, handler.par);
        }
    }
};

VAH.prototype.vahAccept = function(pluginLabel) {
    // indicate that VAH should accept data from the specified plugin
    if (this.dataSock) {
//        console.log("VAH about to do receive " + pluginLabel + "\n");
        this.dataSock.write("receive " + pluginLabel + "\n");
    }
};

VAH.prototype.gotData = function(data) {
    this.matron.emit("vahData", data);
};

VAH.prototype.quit = function() {
    this.quitting = true;
    this.child.kill("SIGKILL");
    };

VAH.prototype.getRawStream = function(devLabel, rate, doFM) {
    // return a readableStream which will produce raw output from the specified device, until the socket is closed

    var rawSock = Net.connect(this.sockPath, function(){});
    rawSock.stop = function() {rawSock.write("rawStreamOff " + devLabel + "\n"); rawSock.destroy();}

    rawSock.start = function() {rawSock.write("rawStream " + devLabel + " " + rate + " " + doFM + "\n")};
    return rawSock;
};
    
exports.VAH = VAH;
