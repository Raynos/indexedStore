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

