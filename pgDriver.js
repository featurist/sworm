(function() {
    var Promise = require("bluebird");
    var gen1_promisify = function(fn) {
        return new Promise(function(onFulfilled, onRejected) {
            fn(function(error, result) {
                if (error) {
                    onRejected(error);
                } else {
                    onFulfilled(result);
                }
            });
        });
    };
    var self = this;
    var optionalRequire;
    optionalRequire = require("./optionalRequire");
    module.exports = function() {
        var self = this;
        var pg;
        pg = optionalRequire("pg");
        return {
            query: function(query, params) {
                var self = this;
                var paramList, indexedParams, keys, n, key, value, gen2_asyncResult;
                return new Promise(function(gen3_onFulfilled) {
                    paramList = [];
                    if (params) {
                        indexedParams = {};
                        keys = Object.keys(params);
                        for (n = 0; n < keys.length; ++n) {
                            key = keys[n];
                            value = params[key];
                            indexedParams[key] = {
                                index: n + 1,
                                value: value
                            };
                            paramList.push(value);
                        }
                        query = query.replace(new RegExp("@([a-zA-Z_0-9]+)\\b", "g"), function(_, paramName) {
                            var param;
                            param = indexedParams[paramName];
                            if (!param) {
                                throw new Error("no such parameter @" + paramName);
                            }
                            return "$" + indexedParams[paramName].index;
                        });
                    }
                    gen3_onFulfilled(gen1_promisify(function(gen4_callback) {
                        return self.client.query(query, paramList, gen4_callback);
                    }).then(function(gen2_asyncResult) {
                        return gen2_asyncResult.rows;
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                return new Promise(function(result, error) {
                    return pg.connect(config.url, function(err, client, done) {
                        if (err) {
                            return error(err);
                        } else {
                            self.client = client;
                            self.done = done;
                            return result();
                        }
                    });
                });
            },
            close: function() {
                var self = this;
                if (self.done) {
                    return self.done();
                }
            },
            outputIdBeforeValues: function(id) {
                var self = this;
                return "";
            },
            outputIdAfterValues: function(id) {
                var self = this;
                return "returning " + id;
            },
            insertedId: function(rows, id) {
                var self = this;
                return rows[0][id];
            }
        };
    };
}).call(this);