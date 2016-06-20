/*
  perform scheduled transitions among a finite set of states,
  and invoke a callback whenever the state changes

  - the callback is passed these parameters:
      newState,
      oldState,
      callbackParams

  - scheduling starts with a call to start(oldState) where oldState defaults to null
    and will be passed to the callback (since the initial value of oldState is undefined)

  - scheduling ends with a call to stop(newState) where newState defaults to null
    and will be passed to the callback

  - this class is intended for subclassing

*/

Schedule = function(callback, initState, states, changer, callbackParams) {
    /*
      callback: function to be called on state change, with parameters oldState, newState, callbackParams
      state: the initial state
      states: an array of states (numbers or strings), or null (for arbitrary numeric states)
      changer: a function returning an object with these fields:
         - waitFor: how long to wait before changing to nextState, in seconds
         - nextState: new state for schedule
      callbackParams: an object with static parameters for the callback,
      passed as the 3rd arg to the callback
      such as a "self" object [optional]
    */

    this.callback = callback;
    this.state = initState;
    this.states = states;
    this.changer = changer;
    this.callbackParams = callbackParams || null;

    this.nextState = null;
    this.timeout = null;
    this.started = false;
};

Util.inherits(Schedule, Events.EventEmitter);

Schedule.prototype.stateChange = function(self, running) {
    // perform a state change, notifying callbacks,
    // and if running is true, schedule the next one

    self.callback(self.nextState, self.state, self.callbackParams);
    self.state = self.nextState;
    if (running)
        self.scheduleNextState();
};

Schedule.prototype.scheduleNextState = function () {
    // get the next state and time at which the change 
    // should happen, and set up a timeout to perform it
    var change = this.changer();
    if (change.waitFor === Infinity || change.waitUntil === Infinity)
        return;
    this.nextState = change.nextState;
    if (this.timeout)
        clearTimeout(this.timeout);  // just to be sure
    this.timeout = 
        setTimeout(this.stateChange, 
                   Math.max(0,
                            change.waitFor!= undefined 
                            ? change.waitFor 
                            : change.waitUntil - (new Date()).getTime()),
                   this, true);
};

Schedule.prototype.start = function() {
    if (this.started)
        return;
    this.scheduleNextState();
    this.started = true;
};

Schedule.prototype.stop = function(newState) {
    if (! this.started)
        return;
    // kill off existing timers
    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    };
    // emit a final event with specified newState
    this.nextState = newState || null;
    this.stateChange(this, false);
    this.started = false;
};

var Sunriset = require('./sunriset.js');
["sunrise", "sunset", "noon"].forEach(function(n) { Schedule.prototype[n] = Sunriset[n];});

exports.Schedule = Schedule;

/*
  AlwaysOn: a schedule that only emits two stateChange events:
  - when start() is invoked, it emits stateChange (newState = "on", oldState = "off");
  as its start() method is invoked.  The newState argument is "on". It
  doesn't emit any further events unless its stop() method is invoked,
  in which case the newState argument will be "off".
  
*/

AlwaysOn = function(callback, callbackParams) {
    var self = this;
    var nullChanger =  function() {
        return {nextState: "on", waitFor: self.started ? Infinity : 0};
    };
    AlwaysOn.super_.call(this, callback, "off", null, nullChanger, callbackParams);
};

Util.inherits(AlwaysOn, Schedule);

AlwaysOn.prototype.start = function() {
    AlwaysOn.super_.prototype.start.call(this);
};

AlwaysOn.prototype.stop = function() {
    AlwaysOn.super_.prototype.stop.call(this, "off");
};


exports.AlwaysOn = exports.alwayson = exports.alwaysOn = AlwaysOn;

/*
  Constant: a schedule that only emits an event on the initial state.
  
*/

Constant = function(callback, state, callbackParams) {
    var self = this;
    var nullChanger =  function() {
        return {nextState: state, waitFor: self.started ? Infinity : 0};
    };
    Constant.super_.call(this, callback, state, null, nullChanger, callbackParams);
};

Util.inherits(Constant, Schedule);

Constant.prototype.start = function() {
    Constant.super_.prototype.start.call(this);
};

Constant.prototype.stop = function() {
    // do nothing for stop()
//    Constant.super_.prototype.stop.call(this, null);
};

