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
        var sql;
        sql = optionalRequire("mssql");
        return {
            query: function(query, params) {
                var self = this;
                var request, gen2_items, gen3_i, key, gen4_asyncResult;
                return new Promise(function(gen5_onFulfilled) {
                    request = new sql.Request(self.connection);
                    if (params) {
                        gen2_items = Object.keys(params);
                        for (gen3_i = 0; gen3_i < gen2_items.length; ++gen3_i) {
                            key = gen2_items[gen3_i];
                            request.input(key, params[key]);
                        }
                    }
                    gen5_onFulfilled(gen1_promisify(function(gen6_callback) {
                        return request.query(query, gen6_callback);
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                var gen7_asyncResult;
                return new Promise(function(gen5_onFulfilled) {
                    self.connection = new sql.Connection(config.config);
                    gen5_onFulfilled(gen1_promisify(function(gen6_callback) {
                        return self.connection.connect(gen6_callback);
                    }));
                });
            },
            close: function() {
                var self = this;
                return self.connection.close();
            },
            outputIdBeforeValues: function(id) {
                var self = this;
                return "output Inserted." + id;
            },
            outputIdAfterValues: function(id) {
                var self = this;
                return "";
            },
            insertedId: function(rows, id) {
                var self = this;
                return rows[0][id];
            }
        };
    };
}).call(this);