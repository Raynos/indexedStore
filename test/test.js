var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var res = mod._cached ? mod._cached : mod();
    return res;
}

require.paths = [];
require.modules = {};
require.extensions = [".js",".coffee"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = x + '/package.json';
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key)
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

require.define = function (filename, fn) {
    var dirname = require._core[filename]
        ? ''
        : require.modules.path().dirname(filename)
    ;
    
    var require_ = function (file) {
        return require(file, dirname)
    };
    require_.resolve = function (name) {
        return require.resolve(name, dirname);
    };
    require_.modules = require.modules;
    require_.define = require.define;
    var module_ = { exports : {} };
    
    require.modules[filename] = function () {
        require.modules[filename]._cached = module_.exports;
        fn.call(
            module_.exports,
            require_,
            module_,
            module_.exports,
            dirname,
            filename
        );
        require.modules[filename]._cached = module_.exports;
        return module_.exports;
    };
};

if (typeof process === 'undefined') process = {};

if (!process.nextTick) process.nextTick = (function () {
    var queue = [];
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;
    
    if (canPost) {
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);
    }
    
    return function (fn) {
        if (canPost) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        }
        else setTimeout(fn, 0);
    };
})();

if (!process.title) process.title = 'browser';

if (!process.binding) process.binding = function (name) {
    if (name === 'evals') return require('vm')
    else throw new Error('No such module')
};

if (!process.cwd) process.cwd = function () { return '.' };

if (!process.env) process.env = {};
if (!process.argv) process.argv = [];

require.define("path", function (require, module, exports, __dirname, __filename) {
function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {}
});

require.define("/index.js", function (require, module, exports, __dirname, __filename) {
module.exports = require("./lib/factory")
});

require.define("/lib/factory.js", function (require, module, exports, __dirname, __filename) {
var indexedDB = window.indexedDB || 
        window.webkitIndexedDB || window.mozIndexedDB,
    toString = Object.prototype.toString

var Factory = {
    open: function (name, version, cb) {
        if (typeof version === "function") {
            cb = version
            version = undefined
        }
        if (version === undefined) {
            version = 1
        }
        try {
            var req = indexedDB.open(name, version)
        } catch (err) {
            throw new Error(err.message)
        }
        wrapReq(req, cb)
    },
    deleteDatabase: function (name, cb) {
        var req = indexedDB.deleteDatabase(name)
        wrapReq(req, cb)
    },
    cmp: indexedDB.cmp ? function (first, second) {
        return indexedDB.cmp(first, second)
    } : cmp,
    indexedDB: indexedDB
}

module.exports = Factory

function wrapReq(req, cb) {
    req.onsuccess = success
    req.onerror = error

    function success(ev) {
        cb(null, this.result)
    }

    function error(ev) {
        cb(this.error)
    }
}

function cmp(first, second) {
    if (Array.isArray(first)) {
        if (!Array.isArray(second)) {
            return 1
        }
        var firstLength = first.length,
            secondLength = second.length,
            length = firstLength < secondLength ? firstLength : secondLength

        for (var i = 0; i < length; i++) {
            var firstValue = first[i],
                secondValue = second[i],
                comparison = cmp(firstValue, secondValue)

            if (comparison === 1 || comparison === -1) {
                return comparison
            }
        }

        if (firstLength < secondLength) {
            return -1
        } else if (firstLength > secondLength) {
            return 1
        } else {
            return 0
        }
    } else if (typeof first === "string") {
        if (Array.isArray(second)) {
            return -1
        } else if (typeof second !== "string") {
            return 1
        }
        return compare(first, second)
    } else if (isDate(first)) {
        if (Array.isArray(second) || typeof second === "string") {
            return -1
        } else if (isNumber(second)) {
            return 1
        }
        return compare(first.valueOf(), second.valueOf())
    } else {
        if (typeof second !== "number") {
            return -1
        }
        return compare(first, second)
    }
}

function isDate(obj) {
    return toString.call(obj) == '[object Date]'
}

function compare(a, b) {
    if (a === b) {
        return 0
    } else if (a > b) {
        return 1
    } else {
        return -1
    }
}
});

require.define("/node_modules/testling/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"index.js"}
});

require.define("/node_modules/testling/index.js", function (require, module, exports, __dirname, __filename) {
var outputs = {
    text : require('./lib/output/text'),
    browser: require("./lib/output/browser")
};
if (process.title === "node") {
    var outputName = process.env.TESTLING_OUTPUT || 'text';    
} else if (process.title === "browser") {
    var outputName = process.env.TESTLING_OUTPUT || 'browser';
}

if (outputs[outputName]) {
    var output = outputs[outputName]();
}
else {
    throw [
        'Output format ' + JSON.stringify(outputName) + ' not supported.',
        'Export TESTLING_OUTPUT to set the output format.',
        'Available formats:',
        Object.keys(outputs).map(function (name) {
            return '    ' + name
        }).join('\r\n'),
        ''
    ].join('\r\n');
}

var test = module.exports = require('./lib/test');
test.output = output;

test.push = function (name, res) {
    res.browser = test.browser || 'node/jsdom';
    output(name, res);
};
output('visit', test.browser || 'node/jsdom');
output('launched', test.browser || 'node/jsdom');

});

