/*

  operate a Cornell (Gabrielson & Winkler) tag transceiver, in
  receive-only mode

  This object represents a plugged-in CornellTagXCVR.  As soon as it
  is created, it begins recording tag detections.  The device reports detections
  via an FTDI FT232 USB serial adapter running at 115200 bps raw.  Tag
  detections are printed as XXXXXXXX\r\n where X are hex digits.

  This module watches for such strings, and generates output records
  of the form:

      T[0-9]{1,2},<TS>,<ID>\n

  where the number after 'T' is the USB port #, <TS> is timestamp to 1
  ms precision, and <ID> is the bare 8-hex digit tag ID.

*/

CornellTagXCVR = function(matron, dev) {

    this.matron = matron;
    this.dev = dev;
    this.rs = null;   // readable stream to serial device
    this.buf = "";    // buffer, in case detection strings are split across callbacks
    this.rate = 115200; // assumed fixed serial rate (bits per second)

    // callback closures
    this.this_devRemoved             = this.devRemoved.bind(this);
    this.this_gotTag                 = this.gotTag.bind(this);

    this.matron.on("devRemoved", this.this_devRemoved);

    this.init();
};


CornellTagXCVR.prototype.devRemoved = function(dev) {
    if (dev.path != this.dev.path)
        return;
    if (this.rs) {
        this.rs.close();
        this.rs = null;
    }
};

CornellTagXCVR.prototype.init = function() {
    // open the device fd

    try {
        this.rs = Fs.createReadStream(this.dev.path);
        this.rs.on("data", this.this_gotTag)
    } catch (e) {
        // not sure what to do here
        console.log("Failed to open CornellTagXCVR at " + this.dev.path + "\n");
    }
};

exports.CornellTagXCVR = CornellTagXCVR;

CornellTagXCVR.prototype.gotTag = function(x) {
    this.buf += x.toString();
//    console.log(this.buf);
    var parts = this.buf.split(/[^0-9A-F]+/);
    var now = new Date().getTime() / 1000;
    var part = "";
    var data = "";
    while (parts.length) {
        part = parts.shift();
//        console.log("Part '" + part + "'\n");
        if (/^[0-9A-F]{8}$/.test(part)) {
            data += "T" + this.dev.attr.port + "," + Math.round(now * 1e4) / 1e4 + "," + part + "\n";
            part = "";
            // bump time forward; we want detections to have distinct times, and they
            // should at least differ by the time to transmit the string over the serial
            // adapter.
            // tag ID string is 10 bytes; each byte takes 10 bits to transmit (including start, stop bits)

            now += 10 * 10 / this.rate;
        }
    }
    // emit all detections at once
    if (data.length) {
        this.matron.emit("vahData", data);
        this.matron.emit("gotTag", data);
    }
    // assume any trailing part remaining is partial, so put in buffer
    this.buf = part;
}
