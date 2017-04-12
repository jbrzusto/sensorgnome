/*
  deployment.js - manage a deployment

  constructor:

    Deployment([pathlist]):
       - read each file in pathlist until one is found with a valid deployment file

  methods:

    lookup(port, devtype):

       - return the first plan matching the given device type and port


*/

Fs=require("fs");

Deployment = function(pathlist) {

    pathlist = (pathlist || []).concat("./defaultDeployment.txt");

//    console.log("pathlist is " + JSON.stringify(pathlist));
    var okay = false;
    for (i in pathlist) {
        try {
            this.planPath = pathlist[i];
            this.planText = Fs.readFileSync(this.planPath).toString();
            // remove trailing '//' comments
            this.planText = this.planText.replace(/^([^\/]*(\/[^\/]+)*)\/\/.*$/mg, "$1");
            var d = JSON.parse(this.planText);
            for (j in d)
                this[j] = d[j];
            okay = true;
            break;
       } catch (e)
       {
           console.log("Unable to obtain deployment plan from file:\n" + pathlist[i] + "\n - reason:  " + e);
       };
    }
    if (!okay)
        throw new Error("No valid deployment description found!");
};

Deployment.prototype.lookup = function(port, devType) {
    var
    plans = this.acquire.plans;

    for (i in plans) {
        if (port.match(new RegExp(plans[i].key.port)) &&
            devType.match(new RegExp(plans[i].key.devType))) {
            // kludge: if no USB hub, set port label to 'p0' meaning 'plugged directly into beaglebone'
            return {devLabel: port > 0 ? this.acquire.USB.portLabel[port-1] : "p0", plan: plans[i]};
        }
    }
    return null;
};

exports.Deployment = Deployment;
