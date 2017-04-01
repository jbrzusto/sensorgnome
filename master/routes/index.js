
/*
 * GET home page.
 * 
 */


var
fs = require('fs')
;

exports.index = function(req, res) {
    res.render('index',
	       { 
		   title: 'Welcome to your SensorGnome',
		   machine_id: Machine.machineID,
                   deployment: Deployment.shortLabel,
                   bootcount: Machine.bootCount
	       });
};
