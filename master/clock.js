/*
  an object for talking to a simple C program that returns realtime
  and monotonic system clocks with minimal lag between them

*/

Clock = function(matron, prog, period) {
    var child = null;
    var replyBuf = "";

    period = period * 1000;

    childDied = function(code, signal) {
        setTimeout(spawnChild, period);
    };

    spawnChild = function() {
        child = ChildProcess.spawn(prog);
        child.on("exit", childDied);
        child.stdout.on("data", notify);
    };

    notify = function(x) {
        replyBuf += x.toString();
        // in case we received multiple replies, use the latest
        // one
        var reply;
        for (;;) {
            var eol = replyBuf.indexOf('\n');
            if (eol == replyBuf.length - 1) {
                reply = replyBuf;
                replyBuf = "";
                break;
            }
            if (eol < 0)
                return;
            replyBuf = replyBuf.substring(eol + 1);
        };
        matron.emit("gotClocks", JSON.parse(reply));
    };

    askForTime = function() {
        child.stdin.write('\n');
        timeout = setTimeout(askForTime, period);
    };

    quit = function() {
        clearTimeout(timeout);
        child.kill();
    };

    spawnChild();
    askForTime();

    matron.addListener("quit", quit);
};

exports.Clock = Clock;