exports.Constant = exports.constant = Constant;
/*
  Periodic: a schedule that cycles through an array of states, staying in each one
  for a period (specified as an array or scalar).  Time periods and state values are recycled
  as needed.  The initial state is the first in the array.
*/

Periodic = function(callback, states, periods, callbackParams) {
    var self = this;
    if (! Array.isArray(states))
        states = [states];
    if (! Array.isArray(periods))
        periods = [periods];

    // we add a zero period at the end which is only used initially
    this.periodLength = periods.length;
    this.periods = periods.slice();
    this.periods.push(0);
    
    // set the target time for the wakeup (round time down to nearest
    // whole multiple 
    this.targetTime = (new Date()).getTime();

    var periodChanger =  function() {
        // start in the first state immediately
        this.targetTime += self.periods[self.iPeriod] * 1000;
        var rv = {nextState: self.states[self.iState], waitUntil: this.targetTime};
        self.iState = (1 + self.iState) % self.states.length;
        self.iPeriod = 1 + self.iPeriod;
        // don't use '%' to increase self.iPeriod, because the first time, we're
        // at index self.periodLength, which is a bogus zero-delay for forcing
        // the initial state to be selected immediately.  (Using % would wrap
        // us to index 1, leaving us out of sync with the values).
        if (self.iPeriod >= self.periodLength)
            self.iPeriod = 0;
        return rv;
    };

    this.iState = 0;
    this.iPeriod = this.periodLength;
    Periodic.super_.call(this, callback, null, states, periodChanger, callbackParams);
};

Util.inherits(Periodic, Schedule);

exports.Periodic = exports.periodic = Periodic;

/*
  Daily: a schedule that operates each day for one or two periods delimited by
  startTime and stopTime.  startTime and stopTime must be such that their difference
  is either non-negative each day, or non-positive each day.
  If startTime <= stopTime, we run from startTime to stopTime.
  If startime > stopTime, we run from yesterday's startTime to stopTime, then again from startTime
  until tomorrow's stopTime.

  startTime and stopTime must accept Date objects and return Date objects.
  If they are passed null, they use today's date.
*/

Daily = function(callback, startTime, stopTime, callbackParams) {
    var self = this;
    this.startTime = startTime;
    this.stopTime = stopTime;

    var dailyChanger =  function() {
        var start = self.startTime().getTime();
        var stop = self.stopTime().getTime();
        var now = (new Date()).getTime();
        var twoPeriods = start > stop;
        if (self.state == "off") {
            // figure out when to start
            if ( (twoPeriods && (now < stop || now >= start))
                 || (! twoPeriods && now >= start && now < stop))
                // we should be running now
                return {nextState: "on", waitFor: 0};
            if (now < start)
                // otherwise, we have yet to start today
                return {nextState: "on", waitFor: start - now};
            // we need to wait until tomorrow
            var startTomorrow = self.startTime(new Date(now + 24 * 3600 * 1000)).getTime();
            return {nextState: "on", waitFor: startTomorrow - now};
        }
        // figure out when to stop
        if ( (twoPeriods && now >= stop && now < start) 
             || (! twoPeriods && (now < start || now >= stop)))
            // we should be stopped now
            return {nextState: "off", waitFor: 0};
        if (now < stop)
            // we need to stop later today
            return {nextState: "off", waitFor: stop - now};
        // otherwise, we don't stop until tomorrow
        var stopTomorrow = self.stopTime(new Date(now + 24 * 3600 * 1000)).getTime();
        return {nextState: "off", waitFor: stopTomorrow - now};
    };
    Daily.super_.call(this, callback, "off", null, dailyChanger, callbackParams);
};

Util.inherits(Daily, Schedule);

exports.Daily = exports.daily = Daily;

Make = function(sched, callback, callbackParams) {
    // make a schedule of correct type
    // sched has these fields:
    // type: name of one of the derived schedule classes,
    //       case insensitive
    // other parameters appropriate to the type

    switch(sched.type.toLowerCase()) {
    case "constant":
        return new Schedule.Constant(callback, sched.value, callbackParams);
    case "alwayson":
        return new Schedule.AlwaysOn(callback, callbackParams);
    case "periodic":
        return new Schedule.Periodic(callback, sched.states, sched.periods, callbackParams);
    case "daily":
        return new Schedule.Daily(callback, sched.startTime, sched.stopTime, callbackParams);
    }
    return null;
};

exports.Make = Make;

        
    

