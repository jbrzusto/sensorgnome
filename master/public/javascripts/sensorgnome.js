/*

  sensorgnome.js - client-side code for the SensorGnome.js web interface

*/

var load1 = function() {
    loadScript("/socket.io/socket.io.js", load2);
};
var load2 = function() {
    loadScript("/javascripts/jquery.js", load3);
};
var load3 = function() {
    loadScript("/javascripts/jquery.form.min.js", sensorgnomeInit);
};

var loadScript = function(src, callback) {
    var script= document.createElement('script');
    script.type= 'text/javascript';
    script.onload = callback;
    script.src= src;
    document.getElementsByTagName('head')[0].appendChild(script);
};

function listenToRaw(n) {
    var btn = $('#raw_audio_button' + n);
    var aud = $('#raw_audio' + n)[0];
    var spn = $('#raw_audio_span' + n);
    if (! btn.text().match(/stop/i)) {
        btn.text("Stop Listening");
        aud.play();
    } else {
        aud.pause();
        aud.remove();
        spn.html('<audio id="raw_audio' + n + '" src="/raw_audio?dev=' + n + '&fm=0&random=' + Math.random() +'" preload="none"></audio>');
        btn.text('Listen');
    }
};

function setFreq(n) {
    if (socket) {
        var freq = parseFloat($('#set_freq_button' + n)[0].value);
        socket.emit("clientSetParam", {port:n, par:"-m", val:freq});
    }
};

var socket;
var VAHstatus;
var devList=[];
var GPS;
var tagBuf=[];
var VAHBuf=[];

