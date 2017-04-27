/*

  Pushbutton handling

  Handle various gestures for a pushbutton switch with an LED.

  The button state is polled regularly (default: every 100 ms), which
  takes care of debouncing.  This produces a string of "0"s and "1"s
  corresponding to "released" and "pressed".  Gestures are regexp
  matches to the tail of the string.  Only the most recent 5 seconds
  of button history are maintained.

  Example gestures (which are known by the gesture() method)

    - click: /0{5}1{1,5}0{3}$/

    - doubleClick: /0{5}1{1,3}0{12}1{1,3}0{3}$/

    - hold: /0{5}1{20}$/

  Handlers for gestures are registered with the addGesture(RE, callback) method.
  Polling of the button is turned on/off with the run() method.

  This module also has methods for the LED:

    - set(bool on)

    - blinker({state: bool, duty: int[]}, time): start a blinker, with
      specified LED start state; duty is an array of reals, giving
      times (in seconds) to spend in alternating states, starting with
      'start'.  'time' is time after which the blinker stops (0 means
      never stop), in seconds.  Returns an id representing this blink.
      Multiple blinkers can be operating simultaneously.

    - stopBlinker(id): cancel blinker with given I

(C) 2017 John Brzustowski
License: GPL2 or later.

Example:
========

   Fs = require("fs");
   Pushbtn = require("pushbtn.js");
   x = new Pushbtn(null, "/sys/class/gpio/gpio18/value", "/sys/class/gpio/gpio17/value");
   x.gesture("click", function() {x.set(! x.state);});  // toggle LED state
   x.gesture("doubleClick", function() {x.blinker({state: 1, duty:[0.5]}, 1.75)}) // slow on-off-on-off blink
   x.gesture("hold", function() {x.set(1)}) // set LED on
   x.run()

*/

function Pushbtn (matron, gpioSW, gpioLED, pollInt) {
    this.matron = matron;
    this.gpioSW = gpioSW;   // path to "value" file for input switch gpio
    this.gpioLED = gpioLED; // path to "value" file for output LED gpio
    this.hist = "";
    this.pollInt = pollInt || 100; // polling interval, in ms
    this.gestures = {};
    this.pollInterval = null;
    this.blinkers = {};  // each is {bool state, int duty[], int i, timer}
    this.state = 0;   // state of LED
    this.blinkerID = 1; // unique ID for next blinker

    // known gestures
    this.knownGestures = {
            click:       /0{5}1{1,5}0{3}$/,
            doubleClick: /0{5}1{1,3}0{1,2}1{1,3}0{3}$/,
            hold:        /0{5}1{20}$/
    };

    // callback closures

    this.this_poll = this.poll.bind(this);
    this.this_doBlink = this.doBlink.bind(this);
    this.this_stopBlinker = this.stopBlinker.bind(this);
};

Pushbtn.prototype.run = function(off) {
    if (off) {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    } else {
        if (! this.pollInterval) {
            this.pollInterval = setInterval(this.this_poll, this.pollInt);
        }
    }
};

Pushbtn.prototype.poll = function() {
    this.hist = this.hist + Fs.readFileSync(this.gpioSW).toString("UTF8", 0, 1);
    if (this.hist.length > 50)
        this.hist = this.hist.substr(-50);
    for (var i in this.gestures) {
        var g = this.gestures[i];
        if (this.hist.match(g.re))
            g.handler(i);
    }
};

Pushbtn.prototype.gesture = function(re, handler) {
    // two conventions:
    //       re: regular expression, or string name of known gesture
    //  handler: function; in which case this function will be set as the handler
    //
    // or
    //
    //       re: regular expression
    //  handler: string; in which case this defines a name for the gesture RE

    if (typeof(re) == "string" && this.knownGestures[re])
        re = this.knownGestures[re];
    re = RegExp(re);
    if (typeof(handler) == 'function') {
        // add precompiled regexp and handler
        this.gestures[re] = {re:re, handler:handler};
    } else if (typeof(handler) == 'string') {
        // define a new gesture with name given by handler
        this.knownGestures[handler] = re;
    } else if (! handler) {
        delete this.gestures[re];
    }
};

Pushbtn.prototype.set = function(on) {
    if (this.blinkTimeout) {
        clearTimeout(this.blinkTimeout);
        this.blinkTimeout = null;
    }
    this._led(on);
};

Pushbtn.prototype._led = function(on) {
    Fs.writeFileSync(this.gpioLED, on ? "1" : "0");
    this.state = on;
};

Pushbtn.prototype.blinker = function(blinker, time) {
    var f = this.this_doBlink;
    blinker.f = function() {f(blinker)};
    blinker.i = 0;
    blinker.id = this.blinkerID++;
    this.blinkers[blinker.id] = blinker;
    if (time) {
        var g = this.this_stopBlinker;
        setTimeout(function() {g(blinker.id)}, time * 1000);
    }
    this.this_doBlink(blinker);
    return blinker.id;
};

Pushbtn.prototype.doBlink = function(blinker) {
    if (! blinker)
        return;
    this._led(blinker.state);
    blinker.state = ! blinker.state;
    blinker.timeOut = setTimeout(blinker.f, blinker.duty[blinker.i] * 1000);
    blinker.i = (1 + blinker.i) % blinker.duty.length;
};

Pushbtn.prototype.stopBlinker = function(id) {
    var blinker = this.blinkers[id];
    if (! blinker)
        return;
    clearTimeout(blinker.timeOut);
    var id = blinker.id;
    delete this.blinkers[id];
    delete blinker;
};

Pushbtn.prototype.stopAllBlinkers = function() {
    for (var i in this.blinkers)
        this.stopBlinker(i);
    this.blinkers = {};
};

exports.Pushbtn = Pushbtn;