require.define("/node_modules/testling/lib/output/text.js", function (require, module, exports, __dirname, __filename) {
var fs = require('fs');

module.exports = function () {
    var handler = new Handler;
    
    return function (name, res) {
        if (handler[name]) {
            handler[name](res);
        }
        else {
            console.error('\r\nUnknown event: ' + name);
        }
    };
};

function stringify (obj) {
    return JSON.stringify(obj);
}

function Handler () {
    this.counts = {};
    this.fails = {};
}

Handler.prototype.testBegin = function () {};
Handler.prototype.testEnd = function () {};

Handler.prototype.log = function (res) {
    this.fails[res.browser].push([ 'log', res ]);
};

Handler.prototype.visit = function (key) {
    this.fails[key] = [];
    this.write('\r' + key + '    ');
};

Handler.prototype.launched = function (key) {    
    this.fails[key] = [];
    this.writeBrowser(key);
};

Handler.prototype.assert = function (res) {
    var key = res.browser;
    var id = res.testId || 'init';
    
    var counts = this.counts;
    var fails = this.fails;
    
    if (!counts[key]) counts[key] = { inits : { pass : 0, fail : 0 } };
    if (!counts[key][id]) counts[key][id] = { pass : 0, fail : 0 };
    var count = counts[key][id];
    
    if (res.ok) count.pass ++;
    else {
        count.fail ++;
        fails[key].push([ 'assert', res ]);
    }
    if (count.plan) this.writeBrowser(key);
};

Handler.prototype.plan = function (res) {
    var key = res.browser;
    var id = res.testId || 'init';
    var counts = this.counts;
    
    if (key) {
        if (!counts[key]) counts[key] = { inits : { pass : 0, fail : 0 } };
        if (!counts[key][id]) counts[key][id] = { pass : 0, fail : 0 };
        var count = counts[key][id];
        
        if (res.n) count.plan = res.n;
    }
};

Handler.prototype.end = function (res) {
    var self = this;
    
    var key = res.browser;
    var id = res.testId || 'init';
    
    this.writeBrowser(key);
    this.write('\r\n');
    
    (this.fails[key] || []).forEach(function (xs) {
        function str (x) {
            return JSON.stringify(x);
        }
        
        var name = xs[0];
        if (name === 'log') {
            var m = xs[1].message;
            self.write('  Log: '
                + (typeof m === 'string' ? m : str(m))
                + '\r\n'
            );
        }
        else if (name === 'assert' && xs[1].type === 'error') {
            var err = xs[1].error;
            var msg = err && err.message || err;
            self.write('  Error: ' + msg + '\r\n');
            if (err.stack) {
                var s = err.stack.split(/\r?\n/).slice(1).join('\r\n');
                self.write(s + '\r\n');
            }
        }
        else if (name === 'assert') {
            var fail = xs[1];
            self.write('  Error in ' + fail.type + '(): ');
            if (fail.type === 'fail') {
                self.write(
                    typeof fail.found === 'string'
                        ? fail.found : str(fail.found)
                );
            }
            else if (fail.type === 'equal') {
                self.write(str(fail.wanted) + ' == ' + str(fail.found));
            }
            else if (fail.type === 'notEqual') {
                self.write(str(fail.wanted) + ' != ' + str(fail.found));
            }
            else if (fail.type === 'strictEqual') {
                self.write(str(fail.wanted) + ' === ' + str(fail.found));
            }
            else if (fail.type === 'strictNotEqual') {
                self.write(str(fail.wanted) + ' !== ' + str(fail.found));
            }
            else if (fail.type === 'ok') {
                self.write('ok(' + str(fail.found) + ')');
            }
            else if (fail.type === 'notOk') {
                self.write('notOk(' + str(fail.found) + ')');
            }
            else {
                self.write('  wanted: ' + str(fail.wanted) + ', '
                    + 'found: ' + str(fail.found) + '\r\n');
            }
            
            self.write('\r\n');
            if (fail.stack) {
                self.write(fail.stack + '\r\n');
                var m = fail.stack.match(/^\s*at (\/[^:]+):(\d+):(\d+)/);
                if (m) {
                    var line = m[2], col = m[3];
                    var lines = fs.readFileSync(m[1], 'utf8').split('\n');
                    var s = lines[line - 1].trim();
                    self.write('\r\n  > ' + s + '\r\n\r\n');
                }
            }
        }
    });
};

Handler.prototype.finished = function () {
    var self = this;
    var total = { pass : 0, fail : 0 };
    var counts = this.counts;
    
    Object.keys(counts).forEach(function (key) {
        Object.keys(counts[key]).forEach(function (id) {
            total.pass += counts[key][id].pass;
            total.fail += counts[key][id].fail;
        });
    });
    
    counts.total = { total : total };
    
    this.write('\r\n');
    this.writeBrowser('total');
    
    process.nextTick(function () {
        self.write('\r\n');
    });
};

Handler.prototype.error = function (res) {
    if (res.browser && this.fails[res.browser]) {
        if (counts[res.browser]) {
            counts[res.browser][res.testId || 'init'].fail ++;
        }
        this.fails[res.browser].push([ 'error', res ]);
    }
    else {
        this.write([
            '',
            'Unexpected error: ' + JSON.stringify(res),
            '',
            ''
        ].join('\r\n'));
    }
};

Handler.prototype.write = function (msg) {
    process.stdout.write(msg);
};

Handler.prototype.writeBrowser = function (key) {
    var counts = this.counts;
    var fails = this.fails;
    
    if (!counts[key]) counts[key] = { init : { pass : 0, fail : 0 } };
    
    var count = Object.keys(counts[key]).reduce(function (acc, id) {
        acc.pass += counts[key][id].pass;
        acc.fail += counts[key][id].fail;
        return acc;
    }, { pass : 0, fail : 0 });
    
    var percent = count.pass + count.fail <= 0
        ? '0'
        : Math.floor(100 * count.pass / (count.pass + count.fail))
    ;
    
    function padRight (n, s) {
        s = s.toString();
        return s + Array(Math.max(0, n + 1 - s.length)).join(' ');
    }
    
    function padLeft (n, s) {
        s = s.toString();
        return Array(Math.max(0, n - s.length) + 1).join(' ') + s;
    }
    
    this.write('\r'
        + padRight(24, key)
        + '  '
        + padLeft(9, count.pass + '/' + (count.pass + count.fail))
        + '  '
        + padLeft(3, percent) + ' % ok'
    );
};

});

require.define("fs", function (require, module, exports, __dirname, __filename) {
// nothing to see here... no file methods for the browser

});

