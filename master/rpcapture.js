// capture radar pulses pulses sent over ethernet by the redpitaya
//
// Sends these datagrams to local UDP port 59000:
//  - once listening for data:
//    {"name":"radarCaptureReady"}
//  - for each sweep:
//    {"name":"radarHaveSweep","data":{"path":"PATH_TO_SWEEP"}}
//
// see usage at bottom of file.
//
// Corresponding command on redpitaya:

// /opt/bin/digdar -d 1 -n 4000 -p 1000 -c 40 --sum -t 192.168.10.171:12345
// Note that for the "-n XXXX" option, the XXXX must be identical to what
// is specified for rpcapture.js as samples per pulse.
// Also, the argument to -c must divide evenly into the argument for -p.
// -c should be set in the range 20 ... 200; it determines how many
// pulses are in each transmitted chunk.  Larger chunks are read more
// efficiently by the RPi receiver, but obviously increases latency
// (for those applications interested in doing something live with
// pulses, which isn't yet this one), and may interfere with the
// writing thread on the red pitaya.

// As of 20 Apr 2018, this client/server works fine grabbing 4000 samples per pulse
// at PRF=2100 and recording uncompressed digdar sweep files to disk, however
// every so often, the fraction of captured pulses drops from 100% down to
// 80% or so for many sweeps; this eventually recovers by itself, but suggests
// there is a problem on the serving side.  (reader and writer passing
// each other in the pulse buffer?)

// raw sweep files are written to /dev/shm:
//  - the sweep currently being acquired is /dev/shm/new_sweep.dat
//  - the full sweep most recently acquired is /dev/shm/sweep.dat
//  - when /dev/shm/new_sweep.dat is complete, it is immediately renamed
//    to /dev/shm/sweep.dat
//  - in the usual unix way, any other process which has /dev/shm/sweep.dat open
//    will continue to see the original file across such a rename, until it
//    closes the fd

const NET = require('net');
const FS = require('fs');
const EVENTS = require('events');
const UTIL = require('util');
DGRAM = require("dgram");

function MyEmitter() {
  EventEmitter.call(this);
}
UTIL.inherits(MyEmitter, EVENTS);

// count sweeps;
var $Sweep_ID = 0;

// sweep constructor
Sweep = function(maxp, ns, bps, clock, decim, mode) {
    this.maxp = maxp;
    this.meta = {
        version : "1.0.0",
        arp: null,
        np: 0,
        ns: ns,
        fmt: (8 * bps).toString(),
        ts0: null,
        tsn: null,
        range0: 0.0,
        clock: clock,
        decim: decim,
        mode: mode,
        bytes: 0
    };
    this.ID = ++$Sweep_ID;
    this.bps = bps;
    this.samp = new Uint8Array(maxp * ns * bps);
    this.clocks = new Uint32Array(maxp);
    this.azi = new Float32Array(maxp);
    this.trigs = new Uint32Array(maxp);
    this.clear();
};

// make sweep look empty
Sweep.prototype.clear = function() {
    this.meta.np = 0;
    this.meta.bytes = 0;
};

// sweeps are kept in two arrays:
// - w_sweeps: sweeps which can be filled with new data
// - r_sweeps: sweeps which are full of data and waiting to be processed
// Active sweeps (the one being filled from the digitizer, and the full one
// being processed by the reader) are moved to the variables
// `w_sweep` and `r_sweep` while in use.

// The writer grabs the first sweep from `w_sweeps` and moves it to `w_sweep`.
// If there are no sweeps in `w_sweeps`, it instead grab the first sweep from `r_sweeps`.
// When the writer has filled `w_sweep`, it moves it to the end of `r_sweeps`
// and emits a `sweep` event.

// The reader waits for a "sweep" event and grabs the first sweep from
// `r_sweeps` and moves it to `r_sweep`.  When it is finished
// processing the sweep, it moves it to the end of `w_sweeps`.

