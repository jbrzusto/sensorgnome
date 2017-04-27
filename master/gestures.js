/*

  respond to gestures on the pushbutton/LED switch wired to GPIO 17 (LED) and 18 (switch)

  This module runs in a stand-alone instance of nodejs so that it's not affected by
  any problems the master process encounters.

  The switch is e.g. this one:  https://www.adafruit.com/product/559

  and it is wired like so:

  "+" -> GPIO 17
  "-", COMMON -> GND  (two terminals going to ground)
  "NO" -> GPIO 18

  The following gestures are supported:

  single click: toggle a 1/s heartbeat of the LED as well as rapid
                blinks for detected tag pulses.  Turns off automatically
                after 10 minutes

  double click: toggle the WiFi hotspot (RPi 3 only); the PI 3's
                internal WiFi adapter will turn on and create a
                WPA2-protected access point with the SG serial number
                as both essid and passphrase, e.g. SG-26F1RPI358CC The
                PI3 has the address 192.168.7.2 when connecting
                wirelessly.  When a double-click is recognized, the
                LED gives three medium-length blinks.

                Turns off automatically after 30 minutes.

  hold 3 sec: perform a clean shutdown; the LED will light and stay
                lit until shutdown is complete, and then turns off.

*/

var exit = false;
Fs = require("fs");
Pushbtn = require("/home/pi/proj/sensorgnome/master/pushbtn").Pushbtn;
var b = new Pushbtn(null, "/sys/class/gpio/gpio18/value", "/sys/class/gpio/gpio17/value");
b.set(0);

// accept 'blink' datagrams on UDP port 59001
// the LED is blinked rapidly once for each line in the datagram

Dgram = require("dgram");
var sock = Dgram.createSocket('udp4');
sock.bind(59001, "127.0.0.1");
sock.on("message", fastBlink);

var heartbeat = 0;     // positive id of blinker if flashing a heartbeat; 0 if not
var wifi = false;      // are we running the WiFi hotspot?
var shutdown = false;  // are we shutting down?

// object we send to the master node process to enable/disable pulse
// detection relay
var msg = {type:"vahData", enable: false};

b.gesture("click", toggleHeartbeat);
b.run()

// b.gesture("click", function() {b.set(! b.state);});  // toggle LED state
// b.gesture("doubleClick", function() {b.blinker({state: 1, duty:[0.5]}, 1.75)}) // slow on-off-on-off blink
// b.gesture("hold", function() {b.set(1)}) // set LED on

// sign up for VAH data messages from the master process
// this gives us one detected pulse per line.


function fastBlink (msg, rinfo) {
    // blink for each line in msg
    // rinfo is ignored
    if (exit || ! heartbeat)
        return;
    var n = msg.toString().match(/\n/g);
    n = (n && n.length) || 1;
    var d = 0.065; // blink duration, in seconds
    b.blinker({state:1, duty:[d]}, (2 * n - 0.5) * d);
};

function toggleHeartbeat() {
    if (heartbeat) {
        b.stopBlinker(heartbeat);
        heartbeat = 0;
        msg.enable = false;
        var s = Buffer(JSON.stringify(msg));
        try {
            sock.send(s, 0, s.length, 59000, "127.0.0.1");
        } catch (e) {}
        b.set(0);
    } else {
        heartbeat = b.blinker({state: 1, duty: [0.1, 0.9]});
        msg.enable = true;
        var s = Buffer(JSON.stringify(msg));
        try {
            sock.send(s, 0, s.length, 59000, "127.0.0.1");
        } catch (e) {}
    }
};

function quitProcess () {
    if (exit)
        return;
    exit = true;
    b.stopAllBlinkers();
    b.set(0);
    process.exit(0);
};

process.on("SIGTERM", quitProcess);
process.on("SIGQUIT", quitProcess);
process.on("SIGINT", quitProcess);
