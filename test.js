var indexedStore = require("./index"),
    testling = require("testling")
    
require("./test/factory")(indexedStore, testling)
require("./test/database")(indexedStore, testling)