// !< sitename: name for site (short, human-readable prefix for filenames)
// !< partSweep: path to file written as sweep is acquired
// !< fullSweep: path to file the above is renamed to as soon as it is complete
// !< port: port number
// !< maxp: max pulses to digitize per sweep
// !< ns: samples to grab per pulse
// !< nswp: number of sweep buffers to maintain (>= 3)
// !< clock: digitizer clock rate, in MHz
// !< decim: samples decimation (1 = every sample; 2 = every 2 samples, etc.)
// !< mode: mode for decimation; "first" = first sample in each chunk; "sum" = sum of samples in each chunk
// !< acps: number of ACP pulses per sweep

RPCapture = function(sitename, partSweep, fullSweep, port, maxp, ns, nswp, clock, decim, mode, acps) {
    if (nswp < 3)
        throw "RPCapture needs at least 3 sweeps: one being read, one being written, one waiting to be read or written";

    this.sitename = sitename;
    this.partSweep = partSweep;
    this.fullSweep = fullSweep;
    this.port = port;
    this.clock = clock; // in MHz
    this.decim = decim;
    this.mode = mode;
    this.acps = acps;
    this.srv = null;
    this.con = null;
    this.PULSE_HEADER_SIZE = 32; // size of pulse header, in bytes
    this.BYTES_PER_SAMPLE = 2; // size of sample, in bytes
    this.CLOCK_NS = 1E9 / (this.clock * 1E6); // in nanoseconds
    this.BYTES_PER_PULSE = this.PULSE_HEADER_SIZE + this.BYTES_PER_SAMPLE * ns;
    this.BYTE_OFFSET = { // byte offsets for items of pulse header
        MAGIC:            0,
        ARP_CLOCK_SEC:    8,
        ARP_CLOCK_NSEC:  12,
        TRIG_CLOCK:      16,
        ACP_CLOCK:       20,
        NUM_TRIG:        24,
        NUM_ARP:         28,
        SAMPLES:         32
    };

    // callbacks prebound with `this`
    this.this_connected       = this.connected.bind(this);
    this.this_get_pulse       = this.get_pulse.bind(this);
    this.this_done            = this.done.bind(this);
    this.this_handle_sweep    = this.handle_sweep.bind(this);
    this.this_done_with_sweep = this.done_with_sweep.bind(this);
    this.this_sweep_notify    = this.sweep_notify.bind(this);

    this.w_sweeps = []; // array of writable sweeps
    this.r_sweeps = []; // array of readable sweeps
    this.w_sweep; // single sweep being filled by writer
    this.r_sweep; // single sweep being processed by reader

    for (i = 0; i < nswp; ++i) {
        this.w_sweeps.push(new Sweep(maxp, ns, this.BYTES_PER_SAMPLE, this.clock, this.decim, this.mode));
    }
    // grab first sweep
    this.w_sweep = this.w_sweeps.splice(0, 1)[0];

    // bind handlers
    this.on("sweep", this.this_handle_sweep);

    this.sock = DGRAM.createSocket('udp4');
    this.sock.bind({address:"localhost"}); // don't care which port
    this.msgDest = {address:"localhost", port:59000}; // where datagrams are sent
};

UTIL.inherits(RPCapture, EVENTS);

RPCapture.prototype.go = function() {
    this.srv = NET.createServer(this.this_connected);
    this.srv.listen(this.port);
};

RPCapture.prototype.connected = function(c) {
    this.con = c;
    console.log("Got connection\n");
    c.on("readable", this.this_get_pulse);
    c.on("end", this.this_done);
};

RPCapture.prototype.done = function() {
    process.exit(0);
};

