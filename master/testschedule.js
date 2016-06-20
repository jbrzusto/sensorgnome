Util=require("util");
Events=require("events");
Schedule=require("./schedule.js");
x = new Schedule.Schedule(
    function(newState, oldState) {
        console.log("x => " + this.states[newState] + "\n")
    }, 
    0,
    ["off", "on"], 
    function() {
        // note: 'this' will refer to the new Schedule object
        return {nextState: 2 - (1 + this.state), waitFor: this.started ? 5000 : 0};
    },
    this
);

y = new Schedule.AlwaysOn(
    function(newState, oldState) {
        console.log("y => " + newState + " from " + oldState + "\n");
    }
);

z = new Schedule.Periodic(    
    function(newState, oldState) {
        console.log((new Date()) + "z => " + newState + " from " + oldState + "\n");
    },
    ["A", "B", "C", "D", "E"],
    [3, 1, 5]
);

t = new Schedule.Daily(
    function(newState, oldState) {
        console.log((new Date()) + "t => " + newState + " from " + oldState + "\n");
    },
    function(x) {return new Date(1000*4.1*3600 +1000 * this.sunrise(45.0775, -64.495833, x));},
    function(x) {return new Date(1000 * this.sunset(45.0775, -64.495833, x));}
);

x.start();
y.start();
setTimeout(function() {y.stop()}, 2000);
z.start();
t.start();
