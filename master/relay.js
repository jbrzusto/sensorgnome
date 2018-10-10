/*

  Resend messages in and out of Matron from a specific UDP port.

  This module listens on port 59000 for datagrams with this JSON schema:

     {"type": "TYPE", enable: true}

  It then registers itself as a listener for messages of type TYPE on
  Matron, and whenever it receives one, sends it to the UDP port
  that sent the above datagram.  If "enable" is false, the messages
  of given type are no longer sent to the given port.  If "type"
  is not specified but "enable" is false, then all messages to that
  host, port are cancelled.

  Moreover, any message with this JSON schema:

     {"name":"NAME", data:{...}}

  is emitted to matron as ("NAME", data)

  (C) John Brzustowski 2017
  License: GPL v2 or later.

*/

Dgram = require("dgram");

function Relay (matron, port, address) {
    this.matron = matron;
    this.port = port;
    this.relays = {}; // object indexed by message type; each is an {address:, port:} object
    this.callbacks = {}; // object indexed by message type; each is a callback

    // callback closures

    this.this_msgMatron = this.msgMatron.bind(this); // some kind of message sent by Matron
    this.this_msgSock   = this.msgSock.bind(this);   // a request for relaying from the UDP socket

    this.sock = Dgram.createSocket('udp4');
    this.sock.bind(port, address || "127.0.0.1");
    this.sock.on("message", this.this_msgSock);
};

Relay.prototype.msgMatron = function(msg, data) {
    // DEBUG:    console.log("Relay: got message " + msg + "\n" + JSON.stringify(data));
    if (this.relays[msg]) {
        data = new Buffer(data.toString());
        for (var n in this.relays[msg]) {
            var d = this.relays[msg][n];
            this.sock.send(data, 0, data.length, d.port, d.address);
        }
    }
};

Relay.prototype.msgSock = function(msg, rinfo) {
    try {
        var req = JSON.parse(msg);
        // DEBUG:  console.log("Relay: got sock request " +JSON.stringify(req) + " " + rinfo.address + " " + rinfo.port + "\n");
        if (req.type) {
            if (! this.relays[req.type]) {
                this.relays[req.type] = [];
                var msg = req.type;
                var g = this.this_msgMatron;
                var cb = function(data) {g(msg, data)};
                this.callbacks[req.type] = cb;
                this.matron.on(req.type, cb);
            }
            if (req.enable) {
                this.relays[req.type][rinfo.address + ":" + rinfo.port] = rinfo; // addressed by host:port for easy deletion
            } else {
                // delete relay for specified type, or all types if none given
                var reqs = req.type ? [req.type] : Object.keys(this.relays);
                for (var i in reqs) {
                    var req = reqs[i];
                    // DEBUG:  console.log("Trying to delete for " + req + "\n");
                    delete this.relays[req][rinfo.address + ":" + rinfo.port];
                    if (Object.keys(this.relays[req]).length == 0) {
                        this.matron.removeListener(req, this.this_msgMatron);
                        delete this.relays[req];
                        delete this.callbacks[req];
                    }
                }
            }
        } else if (req.name) {
            if (req.data)
                this.matron.emit(req.name, req.data);
            else
                this.matron.emit(req.name)
        }
    } catch(e) {
        // DEBUG:  console.log("relay error: " + e.toString());
        // ignore malformed msgs
    };
};

exports.Relay = Relay;