RPCapture.prototype.get_pulse = function() {
    for(;;) {
        p = this.con.read(this.BYTES_PER_PULSE);
        if (!p)
            return;
        // pre-condition:  w_sweeps.length > 0
        arp = p.readUInt32LE(this.BYTE_OFFSET.NUM_ARP);
        var swp = this.w_sweep;
        var meta = swp.meta;
        if (meta.arp != arp) {
            if (meta.arp !== null) {
                // current sweep is complete
                // correct azimuth clocks for each pulse.
                // They are currently N + M, where N is the number of ACPs since the ARP,
                // and M is elapsed time since the most recent ACP, divided by 8 ms.
                // We want to convert this to an azimuth in the range 0..1,
                // assuming the radar rotated at constant speed between consecutive ACPs
                // and so don't use the M portion
                var acplast = Math.floor(swp.azi[0]);
                var n = swp.meta.np; // total pulses
                var ppa = 0; // pulses per azimuth
                var i, ilast, ifirst;
                // find 1st new ACP
                for (i = 1; i < n & swp.azi[i] - acplast < 1.0; ++i);
                ifirst = ilast = i;
                var acpcount = 1;
                while (i < n) {
                    acplast = Math.floor(swp.azi[ilast]);
                    // find next new acp
                    for ( ; i < n & swp.azi[i] - acplast < 1.0; ++i);
                    if (i >= n)
                        break;
                    var scale = 1.0 / (i - ilast);
                    for (var j = ilast; j < i; ++j)
                        swp.azi[j] = (acpcount + (j - ilast) * scale) / this.acps;
                    ilast = i
                    ++acpcount;
                    ++i;
                }
                // for pulses from ilast, wrapping back through 0 to ifirst,
                // make the corrections
                var m = n - ilast + ifirst;
                scale = 1.0 / m;
                for (i = 0; ilast != ifirst; ++i) {
                    acplast = swp.azi[ilast] = (acpcount + i * scale) / this.acps;
                    ++ilast;
                    if (ilast >= n)
                        ilast = 0;
                }
                // we want the first pulse to have the lowest azimuth, so
                // go back and correct all of them
                var azimin = swp.azi[0];
                for (i = 0; i < n; ++i) {
                    swp.azi[i] -= azimin;
                    if (swp.azi[i] < 0)
                        swp.azi[i] += 1.0;
                }
                // move it to the end of r_sweeps:
                this.r_sweeps.push(this.w_sweep);
                // tell anyone who cares there's a new sweep available
                this.emit("sweep");
                // get a new sweep to write into
                // if we've exhausted w_sweeps, grab the oldest
                // sweep from r_sweeps.
                if (this.w_sweeps.length > 0) {
                    this.w_sweep = this.w_sweeps.splice(0, 1)[0];
                } else {
                    this.w_sweep = this.r_sweeps.splice(0, 1)[0];
                }
                swp = this.w_sweep;
                meta = swp.meta;
                swp.clear();
            }
            meta.arp = arp;
            // timestamp of pulse is ARP clock (sec, nsec) plus K ns per trig clock
            // because trig clock counts digitizer clocks between ARP
            // detection and TRG detection.  On the RP, the digitizer clock runs at 125MHz
            // so K = 8 (nanoseconds per digitizer clock).
            meta.ts0 = p.readUInt32LE(this.BYTE_OFFSET.ARP_CLOCK_SEC)
                + 1.0e-9 * (p.readUInt32LE(this.BYTE_OFFSET.ARP_CLOCK_NSEC) +
                            this.CLOCK_NS * p.readUInt32LE(this.BYTE_OFFSET.TRIG_CLOCK));
        }
        // copy some of the pulse metadata
        swp.clocks[meta.np] = p.readUInt32LE(this.BYTE_OFFSET.TRIG_CLOCK);
        swp.trigs[meta.np] = p.readUInt32LE(this.BYTE_OFFSET.NUM_TRIG);
        swp.azi[meta.np] = p.readFloatLE(this.BYTE_OFFSET.ACP_CLOCK);
        // copy the pulse samples
        p.copy(swp.samp,
               meta.np * meta.ns * this.BYTES_PER_SAMPLE,
               this.BYTE_OFFSET.SAMPLES);
        ++meta.np;
    }
}

