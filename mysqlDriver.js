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
        var mysql;
        mysql = optionalRequire("mysql");
        return {
            query: function(query, params) {
                var self = this;
                var paramList, gen2_asyncResult;
                return new Promise(function(gen3_onFulfilled) {
                    paramList = [];
                    if (params) {
                        query = query.replace(new RegExp("@([a-zA-Z_0-9]+)\\b", "g"), function(_, paramName) {
                            if (!params.hasOwnProperty(paramName)) {
                                throw new Error("no such parameter @" + paramName);
                            } else {
                                paramList.push(params[paramName]);
                            }
                            return "?";
                        });
                    }
                    gen3_onFulfilled(gen1_promisify(function(gen4_callback) {
                        return self.connection.query(query, paramList, gen4_callback);
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                var gen5_asyncResult;
                return new Promise(function(gen3_onFulfilled) {
                    config.config.multipleStatements = true;
                    self.connection = mysql.createConnection(config.config);
                    gen3_onFulfilled(gen1_promisify(function(gen4_callback) {
                        return self.connection.connect(gen4_callback);
                    }));
                });
            },
            close: function() {
                var self = this;
                return self.connection.end();
            },
            outputIdBeforeValues: function(id) {
                var self = this;
                return "";
            },
            outputIdAfterValues: function(id) {
                var self = this;
                return "; select last_insert_id() as id";
            },
            insertedId: function(rows, id) {
                var self = this;
                return rows[1][0].id;
            }
        };
    };
}).call(this);