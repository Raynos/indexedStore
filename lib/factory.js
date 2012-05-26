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