RPCapture.prototype.handle_sweep = function() {
    // fill in missing metadata now that we've reached the end of the sweep
    if (this.r_sweeps.length == 0) {
        console.log("Weird: handler for 'sweep' event found no sweeps in r_sweeps\n");
        return; // shouldn't happen, but just in case
    }
    var swp = this.r_sweep = this.r_sweeps.splice(0, 1)[0];
    var meta = swp.meta;
    meta.sitename = this.sitename;
    console.log(`Got sweep ${swp.ID} @ ${meta.ts0} with ${meta.np}/${swp.trigs[swp.meta.np-1]-swp.trigs[0]+1} pulses/trigs`);
    meta.tsn = meta.ts0 + (swp.clocks[meta.np - 1] - swp.clocks[0]) * this.CLOCK_NS * 1e-9;
    meta.bytes = meta.np * (meta.ns * swp.bps + swp.clocks.BYTES_PER_ELEMENT + swp.trigs.BYTES_PER_ELEMENT + swp.azi.BYTES_PER_ELEMENT);
    delete meta._alignment;
    var json = JSON.stringify(meta);
    var magic = "DigDar radar sweep file\n";
    // how many blanks are needed in _alignment to have the first binary byte of the file on an 8-byte boundary?
    var n = 8 - ((1 + json.length + magic.length) % 8); // 1 is for the 2nd '\n'
    if (n != 8)  // only align with from 1 to 7 blanks
        meta._alignment = "        ".substr(0, n);
    swp.hdr = magic + JSON.stringify(meta) + "\n";
    if (this.swr)
        delete this.swr;
    this.swr = new SweepWriter(swp, this.partSweep, this.this_done_with_sweep);
};

RPCapture.prototype.done_with_sweep = function() {
    // one user is finished with the sweep in this.r_sweep
    // if there are no users left, detach the sweep
    // and move it to the end of this.w_sweeps
    this.r_sweep.clear();
    this.w_sweeps.push(this.r_sweep);
    console.log(`Checked in r_sweep with id=${this.r_sweep.ID}`);
    this.r_sweep = null;
    // rename to "sweep.dat"; any client with the original "sweep.dat" open will still
    // be able to use that file until it closes the corresponding fd
    FS.rename(this.partSweep, this.fullSweep, this.this_sweep_notify);
};

RPCapture.prototype.sweep_notify = function() {
    // send a datagram to the sensorgnome relay port indicating a sweep is ready
    this.sendMessage("radarSweepReady", {path: this.fullSweep});
};

RPCapture.prototype.sendMessage = function(name, data) {
    var msg = JSON.stringify({name:name, data:data});
    console.log("Rpcapture: sending " + msg);
    this.sock.send(msg, 0, msg.length, this.msgDest.port, this.msgDest.address);
};

SweepWriter = function(swp, filename, atEnd) {
    this.swp = swp;
    this.filename = filename;
    this.atEnd = atEnd;
    this.fd = null;
    // byte count and indexes for writing sample byte
    this.nsb = this.swp.meta.ns * this.swp.meta.np * this.swp.bps;
    this.isb = 0;
    console.log(`Creating ${this.filename} for sweep ${swp.ID} with ${this.nsb} sample bytes and ${this.swp.trigs[this.swp.meta.np-1]-this.swp.trigs[0]+1} trigs and azi from ${this.swp.azi[0]} to ${this.swp.azi[this.swp.meta.np-1]}`);
    this.this_file_opened = this.file_opened.bind(this);
    this.this_write_parts = this.write_parts.bind(this);
    this.this_wrote_buf_part = this.wrote_buf_part.bind(this);

    FS.open(this.filename, 'w', this.this_file_opened);
};