require.define("/node_modules/testling/lib/output/browser.js", function (require, module, exports, __dirname, __filename) {
var div

module.exports = function () {
    var handler = new Handler;
    div = document.createElement("div")
    window.onload = function () {
        document.body.appendChild(div)    
    }
    
    return function (name, res) {
        if (handler[name]) {
            handler[name](res);
        }
        else {
            console.error('\r\nUnknown event: ' + name);
        }
    };
};

function stringify (obj) {
    return JSON.stringify(obj);
}

function Handler () {
    this.counts = {};
    this.fails = {};
}

Handler.prototype.testBegin = function () {};
Handler.prototype.testEnd = function () {};

Handler.prototype.log = function (res) {
    this.fails[res.browser].push([ 'log', res ]);
};

Handler.prototype.visit = function (key) {
    this.fails[key] = [];
    this.write('\r' + key + '    ');
};

Handler.prototype.launched = function (key) {    
    this.fails[key] = [];
    this.writeBrowser(key);
};

Handler.prototype.assert = function (res) {
    var key = res.browser;
    var id = res.testId || 'init';
    
    var counts = this.counts;
    var fails = this.fails;
    
    if (!counts[key]) counts[key] = { inits : { pass : 0, fail : 0 } };
    if (!counts[key][id]) counts[key][id] = { pass : 0, fail : 0 };
    var count = counts[key][id];
    
    if (res.ok) count.pass ++;
    else {
        count.fail ++;
        fails[key].push([ 'assert', res ]);
    }
    if (count.plan) this.writeBrowser(key);
};

Handler.prototype.plan = function (res) {
    var key = res.browser;
    var id = res.testId || 'init';
    var counts = this.counts;
    
    if (key) {
        if (!counts[key]) counts[key] = { inits : { pass : 0, fail : 0 } };
        if (!counts[key][id]) counts[key][id] = { pass : 0, fail : 0 };
        var count = counts[key][id];
        
        if (res.n) count.plan = res.n;
    }
};

Handler.prototype.end = function (res) {
    var self = this;
    
    var key = res.browser;
    var id = res.testId || 'init';
    
    this.writeBrowser(key);
    this.write('\r\n');
    
    (this.fails[key] || []).forEach(function (xs) {
        function str (x) {
            return JSON.stringify(x);
        }
        
        var name = xs[0];
        if (name === 'log') {
            var m = xs[1].message;
            self.write('  Log: '
                + (typeof m === 'string' ? m : str(m))
                + '\r\n'
            );
        }
        else if (name === 'assert' && xs[1].type === 'error') {
            var err = xs[1].error;
            var msg = err && err.message || err;
            self.write('  Error: ' + msg + '\r\n');
            if (err.stack) {
                var s = err.stack.split(/\r?\n/).slice(1).join('\r\n');
                self.write(s + '\r\n');
            }
        }
        else if (name === 'assert') {
            var fail = xs[1];
            self.write('  Error in ' + fail.type + '(): ');
            if (fail.type === 'fail') {
                self.write(
                    typeof fail.found === 'string'
                        ? fail.found : str(fail.found)
                );
            }
            else if (fail.type === 'equal') {
                self.write(str(fail.wanted) + ' == ' + str(fail.found));
            }
            else if (fail.type === 'notEqual') {
                self.write(str(fail.wanted) + ' != ' + str(fail.found));
            }
            else if (fail.type === 'strictEqual') {
                self.write(str(fail.wanted) + ' === ' + str(fail.found));
            }
            else if (fail.type === 'strictNotEqual') {
                self.write(str(fail.wanted) + ' !== ' + str(fail.found));
            }
            else if (fail.type === 'ok') {
                self.write('ok(' + str(fail.found) + ')');
            }
            else if (fail.type === 'notOk') {
                self.write('notOk(' + str(fail.found) + ')');
            }
            else {
                self.write('  wanted: ' + str(fail.wanted) + ', '
                    + 'found: ' + str(fail.found) + '\r\n');
            }
            
            self.write('\r\n');
            if (fail.stack) {
                self.write(fail.stack + '\r\n');
            }
        }
    });
};

Handler.prototype.finished = function () {
    var self = this;
    var total = { pass : 0, fail : 0 };
    var counts = this.counts;
    
    Object.keys(counts).forEach(function (key) {
        Object.keys(counts[key]).forEach(function (id) {
            total.pass += counts[key][id].pass;
            total.fail += counts[key][id].fail;
        });
    });
    
    counts.total = { total : total };
    
    this.write('\r\n');
    this.writeBrowser('total');
    
    process.nextTick(function () {
        self.write('\r\n');
    });
};

Handler.prototype.error = function (res) {
    if (res.browser && this.fails[res.browser]) {
        if (counts[res.browser]) {
            counts[res.browser][res.testId || 'init'].fail ++;
        }
        this.fails[res.browser].push([ 'error', res ]);
    }
    else {
        this.write([
            '',
            'Unexpected error: ' + JSON.stringify(res),
            '',
            ''
        ].join('\r\n'));
    }
};

Handler.prototype.write = function (msg) {
    var d = document.createElement("div")
    d.textContent = msg
    div.appendChild(d)
};

Handler.prototype.writeBrowser = function (key) {
    var counts = this.counts;
    var fails = this.fails;
    
    if (!counts[key]) counts[key] = { init : { pass : 0, fail : 0 } };
    
    var count = Object.keys(counts[key]).reduce(function (acc, id) {
        acc.pass += counts[key][id].pass;
        acc.fail += counts[key][id].fail;
        return acc;
    }, { pass : 0, fail : 0 });
    
    var percent = count.pass + count.fail <= 0
        ? '0'
        : Math.floor(100 * count.pass / (count.pass + count.fail))
    ;
    
    function padRight (n, s) {
        s = s.toString();
        return s + Array(Math.max(0, n + 1 - s.length)).join(' ');
    }
    
    function padLeft (n, s) {
        s = s.toString();
        return Array(Math.max(0, n - s.length) + 1).join(' ') + s;
    }
    
    this.write('\r'
        + padRight(24, key)
        + '  '
        + padLeft(9, count.pass + '/' + (count.pass + count.fail))
        + '  '
        + padLeft(3, percent) + ' % ok'
    );
};

});

