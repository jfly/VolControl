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

var lastVolume = {
	volume: 0,
	muted: false
};

function setVolume(newVolume) {
	lastVolume = newVolume;
	pushVolume();

	// Prevent injection attacks
	if(typeof newVolume.volume != "number") {
		throw "volume (" + newVolume.volume + ") must be a number, not " + (typeof newVolume.volume);
	}
	if(typeof newVolume.muted != "boolean") {
		throw "muted (" + newVolume.muted + ") must be a boolean, not " + (typeof newVolume.muted);
	}

    if(os.platform() == "win32") {
        var cmd = "VolCuntWin.exe " + (newVolume.volume/100.0);
        cmd += " " + (newVolume.muted ? "mute" : "unmute");
        exec(cmd, function(error, stdout, stderr) {
            if(error !== null) {
                console.log('exec error: ' + error);
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                assert(error !== null);
            }
        });
    } else if(os.platform() == "linux") {
        var cmd = "amixer set Master " + newVolume.volume + "%";
        cmd += " " + (newVolume.muted ? "mute" : "unmute");
        exec(cmd, function(error, stdout, stderr) {
            if(error !== null) {
                console.log('exec error: ' + error);
                console.log('stdout: ' + stdout);
                console.log('stderr: ' + stderr);
                assert(error !== null);
            }
        });
    } else {
        assert(false);
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

io.sockets.on('connection', function (socket) {
	socket.emit('volume', lastVolume);
	socket.on('volume', function(data) {
		try {
			setVolume(data);
			pushVolume();
		} catch(e) {
			if(typeof e == "string") {
				socket.emit('error', e);
			} else {
				throw e;
			}
		}
	});
});

function pushVolume() {
	var clients = io.sockets.clients();
	for(var i = 0; i < clients.length; i++) {
		clients[i].emit('volume', lastVolume);
	}
}

function pollVolume() {
	getVolume(function(newVolume) {
		var changed = ( ( lastVolume.volume != newVolume.volume ) ||
						( lastVolume.muted != newVolume.muted ) );
		lastVolume = newVolume;
		if(changed) {
			// Since it changed, we push this out, and check again immediately.
			pushVolume();
			setTimeout(pollVolume, 100);
		} else {
			// No change, so we'll wait a whole second before checking again.
			setTimeout(pollVolume, 1000);
		}
	});
}
pollVolume();