var sensorgnomeInit = function() {
    $(document).ready(function() {
        socket = io.connect();
        $("#maintitle").text('I am your SensorGnome');
        var lsDataFilesScrollTop;
        var masterStatusScrollTop;

        socket.on('machineinfo', function(data) {
            $("#bootcount").text(0 + parseInt(data.machine.bootCount));
            $("#machine_id").text(data.machine.machineID);
            $("#version").text(data.machine.version);
            var uptimes = data.uptime.split(/ +/);
            var upsecs = uptimes[0] + 0;
            var updays = Math.floor(upsecs / (24 * 3600));
            upsecs -= updays * 3600 * 24;
            var uphours = Math.floor(upsecs / 3600);
            upsecs -= uphours * 3600;
            var upmins = Math.floor(upsecs / 60);
            $("#uptime").text(updays + " days, " + uphours + " hours, and " + upmins + " minutes");
        });

        socket.on('newVahData', function(data) {
            VAHBuf = VAHBuf.concat(data.split(/\n/));
            var line = "";
            var elt = $("#datalog");
            var top = elt[0].scrollTop;
            while(VAHBuf.length) {
                var hit = VAHBuf.shift().split(/,/);
                if (hit.length == 5) {
                    line += (new Date(parseFloat(hit[1]) * 1000)).toISOString().replace(/[ZT]/g," ").substr(11);
                    line += hit[0] + " @" + Math.round(1000*(devList[parseInt(hit[0].substr(1))].realFreq + hit[2]/1000))/1000 + " MHz " + hit[3] +" / " + hit[4] + " dB\n";
                }
            }
            elt.append(line);
            var lines = elt.text().match(/[^\n]*\n/g);
            if (lines.length > 1000) {
                lines = lines.slice(lines.length - 1000);
                elt.text(lines.join(""));
            }
            if ($("#datalogAutoscroll")[0].checked)
                elt[0].scrollTop = elt[0].scrollHeight;
            else
                elt[0].scrollTop = top;
        });

        socket.on('gotTag', function(data) {
            tagBuf = tagBuf.concat(data.split(/\n/));
            var line="";
            var elt = $("#taglog");
            var top = elt[0].scrollTop;
            while (tagBuf.length) {
                var hit = tagBuf.shift().split(/,/);
                if (hit.length == 13) {
                    line += (new Date(parseFloat(hit[1]) * 1000)).toISOString().replace(/[ZT]/g," ").substr(11);
                    line += "ant " + hit[0] + " " + hit[2] + " + " + hit[3] + " kHz " + hit[5] + " / " + hit[7] + " dB\n";
                }
            }
            elt.append(line);
            var lines = elt.text().match(/[^\n]*\n/g);
            if (lines && lines.length > 1000) {
                lines = lines.slice(lines.length - 1000);
                elt.text(lines.join(""));
            }
            if ($("#taglogAutoscroll")[0].checked)
                elt[0].scrollTop = elt[0].scrollHeight;
            else
                elt[0].scrollTop = top;
        });

        socket.on('gotParam', function(data) {
            if (data.errCode != 0)
                return;
            var line = (new Date(Math.round(data.time * 10) * 100)).toISOString().replace(/[ZT]/g," ").substr(11, 21);
            line += "ant " + data.port;
            if (data.par == "-m") {
                freq_mhz = Math.round(data.val*1000)/1000 + " MHz";
                line += " @ " +  freq_mhz + "\n";
                $("#fcd_freq" + data.port).text(freq_mhz);
                devList[data.port].realFreq=data.val;
            } else {
                line += " set " + data.par + " = " + data.val + "\n"
            }
            var elt = $("#parlog");
            var top = elt[0].scrollTop;
            elt.append(line);
            var lines = elt.text().match(/[^\n]*\n/g);
            if (lines.length > 1000) {
                lines = lines.slice(lines.length - 1000);
                elt.text(lines.join(""));
            }
            if ($("#parlogAutoscroll")[0].checked)
                elt[0].scrollTop = elt[0].scrollHeight;
            else
                elt[0].scrollTop = top;
        });

        socket.on('gpsfix', function (data) {
            if(data.lat) $('#gpslat').text(Math.round(10000*Math.abs(data.lat)) / 10000 + "° " + (["N", "S"][0 + (data.lat < 0)]));
            if(data.lon) $('#gpslong').text(Math.round(10000*Math.abs(data.lon)) / 10000 + "° " + (["E", "W"][0 + (data.lon < 0)]));
            if(data.alt) $('#gpsalt').text(Math.round(data.alt) + " m elev.");
        });

        socket.on('devinfo', function (data) {
            devList = JSON.parse(data);
            $('#devinfo').empty();

            var isd = devList["internal_SD"];
            if (isd) {
                $('#devinfo').append("<li><b>Internal:</b> micro SD card with size = " + (isd["size"] * 1024 / 1e9).toFixed() + "GB;   Used = " + isd["used_percent"] + "</li>");
            }

            var gotGPS = false;
            for (var slot = -1; slot <= 10; ++slot) {
                if (! devList[slot])
                    continue;
                var d = devList[slot];
                var txt;
                switch (d.type) {
                case "disk":
                    var part = d["partitions"];
                    if (part.length == 1) {
                        txt = "Disk: \"" + part[0]["name"] + "\":  Size = " + (part[0]["size"] * 1024 / 1e9).toFixed() + "GB Used = " + part[0]["used_percent"];
                    } else {
                        txt = "Disk with partitions: ";
                        for (var dev in part)
                            txt += "\"" + part[dev]["name"] + "\":  Size = " + (part[dev]["size"] * 1024 / 1e9).toFixed(3) + " Used = " + part[dev]["used_percent"]+ ";   ";
                    }
                    break;
                case "rtlsdr":
                    txt = d["name"] + ': ' + d["mfg"] + ' : ' + d["prod"] + '; USB VID:PID=' + d["vidpid"] + '<span id="raw_audio_span' + slot + '"><audio id="raw_audio' + slot + '" src="/raw_audio?dev=' + slot + '&fm=0&random=' + Math.random() +'" preload="none"></audio></span> <button id="raw_audio_button' + slot + '" type="button" onclick="listenToRaw(' + slot + ')">Listen</button>';
                    txt += '&nbsp;&nbsp;<input id="set_freq_button' + slot + '" type="text" size = 8></input><button onclick="setFreq(' + slot + ')">Set Freq. In MHz</button>';
                    break;
                case "fcd":
                    txt = d["name"] + ' tuned to <a id="fcd_freq' + slot + '\">' + d["frequency"] + '</a><span id="raw_audio_span' + slot + '"><audio id="raw_audio' + slot + '" src="/raw_audio?dev=' + slot + '&fm=0&random=' + Math.random() +'" preload="none"></audio></span> <button id="raw_audio_button' + slot + '" type="button" onclick="listenToRaw(' + slot + ')">Listen</button>';
                    txt += '&nbsp;&nbsp;<input id="set_freq_button' + slot + '" type="text" size = 8></input><button onclick="setFreq(' + slot + ')">Set Freq. In MHz</button>';
                    d.realFreq = parseFloat(d.frequency);
                    break;
                case "gps":
                    txt = d["name"];
                    GPS = d;
                    gotGPS = true;
                    break;

                case "usbAudio":
                    txt = "USB audio device: " + d["name"];
                    txt += '<span id="raw_audio_span' + slot + '"><audio id="raw_audio' + slot + '" src="/raw_audio?dev=' + slot + '&fm=0&random=' + Math.random() +'" preload="none"></audio></span> <button id="raw_audio_button' + slot + '" type="button" onclick="listenToRaw(' + slot + ')">Listen</button>';
                    break;
                default:
                    txt = "unknown";
                }
                $('#devinfo').append('<li><b>' + (slot > 0 ? "USB Hub Port " + slot + ": " : "Directly Attached: ") + '</b>&nbsp;&nbsp' + txt + '</li>');
            }

            $('#devListRefresh').text("Refresh Device List");
            if (! gotGPS)
                $("#setClock").show();
            else
                $("#GPSfix").show();

        });

        function updateUploadStatus(message) {
            $('#softwareUpdateResults').html(message);
        };

        $('#updateUploadForm').submit(function() {
            updateUploadStatus('<blink>Uploading the file ... </blink>');

            $(this).ajaxSubmit({

                error: function(xhr) {
                    updateUploadStatus('<b>Error: ' + xhr.status + '</b>');
                },

                success: function(response) {
                    updateUploadStatus(response.toString());
                }
            });

            // Have to stop the form from submitting and causing
            // a page refresh - don't forget this
            return false;
        });

        socket.on('lsdata', function(data) {
            $('#lsDataFiles').text(data.toString());
            $('#lsDataFilesRefresh').text('Refresh File Listing');
            $('#lsDataFiles').scrollTop = lsDataFilesScrollTop;
        });

        socket.on('vahstatus', function(status) {
            var date = status.date;
            var timeTxt = (new Date(date * 1000)).toISOString().replace("T", "    ").replace("Z", " UTC");
            if (GPS && GPS.name.match(/PPS/) && status.ppsCount !== null) {
                timeTxt += (status.clockSyncDigits < 0) ? ' clock not yet set by GPS ' : (' accurate to ' + Math.pow(10, -status.clockSyncDigits) + ' seconds');
                var ppsOK = false;
                var ppsDiff = status.ppsCount - (VAHstatus ? VAHstatus.ppsCount : 0);
                if ((!VAHstatus) || (ppsDiff > 1 && Math.abs(ppsDiff - (status.date - VAHstatus.date)) < 2)) {
                    ppsOK = true;
                    setTimeout(function() {$('#pps').css('color', 'black');}, 1000);
                }
                timeTxt += (' <span id="pps" style="color: ' + (ppsOK ? "green" : "red") + '">PPS ' + (ppsOK ? "present" : "missing") + '</span>');
            }
            $('#sgtime').html(timeTxt);
            var tabHdr="<table><tr><th>USB Port #</th><th>Hardware<br>Frame Rate<br>kHz</th><th>Channels</th><th>Plugin</th><th>Current<br>Feature Detection Rate<br>pulses per minute</th><th>Long-term<br>Feature Detection Rate<br>pulses per minute</th><th>Current<br>Frame Processing Rate<br>kHz</th><th>(Re)Started</th></tr>";
            var txt = "";
            for (n in status) {
                var item = status[n];
                if (item.type == "PluginRunner") {
                    $("#LivePluginData").show();
                    if(! status[item.devLabel].plugins)
                        status[item.devLabel].plugins={};
                    status[item.devLabel].plugins[item.pluginID] = item.totalFeatures;
                    if (txt == "")
                        txt = tabHdr;
                }
            }
            for (n in status) {
                var fcd = status[n];
                if (fcd.type != "DevMinder")
                    continue;
                for (p in fcd.plugins) {
                    var prate, frate, tprate;
                    var oldfcd;
                    if (VAHstatus)
                        oldfcd = VAHstatus[n];
                    if (oldfcd) {
                        frate = (fcd.totalFrames - oldfcd.totalFrames) / (date - VAHstatus.date);
                        prate = (fcd.plugins[p] - oldfcd.plugins[p]) / (fcd.totalFrames - oldfcd.totalFrames) * fcd.hwRate;
                    } else {
                        frate = fcd.totalFrames / (date - fcd.startTimestamp);
                        prate = fcd.plugins[p] / fcd.totalFrames * fcd.hwRate;
                    }
                    tprate = fcd.plugins[p] / fcd.totalFrames * fcd.hwRate;
                    txt += "<tr><td>" + n + "</td><td>" + (fcd.hwRate/1000).toFixed(1) + "</td><td>" + fcd.numChan + "</td><td>" + p + "</td><td>"+ (prate * 60).toFixed(4) + "</td><td>" + (tprate * 60).toPrecision(6) + "</td><td>" + (frate / 1000).toFixed(1) + "<td>" + (new Date(fcd.startTimestamp * 1000)).toUTCString() + "</td></tr>";
                }
            }
            if (txt != "")
                txt += "</table>";
            var wfw = "";
            for (n in status) {
                var raw = status[n];
                if (raw.type != "WavFileWriter")
                    continue;
                wfw += "<div>";
                var frameRate = Math.round(10 * (raw.prevFileTimestamp > 0 ?
                                                 raw.rate * raw.prevSecondsWritten / (raw.currFileTimestamp - raw.prevFileTimestamp)
                                                 : raw.framesWritten / raw.secondsWritten
                                                )) / 10;
                if (frameRate == Infinity)
                    // protect against seeing fileWriter before
                    frameRate = rate;
                wfw += "<b>Audio device in port " + raw.port + "</b> (" + (devList ? devList[raw.port]["name"] : "") + ")<br><ul>";
                var hmsLeft = new Date((raw.secondsToWrite - raw.secondsWritten)*1000).toTimeString().substring(0, 8);
                wfw += "<li>" + hmsLeft + "<progress value=" + raw.framesWritten / raw.framesToWrite + ">" + "</progress> " +  " remaining for file:<br><pre> " + raw.fileName + "</pre></li>";
                wfw += "<li>data rate:  nominal = " + raw.rate + " Hz; measured = " + frameRate + " Hz " + "; bias = " + Math.abs(Math.round((frameRate - raw.rate) / raw.rate * 1.0e6)) + " ppm " + ((frameRate > raw.rate) ? "fast" : "slow") + "</li>";
                var totSec = raw.secondsWritten + raw.totalSecondsWritten;
                var totDays = Math.floor(totSec / (24*3600));
                totSec -= totDays * 24 * 3600;
                var hms = new Date(totSec*1000).toTimeString().substring(0, 8);
                wfw += "<li>data written: finished files = " + raw.totalFilesWritten + "; total time = " + totDays + " days, " + hms + " HMS</li>";
                wfw += "</ul></div>";
            }
            txt += wfw;
            VAHstatus = status;
            $('#VAHstatusTable').html(txt);
        });

        socket.on('sgbooted', function(okay) {
            if (okay) {
                window.scrollTo(0, 0);
                $("#maintitle").html('SensorGnome rebooting - page will reload in <span id="reloadCountdown">90</span> seconds');
                var i=90;
                var countdown = function() {
                    --i;
                    if (i > 0) {
                        $("#reloadCountdown").text("" + i);
                        setTimeout (countdown, 1000);
                    } else {
                        location.reload(false);
                    }
                }
                setTimeout(countdown, 1000)
            } else {
                $("#rebootStatus").html('<br><br><i><b>Reboot Failed!</b></i>  Try again in a few seconds.');
            }
        });


        socket.on('plan', function(data) {
            $('#planPath').text(data.planPath);
            $('#planText').text(data.planText);
        });

        socket.on('tagDB', function(resp) {
            $('#tag-database-name').text(resp.file);
            if (resp.err) {
                $('#tagDBText').text("Error reading file: " + JSON.stringify(resp.err))
            } else {
                var table="";
                var lines = resp.data.split(/\n/);
                if (resp.file.match(/sqlite$/)) {
                    // sqlite lines are proj,id,tagFreq,dfreq,bi
                    for (var i=0; i < lines.length-1; ++i) {
                        var parts = lines[i].split(/\|/);
                        var kHz = (48 + 1 * parts[3]) % 48;
                        if (kHz > 24)
                            kHz -= 48;
                        table += ("     " + parts[1]).substr(-5) + " @ " + (1 * parts[2]).toPrecision(6) + " MHz " + kHz.toPrecision(3) + " kHz " + (1 * parts[4]) .toFixed(1) + " sec " + parts[0].replace(/"/g,"") + "\n";
                    }
                } else {
                    // .csv lines are proj,id,tagFreq,fcdFreq,g1,g2,g3,bi,dfreq,g1.sd,g2.sd,g3.sd,bi.sd,dfreq.sd,filename
                    // and have a header
                    for (var i=1; i < lines.length-1; ++i) {
                        var parts = lines[i].split(/,/);
                        var kHz = (48 + 1 * parts[8]) % 48;
                        if (kHz > 24)
                            kHz -= 48;
                        table += "tag " + ("000" + parts[1]).substr(-3) + " @ " + parts[2] + " MHz " + kHz.toPrecision(3) + " kHz " + (1 * parts[7]).toFixed(1) + " sec " +  parts[0].replace(/"/g,"") + "\n";
                    }
                }
            }
            $('#tagDBText').text(table);
        });

        socket.on('softwareUpdateResults', function(data) {
            updateUploadStatus(data.toString());
        });
    });

    socket.on('softwareUpdateResults', function(data) {
        $('#softwareUpdateResults').text(data.toString());
    });
    socket.emit('vahstatus');
    socket.emit('gpsfix');
};

load1();
