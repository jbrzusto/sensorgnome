/*
  master.js - the main sensorgnome service which launches data acquisition according to
  a stored program.  This service is restarted every 60 seconds (as set in its systemd
  file) if it stops or fails.
*/


// process.on("uncaughtException", function(err) {
//      console.log('Caught exception: ' + err);
// });

var doneQuit = false;

function quitProcess () {
    if (doneQuit)
        return;
    doneQuit = true;
    console.log("Exiting from master.js!\n");
    TheMatron.emit("quit");
    setTimeout(function() {process.exit(0)}, 1000);
};

process.on("SIGTERM", quitProcess);
process.on("SIGQUIT", quitProcess);
process.on("exit", quitProcess);

Fs            = require('fs');
Path          = require('path');
Util          = require('util');
ChildProcess  = require('child_process');
Net           = require('net');
Events        = require('events');
Zlib          = require('zlib');

// information about the unit we're running on
// (machine ID and bootcount)

Machine = require('./machine.js');

// Matron is a global object on which all SensorGnome event listeners
// are registered, and from which all SensorGnome events are emitted.

Matron = require('./matron.js');
TheMatron = new Matron.Matron();

// kludgy options for transitional usage
TheMatron.tagDBFile = Fs.existsSync("/boot/uboot/SG_tag_database.sqlite") ?
    "/boot/uboot/SG_tag_database.sqlite"
    :
    "/boot/uboot/SG_tag_database.csv";

// Load singleton objects
GPS           = new (require('./gps.js').GPS)       (TheMatron);
HubMan        = new (require('./hubman.js').HubMan) (TheMatron, "/dev/sensorgnome");
VAH           = new (require('./vah.js').VAH)       (TheMatron, "/usr/bin/vamp-alsa-host", "VAH.sock");
WebServer     = new (require('./webserver.js')).WebServer(TheMatron);

Schedule      = require('./schedule.js');
USBAudio      = require('./usbaudio.js');
//WavMaker      = require('./wavmaker.js');

Deployment = new (require("./deployment.js").Deployment) (
 [
     "/boot/uboot/deployment.txt",
     "/media/internal_SD_card/deployment.txt",
     "/home/pi/proj/sensorgnome/plans/deployment.txt"
 ]);

// replace "-" with "_" in deployment short label, so filenames
// use "-" only for delimiting fields

Deployment.shortLabel = Deployment.shortLabel.replace(/-/g,"_");

TagFinder     = new (require('./tagfinder.js').TagFinder) (TheMatron, 
                                                           "/home/pi/proj/sensorgnome/find_tags/find_tags_unifile", 
                                                           TheMatron.tagDBFile,
                                                           Deployment.module_options.find_tags.params
                                                          );

DataSaver     = new (require('./datasaver.js').DataSaver) (TheMatron);

SafeStream    = require('./safestream.js').SafeStream;

AllOut = new SafeStream(TheMatron, "all", ".txt", 1000000, 3600);

Uploader = new (require('./uploader.js').Uploader) (TheMatron);

var clockNotSet = true;

function do_nothing(err, stdout, stderr) {
};

TheMatron.on("gotGPSFix", function(fix) {
    AllOut.write("G," + fix.time + "," + fix.lat + "," + fix.lon + "," + fix.alt + "\n" );
//ugly hack to set date from gps if gps has fix but system clock not set
    if (clockNotSet && (new Date()).getFullYear() < 2013) {
        console.log("Trying to set time to " + fix.time + "\n");
        ChildProcess.exec("date --utc -s @" + fix.time, do_nothing);
        clockNotSet = false;
    }
});

TheMatron.on("vahData", function(d) {
    AllOut.write(d);
});

TheMatron.on("setParam", function(s) {
    AllOut.write("S," + s.time + "," + s.port + "," + s.par + "," + s.val + "," + s.errCode + "," + s.err + "\n");
});

TheMatron.on("gpsSetClock", function(prec, elapsed) {
    AllOut.write("C," + (new Date()).getTime() / 1000 + "," + prec + "," + elapsed + "\n");
});

// Start the uploader

Uploader.start();

// start the GPS reader

GPS.start(Deployment.acquire.gps.secondsBetweenFixes);

// Now that all listeners for devAdded events have been registered, we
// can start HubMan.

HubMan.start();

// Start the webserver

WebServer.start();

// Start the tagFinder

TagFinder.start();

