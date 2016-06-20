/*

  GPS handling 

  Connect to gpsd and ask for fixes.  We connect to chrony and wait
  asynchronously for finer and finer GPS clock settings, emitting a
  "gpsSetClock" event with the digits of precision and the approximate
  amount by which time was advanced by the fix, in seconds.

*/

function GPS (matron) {
    this.matron = matron;
    this.lastFix = null;
    this.replyBuf = "";
    this.GPSHasSetClock = false;
    this.gpsdCon = null;
    this.conTimeOut = null;
    this.clockSyncDigits = -1; // number of fractional digits in seconds precision of clock sync (only valid when GPSHasSetClock is true)
    // timestamp codes:
    this.timeStampCodes = ["P", "Z", "Y", "X", "W", "V", "U", "T"];
    // "P" clock not set by GPS
    // "Z" = 1 second
    // "Y" = 0.1 second
    // "X" = 0.01 second
    // "W" = 0.001 second
    // "V" = 0.0001 second
    // "U" = 0.00001 second
    // "T" = 0.000001 second

    // self-bound closures for callbacks
    this.this_GPSSetClock = this.GPSSetClock.bind(this); // closure for callbacks
    this.this_gpsdReply = this.gpsdReply.bind(this); 
    this.this_conError = this.conError.bind(this);
    this.this_connect = this.connect.bind(this);
    this.this_getFix = this.getFix.bind(this);
    // spawn a process to wait for a clock adjustment to within 1 second of GPS time
    this.waitForClockSync();
    // connect to gpsd
    this.connect();
};

GPS.prototype.waitForClockSync = function() {
    // wait up to 5 minutes ( = 30 * 10 seconds) for chronyc to get the clock 
    // synchronized to within the currently-desired precision second of GPS.
    // Due to an apparent bug in chronyc wherein "chronyc waitsync 0 1" sometimes
    // waits forever with a server-connection problem, we do a finite wait then
    // respawn.
    this.chronyChild = ChildProcess.execFile("/usr/local/bin/chronyc", ["waitsync", "30", Math.pow(10, -(this.clockSyncDigits + 1))], this.this_GPSSetClock);
};

GPS.prototype.timeStampCode = function() {
    return this.timeStampCodes[1 + this.clockSyncDigits];
};

GPS.prototype.gpsdReply = function(r) {
    try {
        this.replyBuf += r.toString();
        for(;;) {
	    var eol = this.replyBuf.indexOf("\n");
	    if (eol < 0)
	        break;
	    var reply = JSON.parse(this.replyBuf.substring(0, eol));
	    this.replyBuf = this.replyBuf.substring(eol + 1);

            if (reply["class"] == "POLL") {
                var fix = reply.tpv[0];
                if (fix && fix["class"]=="TPV") {
                    this.lastFix = fix;
                    this.matron.emit("gotGPSFix", {lat: fix.lat, lon:fix.lon, alt:fix.alt, time:(new Date(fix.time)).getTime()/1000});
                }
            }
        }
    } catch (e) {
        /**/
    }
};

GPS.prototype.connect = function() {
    this.conTimeOut = null;
    this.sentWatch = false;
    this.gpsdCon = Net.connect(2947, function() {});
    this.gpsdCon.on("data", this.this_gpsdReply);
    this.gpsdCon.on("error", this.this_conError);
    this.gpsdCon.on("end", this.this_conError);
};

GPS.prototype.conError = function(e) {
    this.gpsdCon.destroy();
    this.gpsdCon = null;
    this.conTimeOut = setTimeout(this.this_connect, 5000);
};

GPS.prototype.getFix = function() {
    if (this.gpsdCon) {
        if (! this.sentWatch) {
            this.gpsdCon.write('?WATCH={"enable":true};\n');
            this.sentWatch = true;
        }
        this.gpsdCon.write("?POLL;\n");
    } else if (! this.conTimeOut) {
        this.conTimeOut = setTimeout(this.this_connect, 5000);
    }
};

GPS.prototype.start = function(fixInterval) {
    if (this.interval)
        clearInterval(this.interval);
    this.interval = setInterval(this.this_getFix, fixInterval * 1000, this);
};

GPS.prototype.GPSSetClock = function(code, stdout, stderr) {
    if (! code) {
        this.GPSHasSetClock = true;
        // extract the number
        this.chronyChild = null;
        // we've now obtained one more digit of clock precision
        ++this.clockSyncDigits;
        this.matron.emit("gpsSetClock", this.clockSyncDigits, Number(stdout.toString().split(/,/)[2].split(/: /)[1]))
        // no point trying to go past 1 us precision
        if (this.clockSyncDigits < 6)
            this.waitForClockSync();
    } else {
        this.waitForClockSync();
    }
};

exports.GPS = GPS;
