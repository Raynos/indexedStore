var Store = {

    constructor: function ( name ) {
        this.name = name
        this._store = {}
    },

    add: function ( value, key, callback ) {
        if (this._store[key]) {
            return callback(new Error("key is already taken ", key))
        }
        var clone = JSON.parse(JSON.stringify(value))
        this._store[key] = value
        callback(null, key)
    },

    clear: function ( callback ) {
        this._store = {}
        callback(null)
    },

    count: function ( callback ) {
        callback(null, Object.keys(this._store).length)
    },

    delete: function ( key, callback ) {
        delete this._store[key]
        callback(null)
    },

    get: function ( key, callback ) {
        callback(null, this._store[key])
    },

    put: function ( value, key, callback ) {
        var clone = JSON.parse(JSON.stringify(value))
        this._store[key] = value
        callback(null, key)
    }

    openCursor: function ( callback ) {
        var c = extend({}, Cursor).constructor(this)
        callback(null, c)
    }
}

var Cursor = {

    constructor: function ( store ) {
        this.source = store
        this._keys = Object.keys(this.source)
        this._currentKey = 0
        this.key = this._keys[this._currentKey]
        return this
    },

    update: function ( value, callback ) {
        this.source.put(this.key, value, callback)
    },

    advance: function ( count, callback ) {
        count = count || 0
        this._currentKey += count
        this.key = this._keys[this._currentKey]
        callback(null, this)
    },

    continue: function ( callback ) {
        this._currentKey++
        this.key = this._keys[this._currentKey]
        callback(null, this)
    },

    delete: function ( callback ) {
        this.source.delete(this.key, callback)
    }

}