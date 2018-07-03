/*

  respond to gestures on the pushbutton/LED switch wired to GPIO 17 (LED) and 18 (switch)

  This module runs in a stand-alone instance of nodejs so that it's
  not affected by any problems the master nodejs process encounters.

  The switch is e.g. this one:  https://www.adafruit.com/product/559

  and it is wired like so:

  "+"         -> GPIO 17
  "-", COMMON -> GND  (two terminals going to ground)
  "NO"        -> GPIO 18

  The following gestures are supported:

  single click: toggle a 1/s heartbeat of the LED as well as rapid
                blinks for detected tag pulses.  Turns off automatically
                after 10 minutes

  double click: toggle the WiFi hotspot (RPi 3 only); the PI 3's
                internal WiFi adapter will turn on and create a
                WPA2-protected access point with the SG serial number
                as both essid and passphrase, e.g. SG-26F1RPI358CC The
                PI3 has the address 192.168.7.2 when connecting
                wirelessly.  When the WiFi is on, the LED blinks on and
                off every 0.9 seconds.

                Turns off automatically after 30 minutes.

  hold 3 sec: perform a clean shutdown; the LED will light and stay
                lit until shutdown is complete, and then turns off.

  Details of how gestures are recognized are in pushbtn.js

 (C) John Brzustowski 2017
 License: GPL v 2 or late

*/

var wifiTimeoutMinutes = 30;    // how long after activation the WiFi shuts down.
var heartbeat          = 0;     // positive id of blinker if flashing a heartbeat; 0 if not
var wifi               = 0;     // positive id of WiFi blinker if we are running the hotspot; 0 if not
var shutdown           = false; // are we shutting down?
var exit               = false; // are we exiting (if so, don't blink)

Fs = require("fs");
Child_process = require("child_process");

Pushbtn = require("/home/pi/proj/sensorgnome/master/pushbtn").Pushbtn;
var b = new Pushbtn(null, "/sys/class/gpio/gpio18/value", "/sys/class/gpio/gpio17/value");

// turn the LED off to start
b.set(0);

// accept 'blink' datagrams on UDP port 59001
// the LED is blinked rapidly once for each line in the datagram

Dgram = require("dgram");
var sock = Dgram.createSocket('udp4');
sock.bind(59001, "127.0.0.1");
sock.on("message", fastBlink);

// object we send to the master node process to enable/disable pulse
// detection relay
var msg = {type:"vahData", enable: false};

b.gesture("click", toggleHeartbeat);
b.gesture("doubleClick", toggleWiFi);
b.gesture("hold", cleanShutdown);

b.run()

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
    process.exit(0);
};

function toggleWiFi() {
    if (wifi) {
        b.stopBlinker(wifi);
        b.set(0);
        Child_process.exec("systemctl stop hostapd; ifdown wlan0");
        wifi = 0;
        if (wifiTimeout) {
            clearTimeout(wifiTimeout)
            wifiTimeout = null;
        }
    } else {
        wifi = b.blinker({state: 1, duty:[0.9]});
        Child_process.exec("ifup wlan0; systemctl start hostapd");
        wifiTimeout = setTimeout(toggleWiFi, wifiTimeoutMinutes * 60 * 1000);
    }
};

function cleanShutdown() {
    b.stopAllBlinkers();
    b.set(1);
    Child_process.exec("systemctl poweroff");
};

process.on("SIGTERM", quitProcess);
process.on("SIGQUIT", quitProcess);
process.on("SIGINT", quitProcess);
