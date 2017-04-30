/*

  DataSaver.js - provide file-based writeableStreams to clients who
  can then save data to them.  Deal with generating correct filenames
  on appropriate drives.

  Required globals: GPS, Deployment, Machine

FIXME: output streams should use output files, not fs.fileWriteSTreams,
so we can detect how many bytes short we are on a write, and resend
once the file stream is re-opened on another disk.  Currently, we'll
lose one chunk of data (probably less than a second) when writing a .wav
to the end of one disk and continuing on another.

   Data File Nomenclature and Placement
   ====================================

   SGdata/BOOT_COUNT/YYYY-MM-DD/DEPLOYMENT_CODE-MACHINE_ID-BOOT_COUNT-YYYY-MM-DDTHH-MM-SS.SSSSC-SRC.EXT

   - DEPLOYMENT_CODE is short user string containing no "-" (any "-" are replaced by "_")

   - MACHINE_ID is the 12 unique beaglebone id (/etc/beaglebone_id)

   - BOOT_COUNT is zero-padded 6-digit boot count

   - timestamp is precise to 0.1 ms and is UTC; (YYYY-MM-DDTHH-MM-SS.SSSS)

   - timestamp code (C) is
      - Z: timestamp was obtained after the GPS set the clock, so should be good
      - P: timestamp was obtained before the GPS set the clock, so may be very wonky
      - A: timestamp was obtained before the GPS set the clock, but corrected post-hoc (and so is approximately correct)

   - SRC is a USB port number, for raw .wav data files; otherwise, it is a string from
     this list:
      - "all": output from every plugin on every port; the first item in each output line
        should be the port identifier (e.g. "p1", "p2", ...)

   - EXT is a file extension:
     .txt - for temporary ascii file written as data are available
     .txt.gz - for compressed .dat file; after writing, we delete the original .txt
     .wav - for raw audio

   - the "SGdata" folder is created in the first (alphabetically) directory in /media for which
     the corresponding drive has at least 1M available.  Directories in /media have these names:

     /media/disk_port1-1      disk in USB port 1, partition 1
     /media/disk_port1-2      disk in USB port 1, partition 2
     ...
     /media/disk_port2-1      disk in USB port 2, partition 1
     ...
     /media/SD_card           micro SD card


*/


DataSaver = function(matron) {
    this.matron = matron;
    // mounted disks; we remove from this list when full, but also keep track
    // of devAdded and devRemoved

    this.mountedDisks = [];

    // callback closures
    this.this_devAdded   = this.devAdded.bind(this);
    this.this_devRemoved = this.devRemoved.bind(this);

    matron.on("devAdded", this.this_devAdded);
    matron.on("devRemoved", this.this_devRemoved);

    this.mountedDisks = Fs.readdirSync("/media").sort();

};


DataSaver.prototype.getRelPath = function (source, timestamp) {
    /*
      Get a string list of path components to a data file; The first component is relative to
      the disk mount point; the last component is the file basename (without extension).

      If timestamp is specified as "%", it is replace with strftime-compatible formatting codes
      so a subsequent function can fill in time once it is known.
    */
    timestamp = timestamp || (new Date()).getTime() / 1000;
    tscode = GPS.timeStampCode();
    var dayPart;
    if (timestamp == "%") {
        date = "%Y-%m-%dT%H-%M-%S%QQQQQQ" + tscode;
        dayPart="%Y-%m-%d"
    } else {
        var digit4 = Math.round(timestamp * 10000) % 10;
        date = (new Date(Math.floor(timestamp * 1000))).toISOString().replace(/:/g,"-").replace(/Z/, digit4 + tscode );
        dayPart = date.substring(0, 10)
    }

    var basename = Deployment.shortLabel + "-" + Machine.machineID + "-" + Machine.bootCount + "-" + date  + "-" + source;
    return ["SGdata", dayPart, basename];
};

DataSaver.prototype.getStream = function(relpath, ext, pathOnly) {
/*
    return a writeable stream open under the given relative path
    (specified as a list of directory components and the file
    basename) and the file extension on the first disk where this is
    possible, or null if it isn't.

    relpath: a list of relative file path components, as returned by
    getRelPath().

    ext: a file extension (including the leading '.')

    pathOnly: if present and true, does not open a stream, but only
    ensures appropriate directories exist and returns the full path

    Return this object:
    {
       stream: the WritableStream to the file
       path:  absolute path of file to which WritableStream is writing
    }
    or null if no stream can be opened.
*/
    while (this.mountedDisks.length ) {
        try {
            var dirs = ["media", this.mountedDisks[0]].concat(relpath);
            var path = "/" + dirs.join("/") + ext;
                // make sure we can write to this location
            var bogusFile = "/media/" + this.mountedDisks[0] + "/" + Math.random();
            var fd = Fs.openSync(bogusFile, "w");
            Fs.writeSync(fd, "IGNORE - FOR SPACE VERIFICATION ONLY\n", 0);
            Fs.closeSync(fd)
            Fs.unlinkSync(bogusFile);
            if (pathOnly) {
                return path;
            }
            this.ensureDirs(dirs, 2);
            var sout = Fs.createWriteStream(path);
            return {stream:sout, path: path};
        } catch (e) {
            // try next disk
            this.mountedDisks = this.mountedDisks.slice(1);
        }
    }
    throw new Error("DataSaver.getStream: unable to open stream for " + relpath.join("/") + ext);
};

DataSaver.prototype.ensureDirs = function(path, n) {
    // for each directory component in the list path starting at n but
    // ending at path.length - 2, (i.e. excluding the file basename),
    // make sure the directory up to n exists.

    var cumdir = "";
    var i;
    for (i = 0; i < path.length - 1; ++i) {
        cumdir += "/" + path[i];
        if (i >= n) {
            if (! Fs.existsSync(cumdir))
                Fs.mkdirSync(cumdir);
        }
    }
};

DataSaver.prototype.devAdded = function(dev) {
    if (dev.attr.type != "disk")
        return;
    var i = this.mountedDisks.indexOf(dev.attr.mount);
    if (i < 0) {
        this.mountedDisks = this.mountedDisks.concat(dev.attr.mount).sort();
    }
}

DataSaver.prototype.devRemoved = function(dev) {
    if (dev.attr.type != "disk")
        return;
    var i = this.mountedDisks.indexOf(dev.attr.mount);
    if (i >= 0)
        this.mountedDisks.splice(i, 1);
}


exports.DataSaver = DataSaver;