SweepWriter.prototype.file_opened = function(err, fd) {
    if (err) {
        console.log(`Error opening ${this.filename} for writing`);
        this.atEnd();
        return;
    }
    this.fd = fd;
    this.CHUNK_SIZE = 1 << 20; // number of bytes of sample data to try to write at each call to write_part
    this.writeStep = -1;
    this.write_parts();
};

SweepWriter.prototype.write_parts = function() {
    ++this.writeStep;
    switch(this.writeStep) {
    case 0: // header
        this.write_buf(Buffer(this.swp.hdr));
        break;
    case 1: // clocks
        this.write_buf(Buffer(this.swp.clocks.buffer).slice(0, 4 * this.swp.meta.np));
        break;
    case 2: // azimuth (floats in 0..1)
        this.write_buf(Buffer(this.swp.azi.buffer).slice(0, 4 * this.swp.meta.np));
        break;
    case 3: // trigs
        this.write_buf(Buffer(this.swp.trigs.buffer).slice(0, 4 * this.swp.meta.np));
        break;
    case 4: // samples
        this.write_buf(Buffer(this.swp.samp.buffer).slice(0, this.swp.meta.bytes));
        break;
    case 5:
        FS.close(this.fd, this.this_write_parts);
        break;
    default:
        this.atEnd();
    }
};

SweepWriter.prototype.write_buf = function(buf) {
    this.isb = 0;
    this.nsb = buf.length;
    this.wrote_buf_part(0, 0, buf);
}

SweepWriter.prototype.wrote_buf_part = function(err, count, buf) {
    if (err) {
        console.log(`Error writing file: ${this.filename}`);
        this.atEnd();
        return;
    };
    this.isb += count;
    if (this.isb < this.nsb) {
        FS.write(this.fd, buf, this.isb, Math.min(this.CHUNK_SIZE, this.nsb - this.isb), this.this_wrote_buf_part);
    } else {
        this.write_parts();
    }
};

SweepWriter.prototype.file_error = function(e) {
    console.log("SweepWriter error: " + e.toString());
};

// usage: rpcapture.js JSON

var ARGV = process.argv;
if (ARGV.length != 3) {
    console.log(
        `
        Usage:

        nodejs rpcapture.js JSON

        where JSON is a json-formatted boject with these fields:

            - sitename: short label for radar site; default: hostname
            - partSweep: path for raw image being written; default: "/dev/shm/new_sweep.dat"
            - fullSweep: path for full raw fimage just written; default: "/dev/shm/sweep.dat"
            - port: TCP port on which to listen for connection from digitizer; default: 12345
            - np: max number of pulses to buffer for a sweep; default: 5300
            - ns: number of samples per pulse; default: 4000
            - nswp: number of sweep buffers; default: 5
            - decim: decimation rate; default: 1
            - mode: decimation mode; default: "sum" (other possible value is "first")
            - clock: digitizer clock rate, in MHz; default: 125.0
            - acps: number of ACPs per sweep; default: 450 (as for the Furuno FR series)


        e.g. nodejs rpcapture.js '{"sitename":"csh","port":12345,"np":5300,"ns":4000,"nswp":5,"decim":1,"mode":"sum","clock":125.0}'

        `);
    process.exit(1);
    console.log("whoops - didn't exit!")
}

var par       = JSON.parse(ARGV[2]),
    sitename  = par.sitename || "csh",
    partSweep = par.partSweep || "/dev/shm/new_sweep.dat",
    fullSweep = par.fullSweep || "/dev/shm/sweep.dat",
    port      = par.port     || 12345,
    np        = par.np       || 5300,
    ns        = par.ns       || 4000,
    nswp      = par.nswp     || 5,
    decim     = par.decim    || 1,
    mode      = par.mode     || "sum",
    clock     = par.clock    || 125.0,
    acps      = par.acps     || 450
;

R = new RPCapture(sitename, partSweep, fullSweep, port, np, ns, nswp, clock, decim, mode, acps);
R.go();
R.sendMessage("radarCaptureReady");
console.log(`Listening on port ${port}\n`);
