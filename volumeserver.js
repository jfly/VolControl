var http = require('http');
var os = require('os');
var send = require('send');
var exec = require('child_process').exec;
var assert = require('assert');
var fs = require('fs');

var app = http.createServer(function(req, res){
  send(req, req.url).root('www').pipe(res);
});

var default_config = require('./default_config');
var custom_config = {};
if(fs.existsSync("./config.js")) {
    custom_config = require('./config');
}
function config(key) {
    return custom_config[key] || default_config[key];
}

app.listen(config('port'));
console.log("Listening on " + config('port'));

var io = require('socket.io').listen(app);

var volumeStatus = {
	volume: 0,
	muted: false
};

var volumeConfig = null;

function portableSetVolume(volume, callback) {
	// Prevent injection attacks
	if(typeof volume.volume != "number") {
		callback("volume (" + volume.volume + ") must be a number, not " + (typeof volume.volume), null, null);
        return;
	}
	if(typeof volume.muted != "boolean") {
		callback("muted (" + volume.muted + ") must be a boolean, not " + (typeof volume.muted), null, null);
        return;
	}

    if(os.platform() == "win32") {
        var cmd = "VolCuntWin.exe " + (volume.volume/100.0);
        cmd += " " + (volume.muted ? "mute" : "unmute");
        exec(cmd, callback);
    } else if(os.platform() == "linux") {
        var cmd = "amixer set Master " + volume.volume + "%";
        cmd += " " + (volume.muted ? "mute" : "unmute");
        exec(cmd, callback);
    } else {
        assert(false);
    }
}

var volumeWorker = null;
function setVolumeWorker() {
    var volumeConfigCopy = volumeConfig;
    portableSetVolume(
        volumeConfigCopy, 
        function(error, stdout, stderr) {
            if(error !== null) {
                console.log('exec error: ' + error);
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
            }
            if(volumeConfigCopy != volumeConfig) {
                volumeWorker = setTimeout(setVolumeWorker, 0);
            } else {
                volumeConfig = null;
                volumeWorker = null;
            }
        }
    );
}

function setVolume(newVolume) {
	volumeConfig = newVolume;
    if(volumeWorker === null) {
        volumeWorker = setTimeout(setVolumeWorker, 0);
    }
}

function getVolume(callback) {
    if(os.platform() == "win32") {
        exec("VolCuntWin.exe", function(error, stdout, stderr) {
            if(error !== null) {
                console.log('exec error: ' + error);
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                assert(error !== null);
            }
            var match = /([^ ]*)( muted)?/.exec(stdout);
            assert(match);

            var newVolume = {};
            newVolume.volume = 100*parseFloat(match[1]);
            newVolume.muted = false;
            if(match[2]) {
                newVolume.muted = true;
            }
            callback(newVolume);
        });
    } else if(os.platform() == "linux") {
        exec("amixer get Master", function(error, stdout, stderr) {
            if(error !== null) {
                console.log('exec error: ' + error);
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                assert(error !== null);
            }
            var match = /Front Left: .*\[(\d+)%\] \[(.*)\]/.exec(stdout);
            assert(match);

            var newVolume = {};
            newVolume.volume = parseInt(match[1]);
            assert(match[2] == 'off' || match[2] == 'on');
            newVolume.muted = match[2] == 'off';
            callback(newVolume);
        });
    }
}

function getVolumeJson(includeConfig) {
    var json = {};
    json.status = volumeStatus;
    if(includeConfig) {
        json.config = volumeConfig;
    }
    return json;
}

io.sockets.on('connection', function (socket) {
	socket.emit('connected', socket.id);
	socket.emit('volume', getVolumeJson(true));
	socket.on('volume', function(data) {
		try {
            data.whoDidIt = this.id;
			setVolume(data);
            pushVolumeConfig();
		} catch(e) {
			if(typeof e == "string") {
				socket.emit('error', e);
			} else {
				throw e;
			}
		}
	});
});

function pushVolumeStatus() {
    pushVolume(false);
}
function pushVolumeConfig() {
    pushVolume(true);
}

// This is such garbage. There should be separate events
// for config & status changes.
function pushVolume(includeConfig) {
	var clients = io.sockets.clients();
	for(var i = 0; i < clients.length; i++) {
		clients[i].emit('volume', getVolumeJson(includeConfig));
	}
}

function pollVolume() {
	getVolume(function(newVolume) {
		var changed = ( ( volumeStatus.volume != newVolume.volume ) ||
						( volumeStatus.muted != newVolume.muted ) );
		volumeStatus = newVolume;
		if(changed) {
			// Since it changed, we push this out, and check again immediately.
			pushVolumeStatus();
			setTimeout(pollVolume, 100);
		} else {
			// No change, so we'll wait a whole second before checking again.
			setTimeout(pollVolume, 1000);
		}
	});
}
pollVolume();