require.define("/node_modules/testling/lib/test.js", function (require, module, exports, __dirname, __filename) {
var http = require('http');
var EventEmitter = require('events').EventEmitter;
var url = require('url');
var path = require('path');

var deepEqual = require('./deep_equal');
var pending = 0;

var test = module.exports = function (name, cb) {
    if (typeof name === 'function') {
        cb = name;
        name = undefined;
    }
    
    var t = new Test(name, test.push);
    pending ++;
    
    t.on('testEnd', function () {
        pending --;
        process.nextTick(function () {
            if (pending <= 0) t.push('end', {});
            harness.emit('end', t);
        });
    });
    
    cb(t);
};

var harness = test.harness = new EventEmitter;

var testId = 0;
function Test (name, push) {
    this.id = testId ++;
    this.push = push;
    push('testBegin', { name : name, testId : this.id });
    
    this.counts = {
        plan : undefined,
        pass : 0,
        fail : 0
    };
    this.windows = [];
}

Test.prototype = new EventEmitter;

Test.prototype.assert = function (res) {
    if (res.ok) this.counts.pass ++
    else this.counts.fail ++
    
    if (this.counts.plan !== undefined
    && this.counts.pass + this.counts.fail > this.counts.plan) {
        this.push('fail', {
            type : 'fail',
            ok : false,
            found : this.counts.fail + this.counts.pass,
            wanted : this.counts.plan,
            name : 'more tests run than planned',
            testId : this.id
        });
    }
    
    res.testId = this.id;
    this.push('assert', res);
    if (!res.ok) res.stack = stack();
    
    if (this.counts.plan !== undefined
    && this.counts.plan === this.counts.pass + this.counts.fail) {
        this.end();
    }
};

Test.prototype.ok = function (value, name) {
    this.assert({
        type : 'ok',
        ok : !!value,
        name : name,
        found : Boolean(value),
        wanted : true
    });
};

Test.prototype.notOk = function (value, name) {
    this.assert({
        type : 'ok',
        ok : !!!value,
        name : name,
        found : Boolean(value),
        wanted : false
    });
};

Test.prototype.fail = function (value, name) {
    this.assert({
        type : 'fail',
        ok : false,
        name : name,
        found : value,
        wanted : undefined,
        stack : stack()
    });
};

Test.prototype.equal = function (found, wanted, name) {
    this.assert({
        type : 'equal',
        ok : found == wanted,
        name : name,
        found : found,
        wanted : wanted
    });
};

Test.prototype.notEqual = function (found, wanted, name) {
    this.assert({
        type : 'notEqual',
        ok : found != wanted,
        name : name,
        found : found,
        wanted : wanted
    });
};

Test.prototype.deepEqual = function (found, wanted, name) {
    this.assert({
        type : 'deepEqual',
        ok : deepEqual(found, wanted),
        name : name,
        found : found,
        wanted : wanted
    });
};

Test.prototype.notDeepEqual = function (found, wanted, name) {
    this.assert({
        type : 'notDeepEqual',
        ok : !deepEqual(found, wanted),
        name : name,
        found : found,
        wanted : wanted
    });
};

Test.prototype.strictEqual = function (found, wanted, name) {
    this.assert({
        type : 'strictEqual',
        ok : found === wanted,
        name : name,
        found : found,
        wanted : wanted
    });
};

Test.prototype.notStrictEqual = function (found, wanted, name) {
    this.assert({
        type : 'strictEqual',
        ok : found !== wanted,
        name : name,
        found : found,
        wanted : wanted
    });
};

function checkThrows (shouldThrow, fn, expected, name) {
    if (typeof expected === 'string') {
        name = expected;
        expected = null;
    }
    var ok = !shouldThrow, err = undefined;
    
    try { fn() }
    catch (e) {
        ok = !ok;
        err = e;
    }
    
    this.assert({
        type : shouldThrow ? 'throws' : 'doesNotThrow',
        ok : ok,
        found : err,
        expected : expected
    });
}

Test.prototype['throws'] = function (fn, expected, name) {
    checkThrows.call(this, true, fn, expected, name);
};

Test.prototype.doesNotThrow = function (fn, expected, name) {
    checkThrows.call(this, false, fn, expected, name);
};

Test.prototype.ifError = function (err, name) {
    this.assert({
        type : 'ifError',
        ok : !!!err,
        name : name,
        found : err,
        wanted : undefined
    });
};

Test.prototype.plan = function (n) {
    if (this.counts.plan === undefined) {
        this.counts.plan = n;
    }
    else {
        this.counts.plan += n;
    }
    this.push('plan', { testId : this.id, n : n });
};

Test.prototype.log = function (msg) {
    this.push('log', { testId : this.id, message : msg });
};

Test.prototype.end = function () {
    if (this.counts.plan !== undefined
    && this.counts.plan > this.counts.fail + this.counts.pass) {
        this.push('planFail', {
            type : 'fail',
            ok : false,
            found : this.counts.fail + this.counts.pass,
            wanted : this.counts.plan,
            name : 'more tests planned than run',
            testId : this.id
        });
    }
    
    if (!this.ended) {
        this.ended = true;
        this.push('testEnd', { testId : this.id });
        this.emit('testEnd');
    }
};

if (process.title === "node") {
    var jsdom = (require)('jsdom');
    var fs = require('fs');
    var emptyHtml = '<html><head></head><body></body></html>';

    var jqueryWin = jsdom.jsdom(
        '<html><head><script>'
        + fs.readFileSync(__dirname + '/../vendor/jquery-1.6.min.js', 'utf8')
        + '</script></head><body></body></html>'
    ).createWindow();

    Test.prototype.createWindow = function (url, opts, cb) {
        if (typeof url === 'object') {
            cb = opts;
            opts = url;
            url = opts.url;
        }
        
        if (typeof opts === 'function') {
            cb = opts;
            opts = {};
        }
        if (!opts) opts = {};
        opts.url = url;
        
        var win = createWindow(this, opts, cb);
        this.windows.push(win);
        return win;
    };

    Test.prototype.submitForm = function (form, params, cb) {
        if (typeof params === 'function') {
            cb = params;
            params = {};
        }
        if (!params) params = {};
        
        if (form[0]) {
            if (form[0] instanceof jsdom.defaultLevel.HTMLFormElement
            || form[0].elements) {
                form = form[0];
            }
        }
        
        if (!form.elements) {
            this.fail('encountered a non-form element');
            return;
        }
        
        var pairs = [];
        
        var len = 0;
        for (var i = 0; i < form.elements.length; i++) {
            if (form.elements[i].name) {
                len += form.elements[i].name.length
                    + 1 + form.elements[i].value.length;
                pairs.push(
                    escape(form.elements[i].name)
                    + '='
                    + escape(form.elements[i].value)
                );
            }
        }
        
        var data = pairs.join('&');
        var pwin = form.ownerDocument.parentWindow;
        
        var opts = {
            url : form.action || pwin.location.href.split('?')[0],
            method : form.method || 'GET',
            data : data,
            headers : params.headers || {}
        };
        
        if (!opts.url.match(/^https?:/)) {
            opts.url = pwin.location.protocol + '//' + pwin.location.host
                + path.resolve(path.dirname(pwin.location.path), opts.url)
            ;
        }
        
        if (opts.method === 'POST') {
            if (!opts.headers['content-length']
            && opts.headers['transfer-encoding'] !== 'chunked') {
                opts.headers['content-length'] = len + 1;
            }
        }
        
        var win = createWindow(this, opts, cb);
        this.windows.push(win);
        return win;
    };

    function createWindow (self, opts, cb) {
        if (opts.url && !opts.host) {
            var u = url.parse(opts.url);
            opts.path = u.pathname + (u.search || '');
            opts.host = u.hostname;
            opts.port = u.port || (u.proto === 'https' ? 443 : 80);
        }
        if (!opts.headers) opts.headers = {};
        opts.method = (opts.method || 'GET').toUpperCase();
        
        if (opts.data) {
            if (opts.method === 'GET') {
                opts.path = opts.path.split('?')[0] + '?' + opts.data;
            }
            else if (opts.method === 'POST') {
                if (!opts.headers['content-length']
                && opts.headers['transfer-encoding'] !== 'chunked') {
                    opts.headers['content-length'] = opts.data.length;
                }
            }
        }
        
        if (!opts.url) {
            opts.url = (opts.proto.replace(/:\/*$/, '') || 'http')
                + opts.host + (opts.port ? ':' + opts.port : '')
                + (opts.path || '/')
            ;
        }
        
        var doc = jsdom.jsdom(emptyHtml, '3', {
            deferClose : true,
            url : opts.url
        });
        
        var win = doc.createWindow();
        
        win.addEventListener('load', function () {
            var ts = doc.getElementsByTagName('title');
            if (ts.length) doc.title = ts[0] && ts[0].textContent || '';
            
            try {
                cb(win, function (x, y) {
                    return y === undefined
                        ? jqueryWin.$(x, doc)
                        : jqueryWin.$(x, y)
                });
            }
            catch (err) {
                self.assert({
                    type : 'error',
                    error : err
                });
                self.end();
            }
        });
        
        var req = http.request(opts, function (res) {
            res.on('data', function (buf) {
                doc.write(buf.toString());
            });
            
            res.on('end', function () {
                doc.close();
            });
        });
        
        if (opts.method === 'POST' && opts.data) {
            req.write(opts.data + '\r\n');
        }
        req.end();
        
        return win;
    }
}

function stack () {
    var lines = new Error().stack.split('\n').slice(4,-4);
    return lines.join('\n');
}

});

require.define("http", function (require, module, exports, __dirname, __filename) {
module.exports = require("http-browserify")
});

require.define("/node_modules/http-browserify/package.json", function (require, module, exports, __dirname, __filename) {
module.exports = {"main":"index.js","browserify":"index.js"}
});

require.define("/node_modules/http-browserify/index.js", function (require, module, exports, __dirname, __filename) {
var http = module.exports;
var EventEmitter = require('events').EventEmitter;
var Request = require('./lib/request');

http.request = function (params, cb) {
    if (!params) params = {};
    if (!params.host) params.host = window.location.host.split(':')[0];
    if (!params.port) params.port = window.location.port;
    
    var req = new Request(new xhrHttp, params);
    if (cb) req.on('response', cb);
    return req;
};

http.get = function (params, cb) {
    params.method = 'GET';
    var req = http.request(params, cb);
    req.end();
    return req;
};

http.Agent = function () {};
http.Agent.defaultMaxSockets = 4;

var xhrHttp = (function () {
    if (typeof window === 'undefined') {
        throw new Error('no window object present');
    }
    else if (window.XMLHttpRequest) {
        return window.XMLHttpRequest;
    }
    else if (window.ActiveXObject) {
        var axs = [
            'Msxml2.XMLHTTP.6.0',
            'Msxml2.XMLHTTP.3.0',
            'Microsoft.XMLHTTP'
        ];
        for (var i = 0; i < axs.length; i++) {
            try {
                var ax = new(window.ActiveXObject)(axs[i]);
                return function () {
                    if (ax) {
                        var ax_ = ax;
                        ax = null;
                        return ax_;
                    }
                    else {
                        return new(window.ActiveXObject)(axs[i]);
                    }
                };
            }
            catch (e) {}
        }
        throw new Error('ajax not supported in this browser')
    }
    else {
        throw new Error('ajax not supported in this browser');
    }
})();

});

require.define("events", function (require, module, exports, __dirname, __filename) {
if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = list.indexOf(listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("/node_modules/http-browserify/lib/request.js", function (require, module, exports, __dirname, __filename) {
var EventEmitter = require('events').EventEmitter;
var Response = require('./response');

var Request = module.exports = function (xhr, params) {
    var self = this;
    self.xhr = xhr;
    self.body = '';
    
    var uri = params.host + ':' + params.port + (params.path || '/');
    
    xhr.open(
        params.method || 'GET',
        (params.scheme || 'http') + '://' + uri,
        true
    );
    
    if (params.headers) {
        Object.keys(params.headers).forEach(function (key) {
            if (!self.isSafeRequestHeader(key)) return;
            var value = params.headers[key];
            if (Array.isArray(value)) {
                value.forEach(function (v) {
                    xhr.setRequestHeader(key, v);
                });
            }
            else xhr.setRequestHeader(key, value)
        });
    }
    
    var res = new Response;
    res.on('ready', function () {
        self.emit('response', res);
    });
    
    xhr.onreadystatechange = function () {
        res.handle(xhr);
    };
};

Request.prototype = new EventEmitter;

Request.prototype.setHeader = function (key, value) {
    if ((Array.isArray && Array.isArray(value))
    || value instanceof Array) {
        for (var i = 0; i < value.length; i++) {
            this.xhr.setRequestHeader(key, value[i]);
        }
    }
    else {
        this.xhr.setRequestHeader(key, value);
    }
};

Request.prototype.write = function (s) {
    this.body += s;
};

Request.prototype.end = function (s) {
    if (s !== undefined) this.write(s);
    this.xhr.send(this.body);
};

// Taken from http://dxr.mozilla.org/mozilla/mozilla-central/content/base/src/nsXMLHttpRequest.cpp.html
Request.unsafeHeaders = [
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "content-transfer-encoding",
    "date",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
];

Request.prototype.isSafeRequestHeader = function (headerName) {
    if (!headerName) return false;
    return (Request.unsafeHeaders.indexOf(headerName.toLowerCase()) === -1)
};

});

require.define("/node_modules/http-browserify/lib/response.js", function (require, module, exports, __dirname, __filename) {
var EventEmitter = require('events').EventEmitter;

var Response = module.exports = function (res) {
    this.offset = 0;
};

Response.prototype = new EventEmitter;

var capable = {
    streaming : true,
    status2 : true
};

function parseHeaders (res) {
    var lines = res.getAllResponseHeaders().split(/\r?\n/);
    var headers = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') continue;
        
        var m = line.match(/^([^:]+):\s*(.*)/);
        if (m) {
            var key = m[1].toLowerCase(), value = m[2];
            
            if (headers[key] !== undefined) {
                if ((Array.isArray && Array.isArray(headers[key]))
                || headers[key] instanceof Array) {
                    headers[key].push(value);
                }
                else {
                    headers[key] = [ headers[key], value ];
                }
            }
            else {
                headers[key] = value;
            }
        }
        else {
            headers[line] = true;
        }
    }
    return headers;
}

Response.prototype.getHeader = function (key) {
    return this.headers[key.toLowerCase()];
};

Response.prototype.handle = function (res) {
    if (res.readyState === 2 && capable.status2) {
        try {
            this.statusCode = res.status;
            this.headers = parseHeaders(res);
        }
        catch (err) {
            capable.status2 = false;
        }
        
        if (capable.status2) {
            this.emit('ready');
        }
    }
    else if (capable.streaming && res.readyState === 3) {
        try {
            if (!this.statusCode) {
                this.statusCode = res.status;
                this.headers = parseHeaders(res);
                this.emit('ready');
            }
        }
        catch (err) {}
        
        try {
            this.write(res);
        }
        catch (err) {
            capable.streaming = false;
        }
    }
    else if (res.readyState === 4) {
        if (!this.statusCode) {
            this.statusCode = res.status;
            this.emit('ready');
        }
        this.write(res);
        
        if (res.error) {
            this.emit('error', res.responseText);
        }
        else this.emit('end');
    }
};

Response.prototype.write = function (res) {
    if (res.responseText.length > this.offset) {
        this.emit('data', res.responseText.slice(this.offset));
        this.offset = res.responseText.length;
    }
};

});

require.define("url", function (require, module, exports, __dirname, __filename) {
var punycode = { encode : function (s) { return s } };

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

function arrayIndexOf(array, subject) {
    for (var i = 0, j = array.length; i < j; i++) {
        if(array[i] == subject) return i;
    }
    return -1;
}

var objectKeys = Object.keys || function objectKeys(object) {
    if (object !== Object(object)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in object) if (object.hasOwnProperty(key)) keys[keys.length] = key;
    return keys;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]+$/,
    // RFC 2396: characters reserved for delimiting URLs.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],
    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '~', '[', ']', '`'].concat(delims),
    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''],
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#']
      .concat(unwise).concat(autoEscape),
    nonAuthChars = ['/', '@', '?', '#'].concat(delims),
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-zA-Z0-9][a-z0-9A-Z_-]{0,62}$/,
    hostnamePartStart = /^([a-zA-Z0-9][a-z0-9A-Z_-]{0,62})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always have a path component.
    pathedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof(url) === 'object' && url.href) return url;

  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var out = {},
      rest = url;

  // cut off any delimiters.
  // This is to support parse stuff like "<http://foo.com>"
  for (var i = 0, l = rest.length; i < l; i++) {
    if (arrayIndexOf(delims, rest.charAt(i)) === -1) break;
  }
  if (i !== 0) rest = rest.substr(i);


  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    out.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      out.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {
    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    // don't enforce full RFC correctness, just be unstupid about it.

    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the first @ sign, unless some non-auth character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    var atSign = arrayIndexOf(rest, '@');
    if (atSign !== -1) {
      // there *may be* an auth
      var hasAuth = true;
      for (var i = 0, l = nonAuthChars.length; i < l; i++) {
        var index = arrayIndexOf(rest, nonAuthChars[i]);
        if (index !== -1 && index < atSign) {
          // not a valid auth.  Something like http://foo.com/bar@baz/
          hasAuth = false;
          break;
        }
      }
      if (hasAuth) {
        // pluck off the auth portion.
        out.auth = rest.substr(0, atSign);
        rest = rest.substr(atSign + 1);
      }
    }

    var firstNonHost = -1;
    for (var i = 0, l = nonHostChars.length; i < l; i++) {
      var index = arrayIndexOf(rest, nonHostChars[i]);
      if (index !== -1 &&
          (firstNonHost < 0 || index < firstNonHost)) firstNonHost = index;
    }

    if (firstNonHost !== -1) {
      out.host = rest.substr(0, firstNonHost);
      rest = rest.substr(firstNonHost);
    } else {
      out.host = rest;
      rest = '';
    }

    // pull out port.
    var p = parseHost(out.host);
    var keys = objectKeys(p);
    for (var i = 0, l = keys.length; i < l; i++) {
      var key = keys[i];
      out[key] = p[key];
    }

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    out.hostname = out.hostname || '';

    // validate a little.
    if (out.hostname.length > hostnameMaxLen) {
      out.hostname = '';
    } else {
      var hostparts = out.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            out.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    // hostnames are always lower case.
    out.hostname = out.hostname.toLowerCase();

    // IDNA Support: Returns a puny coded representation of "domain".
    // It only converts the part of the domain name that
    // has non ASCII characters. I.e. it dosent matter if
    // you call it with a domain that already is in ASCII.
    var domainArray = out.hostname.split('.');
    var newOut = [];
    for (var i = 0; i < domainArray.length; ++i) {
      var s = domainArray[i];
      newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
          'xn--' + punycode.encode(s) : s);
    }
    out.hostname = newOut.join('.');

    out.host = (out.hostname || '') +
        ((out.port) ? ':' + out.port : '');
    out.href += out.host;
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }

    // Now make sure that delims never appear in a url.
    var chop = rest.length;
    for (var i = 0, l = delims.length; i < l; i++) {
      var c = arrayIndexOf(rest, delims[i]);
      if (c !== -1) {
        chop = Math.min(c, chop);
      }
    }
    rest = rest.substr(0, chop);
  }


  // chop off from the tail first.
  var hash = arrayIndexOf(rest, '#');
  if (hash !== -1) {
    // got a fragment string.
    out.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = arrayIndexOf(rest, '?');
  if (qm !== -1) {
    out.search = rest.substr(qm);
    out.query = rest.substr(qm + 1);
    if (parseQueryString) {
      out.query = querystring.parse(out.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    out.search = '';
    out.query = {};
  }
  if (rest) out.pathname = rest;
  if (slashedProtocol[proto] &&
      out.hostname && !out.pathname) {
    out.pathname = '/';
  }

  //to support http.request
  if (out.pathname || out.search) {
    out.path = (out.pathname ? out.pathname : '') +
               (out.search ? out.search : '');
  }

  // finally, reconstruct the href based on what has been validated.
  out.href = urlFormat(out);
  return out;
}

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (typeof(obj) === 'string') obj = urlParse(obj);

  var auth = obj.auth || '';
  if (auth) {
    auth = auth.split('@').join('%40');
    for (var i = 0, l = nonAuthChars.length; i < l; i++) {
      var nAC = nonAuthChars[i];
      auth = auth.split(nAC).join(encodeURIComponent(nAC));
    }
    auth += '@';
  }

  var protocol = obj.protocol || '',
      host = (obj.host !== undefined) ? auth + obj.host :
          obj.hostname !== undefined ? (
              auth + obj.hostname +
              (obj.port ? ':' + obj.port : '')
          ) :
          false,
      pathname = obj.pathname || '',
      query = obj.query &&
              ((typeof obj.query === 'object' &&
                objectKeys(obj.query).length) ?
                 querystring.stringify(obj.query) :
                 '') || '',
      search = obj.search || (query && ('?' + query)) || '',
      hash = obj.hash || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (obj.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  return protocol + host + pathname + search + hash;
}

function urlResolve(source, relative) {
  return urlFormat(urlResolveObject(source, relative));
}

function urlResolveObject(source, relative) {
  if (!source) return relative;

  source = urlParse(urlFormat(source), false, true);
  relative = urlParse(urlFormat(relative), false, true);

  // hash is always overridden, no matter what.
  source.hash = relative.hash;

  if (relative.href === '') {
    source.href = urlFormat(source);
    return source;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    relative.protocol = source.protocol;
    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[relative.protocol] &&
        relative.hostname && !relative.pathname) {
      relative.path = relative.pathname = '/';
    }
    relative.href = urlFormat(relative);
    return relative;
  }

  if (relative.protocol && relative.protocol !== source.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      relative.href = urlFormat(relative);
      return relative;
    }
    source.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      relative.pathname = relPath.join('/');
    }
    source.pathname = relative.pathname;
    source.search = relative.search;
    source.query = relative.query;
    source.host = relative.host || '';
    source.auth = relative.auth;
    source.hostname = relative.hostname || relative.host;
    source.port = relative.port;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.slashes = source.slashes || relative.slashes;
    source.href = urlFormat(source);
    return source;
  }

  var isSourceAbs = (source.pathname && source.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host !== undefined ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (source.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = source.pathname && source.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = source.protocol &&
          !slashedProtocol[source.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // source.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {

    delete source.hostname;
    delete source.port;
    if (source.host) {
      if (srcPath[0] === '') srcPath[0] = source.host;
      else srcPath.unshift(source.host);
    }
    delete source.host;
    if (relative.protocol) {
      delete relative.hostname;
      delete relative.port;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      delete relative.host;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    source.host = (relative.host || relative.host === '') ?
                      relative.host : source.host;
    source.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : source.hostname;
    source.search = relative.search;
    source.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    source.search = relative.search;
    source.query = relative.query;
  } else if ('search' in relative) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      source.hostname = source.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = source.host && arrayIndexOf(source.host, '@') > 0 ?
                       source.host.split('@') : false;
      if (authInHost) {
        source.auth = authInHost.shift();
        source.host = source.hostname = authInHost.shift();
      }
    }
    source.search = relative.search;
    source.query = relative.query;
    //to support http.request
    if (source.pathname !== undefined || source.search !== undefined) {
      source.path = (source.pathname ? source.pathname : '') +
                    (source.search ? source.search : '');
    }
    source.href = urlFormat(source);
    return source;
  }
  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    delete source.pathname;
    //to support http.request
    if (!source.search) {
      source.path = '/' + source.search;
    } else {
      delete source.path;
    }
    source.href = urlFormat(source);
    return source;
  }
  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (source.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    source.hostname = source.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = source.host && arrayIndexOf(source.host, '@') > 0 ?
                     source.host.split('@') : false;
    if (authInHost) {
      source.auth = authInHost.shift();
      source.host = source.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (source.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  source.pathname = srcPath.join('/');
  //to support request.http
  if (source.pathname !== undefined || source.search !== undefined) {
    source.path = (source.pathname ? source.pathname : '') +
                  (source.search ? source.search : '');
  }
  source.auth = relative.auth || source.auth;
  source.slashes = source.slashes || relative.slashes;
  source.href = urlFormat(source);
  return source;
}

function parseHost(host) {
  var out = {};
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    out.port = port.substr(1);
    host = host.substr(0, host.length - port.length);
  }
  if (host) out.hostname = host;
  return out;
}

});

require.define("querystring", function (require, module, exports, __dirname, __filename) {
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    };

var objectKeys = Object.keys || function objectKeys(object) {
    if (object !== Object(object)) throw new TypeError('Invalid object');
    var keys = [];
    for (var key in object) if (object.hasOwnProperty(key)) keys[keys.length] = key;
    return keys;
}


/*!
 * querystring
 * Copyright(c) 2010 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

/**
 * Library version.
 */

exports.version = '0.3.1';

/**
 * Object#toString() ref for stringify().
 */

var toString = Object.prototype.toString;

/**
 * Cache non-integer test regexp.
 */

var notint = /[^0-9]/;

/**
 * Parse the given query `str`, returning an object.
 *
 * @param {String} str
 * @return {Object}
 * @api public
 */

exports.parse = function(str){
  if (null == str || '' == str) return {};

  function promote(parent, key) {
    if (parent[key].length == 0) return parent[key] = {};
    var t = {};
    for (var i in parent[key]) t[i] = parent[key][i];
    parent[key] = t;
    return t;
  }

  return String(str)
    .split('&')
    .reduce(function(ret, pair){
      try{ 
        pair = decodeURIComponent(pair.replace(/\+/g, ' '));
      } catch(e) {
        // ignore
      }

      var eql = pair.indexOf('=')
        , brace = lastBraceInKey(pair)
        , key = pair.substr(0, brace || eql)
        , val = pair.substr(brace || eql, pair.length)
        , val = val.substr(val.indexOf('=') + 1, val.length)
        , parent = ret;

      // ?foo
      if ('' == key) key = pair, val = '';

      // nested
      if (~key.indexOf(']')) {
        var parts = key.split('[')
          , len = parts.length
          , last = len - 1;

        function parse(parts, parent, key) {
          var part = parts.shift();

          // end
          if (!part) {
            if (isArray(parent[key])) {
              parent[key].push(val);
            } else if ('object' == typeof parent[key]) {
              parent[key] = val;
            } else if ('undefined' == typeof parent[key]) {
              parent[key] = val;
            } else {
              parent[key] = [parent[key], val];
            }
          // array
          } else {
            obj = parent[key] = parent[key] || [];
            if (']' == part) {
              if (isArray(obj)) {
                if ('' != val) obj.push(val);
              } else if ('object' == typeof obj) {
                obj[objectKeys(obj).length] = val;
              } else {
                obj = parent[key] = [parent[key], val];
              }
            // prop
            } else if (~part.indexOf(']')) {
              part = part.substr(0, part.length - 1);
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            // key
            } else {
              if(notint.test(part) && isArray(obj)) obj = promote(parent, key);
              parse(parts, obj, part);
            }
          }
        }

        parse(parts, parent, 'base');
      // optimize
      } else {
        if (notint.test(key) && isArray(parent.base)) {
          var t = {};
          for(var k in parent.base) t[k] = parent.base[k];
          parent.base = t;
        }
        set(parent.base, key, val);
      }

      return ret;
    }, {base: {}}).base;
};

/**
 * Turn the given `obj` into a query string
 *
 * @param {Object} obj
 * @return {String}
 * @api public
 */

var stringify = exports.stringify = function(obj, prefix) {
  if (isArray(obj)) {
    return stringifyArray(obj, prefix);
  } else if ('[object Object]' == toString.call(obj)) {
    return stringifyObject(obj, prefix);
  } else if ('string' == typeof obj) {
    return stringifyString(obj, prefix);
  } else {
    return prefix;
  }
};

/**
 * Stringify the given `str`.
 *
 * @param {String} str
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyString(str, prefix) {
  if (!prefix) throw new TypeError('stringify expects an object');
  return prefix + '=' + encodeURIComponent(str);
}

/**
 * Stringify the given `arr`.
 *
 * @param {Array} arr
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyArray(arr, prefix) {
  var ret = [];
  if (!prefix) throw new TypeError('stringify expects an object');
  for (var i = 0; i < arr.length; i++) {
    ret.push(stringify(arr[i], prefix + '[]'));
  }
  return ret.join('&');
}

/**
 * Stringify the given `obj`.
 *
 * @param {Object} obj
 * @param {String} prefix
 * @return {String}
 * @api private
 */

function stringifyObject(obj, prefix) {
  var ret = []
    , keys = objectKeys(obj)
    , key;
  for (var i = 0, len = keys.length; i < len; ++i) {
    key = keys[i];
    ret.push(stringify(obj[key], prefix
      ? prefix + '[' + encodeURIComponent(key) + ']'
      : encodeURIComponent(key)));
  }
  return ret.join('&');
}

/**
 * Set `obj`'s `key` to `val` respecting
 * the weird and wonderful syntax of a qs,
 * where "foo=bar&foo=baz" becomes an array.
 *
 * @param {Object} obj
 * @param {String} key
 * @param {String} val
 * @api private
 */

function set(obj, key, val) {
  var v = obj[key];
  if (undefined === v) {
    obj[key] = val;
  } else if (isArray(v)) {
    v.push(val);
  } else {
    obj[key] = [v, val];
  }
}

/**
 * Locate last brace in `str` within the key.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function lastBraceInKey(str) {
  var len = str.length
    , brace
    , c;
  for (var i = 0; i < len; ++i) {
    c = str[i];
    if (']' == c) brace = false;
    if ('[' == c) brace = true;
    if ('=' == c && !brace) return i;
  }
}

});

require.define("/node_modules/testling/lib/deep_equal.js", function (require, module, exports, __dirname, __filename) {
// ripped from node's deepEqual implementation in assert

var pSlice = Array.prototype.slice;
var Object_keys = typeof Object.keys === 'function'
    ? Object.keys
    : function (obj) {
        var keys = [];
        for (var key in obj) keys.push(key);
        return keys;
    }
;

var deepEqual = module.exports = function (actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b);
  }
  try {
    var ka = Object_keys(a),
        kb = Object_keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

});

require.define("/test/factory.js", function (require, module, exports, __dirname, __filename) {
module.exports = function (indexedStore, test) {
    test("matches IDBFactory interface", function (t) {
        t.ok(indexedStore.open, "does not have open method")
        t.ok(indexedStore.deleteDatabase, "does not have deleteDatabase")
        t.ok(indexedStore.cmp, "does not have cmp method")
        t.end()
    })

    test("compare keys", function (t) {
        var cmp = indexedStore.cmp
        t.equal(cmp("b", "a"), 1, "cmp thinks b is less than a")
        t.equal(cmp("a", "b"), -1, "cmp thinks a is greater then b")
        t.equal(cmp("b", "b"), 0, "cmp thinks b is not equal to be")
        //TODO: more comparison tests
        t.equal(cmp(["b", 10], ["b", 5]), 1, "cmp thinks 10 is less than 5")
        t.equal(cmp(["b", 5], ["b", 10]), -1, "cmp thinks 5 is greater than 10")
        t.equal(cmp(["b", 5], ["b", 5]), 0, "cmp thinks arrays are not equal")
        t.end()
    })

    test("test can open database", function (t) {
        t.plan(2)
        //t.log("opening db")
        indexedStore.open("testling", function (err, connection) {
            //t.log("opened" + connection)
            if (err !== null) {
                t.log("error open", err)
            }
            t.equal(err, null, "we have an error")
            t.ok(connection, "we dont have a connection")
            t.end()
        })
    })

    test("test can delete database", function (t) {
        t.plan(2)
        //t.log("deleting db" + indexedStore.deleteDatabase)
        indexedStore.deleteDatabase("testling", function (err, result) {
            t.equal(err, null, "we have an error")
            t.equal(result, null, "result is not null")
            t.end()
        })
    })
}


});

require.define("/test/database.js", function (require, module, exports, __dirname, __filename) {
var indexedStore
module.exports = function (i, test) {
    indexedStore = i
    
    test("has a name", function (t) {
        t.plan(1)
        makeDB(function (err, db) {
            t.equal(db.name, "testling", "does not have a correct name")
            console.log("db", db)
            t.end()
        })
    })
}

function makeDB(cb) {
    indexedStore.open("testling", cb)
}
});

require.define("/test.js", function (require, module, exports, __dirname, __filename) {
    var indexedStore = require("./index"),
    testling = require("testling")
    
require("./test/factory")(indexedStore, testling)
require("./test/database")(indexedStore, testling)
});
require("/test.js");
