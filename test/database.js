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