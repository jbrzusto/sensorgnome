/* test the Pushbtn class */

Fs = require("fs");
Pushbtn = require("./pushbtn").Pushbtn;
var x = new Pushbtn(null, "/sys/class/gpio/gpio18/value", "/sys/class/gpio/gpio17/value");
x.gesture("click", function() {x.set(! x.state);});  // toggle LED state
x.gesture("doubleClick", function() {x.blinker({state: 1, duty:[0.5]}, 1.75)}) // slow on-off-on-off blink
x.gesture("hold", function() {x.set(1)}) // set LED on
x.run()

// accept 'blink' datagrams on UDP port 59001
// the LED is blinked rapidly once for each line in the datagram

Dgram = require("dgram");
var s = Dgram.createSocket('udp4');
s.bind(59001, "127.0.0.1");
s.on("message", blink);

// sign up for VAH data messages from the master process
// this gives us one detected pulse per line.

msg = Buffer(JSON.stringify({type:"vahData", enable:true}));
s.send(msg, 0, msg.length, 59000, "127.0.0.1");

function blink (msg, rinfo) {
    // blink for each line in the datagram
    var n = msg.toString().match(/\n/g);
    n = (n && n.length) || 1;
    var d = 0.065; // blink duration, in seconds
    x.blinker({state:1, duty:[d]}, (2 * n - 0.5) * d);
};
