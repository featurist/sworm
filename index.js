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
    var gen2_listComprehension = function(items, areRanges, block) {
        return new Promise(function(onFulfilled, onRejected) {
            var indexes = [];
            var results = {};
            var completed = 0;
            var wasError = false;
            if (items.length > 0) {
                for (var n = 0; n < items.length; n++) {
                    Promise.resolve(block(n, items[n], function(result, index) {
                        indexes.push(index);
                        results[index] = result;
                    })).then(function(result) {
                        completed++;
                        if (completed == items.length && !wasError) {
                            var sortedResults = [];
                            indexes.sort();
                            for (n = 0; n < indexes.length; n++) {
                                if (areRanges) {
                                    sortedResults.push.apply(sortedResults, results[indexes[n]]);
                                } else {
                                    sortedResults.push(results[indexes[n]]);
                                }
                            }
                            onFulfilled(sortedResults);
                        }
                    }, onRejected);
                }
            } else {
                onFulfilled([]);
            }
        });
    };
    var prototype = function(p) {
        function constructor() {}
        p = p || {};
        constructor.prototype = p;
        function derive(derived) {
            var o = new constructor();
            if (derived) {
                var keys = Object.keys(derived);
                for (var n = 0; n < keys.length; n++) {
                    var key = keys[n];
                    o[key] = derived[key];
                }
            }
            return o;
        }
        derive.prototype = p;
        return derive;
    };
    var prototypeExtending = function(p, obj) {
        return prototype(prototype(p.prototype)(obj));
    };
    var self = this;
    var sql, crypto, rowBase, toSql;
    sql = require("mssql");
    crypto = require("crypto");
    rowBase = function() {
        var keysForObject, fieldsForObject, foreignFieldsForObject, insert, update, saveManyToOne, saveManyToOnes, saveOneToMany, saveOneToManys, hash;
        keysForObject = function(obj) {
            return function() {
                var gen3_results, gen4_items, gen5_i, key;
                gen3_results = [];
                gen4_items = Object.keys(obj);
                for (gen5_i = 0; gen5_i < gen4_items.length; ++gen5_i) {
                    key = gen4_items[gen5_i];
                    (function(key) {
                        if (!/^_/.test(key) && key !== obj._meta.id) {
                            return gen3_results.push(key);
                        }
                    })(key);
                }
                return gen3_results;
            }();
        };
        fieldsForObject = function(obj) {
            return function() {
                var gen6_results, gen7_items, gen8_i, key;
                gen6_results = [];
                gen7_items = keysForObject(obj);
                for (gen8_i = 0; gen8_i < gen7_items.length; ++gen8_i) {
                    key = gen7_items[gen8_i];
                    (function(key) {
                        var value;
                        value = obj[key];
                        if (value instanceof Date || value !== null && value !== void 0 && !(value instanceof Object)) {
                            return gen6_results.push(key);
                        }
                    })(key);
                }
                return gen6_results;
            }();
        };
        foreignFieldsForObject = function(obj) {
            return function() {
                var gen9_results, gen10_items, gen11_i, key;
                gen9_results = [];
                gen10_items = keysForObject(obj);
                for (gen11_i = 0; gen11_i < gen10_items.length; ++gen11_i) {
                    key = gen10_items[gen11_i];
                    (function(key) {
                        var value;
                        if (!/^_/.test(key) && key !== obj._meta.id) {
                            value = obj[key];
                            if (!(value instanceof Date) && value instanceof Object) {
                                return gen9_results.push(key);
                            }
                        }
                    })(key);
                }
                return gen9_results;
            }();
        };
        insert = function(obj) {
            var keys, fields, values, request, statementString, gen12_asyncResult, r;
            return new Promise(function(gen13_onFulfilled) {
                keys = fieldsForObject(obj);
                fields = keys.join(", ");
                values = function() {
                    var gen14_results, gen15_items, gen16_i, key;
                    gen14_results = [];
                    gen15_items = keys;
                    for (gen16_i = 0; gen16_i < gen15_items.length; ++gen16_i) {
                        key = gen15_items[gen16_i];
                        (function(key) {
                            return gen14_results.push(toSql(obj[key]));
                        })(key);
                    }
                    return gen14_results;
                }().join(", ");
                request = new sql.Request(obj._meta.connection);
                statementString = "insert into " + obj._meta.table + " (" + fields + ") output Inserted." + obj._meta.id + " values (" + values + ")";
                if (obj._meta.log) {
                    console.log(statementString);
                }
                gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                    return request.query(statementString, gen17_callback);
                }).then(function(gen12_asyncResult) {
                    r = gen12_asyncResult;
                    obj[obj._meta.id] = r[0][obj._meta.id];
                    return obj.setNotChanged();
                }));
            });
        };
        update = function(obj) {
            var keys, assignments, request, statementString, gen18_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                keys = fieldsForObject(obj);
                assignments = function() {
                    var gen19_results, gen20_items, gen21_i, key;
                    gen19_results = [];
                    gen20_items = keys;
                    for (gen21_i = 0; gen21_i < gen20_items.length; ++gen21_i) {
                        key = gen20_items[gen21_i];
                        (function(key) {
                            var sqlValue;
                            sqlValue = toSql(obj[key]);
                            return gen19_results.push(key + " = " + sqlValue);
                        })(key);
                    }
                    return gen19_results;
                }().join(", ");
                request = new sql.Request(obj._meta.connection);
                statementString = "update " + obj._meta.table + " set " + assignments + " where " + obj._meta.id + " = " + obj.identity();
                if (obj._meta.log) {
                    console.log(statementString);
                }
                gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                    return request.query(statementString, gen17_callback);
                }));
            });
        };
        saveManyToOne = function(obj, field) {
            var value, gen22_asyncResult, foreignId;
            return new Promise(function(gen13_onFulfilled) {
                value = obj[field];
                gen13_onFulfilled(Promise.resolve(function() {
                    if (!(value instanceof Array)) {
                        return new Promise(function(gen13_onFulfilled) {
                            gen13_onFulfilled(Promise.resolve(value.save()).then(function(gen23_asyncResult) {
                                gen23_asyncResult;
                                foreignId = function() {
                                    if (obj._meta.foreignKeyFor) {
                                        return obj._meta.foreignKeyFor(field);
                                    } else {
                                        return field + "Id";
                                    }
                                }();
                                return obj[foreignId] = value.identity();
                            }));
                        });
                    }
                }()));
            });
        };
        saveManyToOnes = function(obj) {
            var gen24_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                gen13_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen25_index, field, gen26_result) {
                    var gen27_asyncResult;
                    return new Promise(function(gen13_onFulfilled) {
                        gen13_onFulfilled(Promise.resolve(saveManyToOne(obj, field)).then(function(gen27_asyncResult) {
                            return gen26_result(gen27_asyncResult, gen25_index);
                        }));
                    });
                })));
            });
        };
        saveOneToMany = function(obj, field) {
            var items, gen28_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                items = obj[field];
                gen13_onFulfilled(Promise.resolve(function() {
                    if (items instanceof Array) {
                        return new Promise(function(gen13_onFulfilled) {
                            gen13_onFulfilled(Promise.resolve(gen2_listComprehension(items, false, function(gen29_index, item, gen30_result) {
                                var gen31_asyncResult;
                                return new Promise(function(gen13_onFulfilled) {
                                    gen13_onFulfilled(Promise.resolve(item.save()).then(function(gen31_asyncResult) {
                                        return gen30_result(gen31_asyncResult, gen29_index);
                                    }));
                                });
                            })));
                        });
                    }
                }()));
            });
        };
        saveOneToManys = function(obj) {
            var gen32_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                gen13_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen33_index, field, gen34_result) {
                    var gen35_asyncResult;
                    return new Promise(function(gen13_onFulfilled) {
                        gen13_onFulfilled(Promise.resolve(saveOneToMany(obj, field)).then(function(gen35_asyncResult) {
                            return gen34_result(gen35_asyncResult, gen33_index);
                        }));
                    });
                })));
            });
        };
        hash = function(obj) {
            var h, fields;
            h = crypto.createHash("md5");
            fields = function() {
                var gen36_results, gen37_items, gen38_i, field;
                gen36_results = [];
                gen37_items = fieldsForObject(obj);
                for (gen38_i = 0; gen38_i < gen37_items.length; ++gen38_i) {
                    field = gen37_items[gen38_i];
                    (function(field) {
                        return gen36_results.push([ field, obj[field] ]);
                    })(field);
                }
                return gen36_results;
            }();
            h.update(JSON.stringify(fields));
            return h.digest("hex");
        };
        return prototype({
            save: function(gen39_options) {
                var self = this;
                var force;
                force = gen39_options !== void 0 && Object.prototype.hasOwnProperty.call(gen39_options, "force") && gen39_options.force !== void 0 ? gen39_options.force : false;
                var gen40_asyncResult;
                return new Promise(function(gen13_onFulfilled) {
                    gen13_onFulfilled(Promise.resolve(function() {
                        if (self.changed() && !force) {
                            return new Promise(function(gen13_onFulfilled) {
                                gen13_onFulfilled(Promise.resolve(saveManyToOnes(self)).then(function(gen41_asyncResult) {
                                    gen41_asyncResult;
                                    return Promise.resolve(function() {
                                        if (!self.identity()) {
                                            return new Promise(function(gen13_onFulfilled) {
                                                gen13_onFulfilled(Promise.resolve(insert(self)));
                                            });
                                        } else {
                                            return new Promise(function(gen13_onFulfilled) {
                                                gen13_onFulfilled(Promise.resolve(update(self)));
                                            });
                                        }
                                    }()).then(function(gen42_asyncResult) {
                                        gen42_asyncResult;
                                        return Promise.resolve(saveOneToManys(self));
                                    });
                                }));
                            });
                        }
                    }()));
                });
            },
            changed: function() {
                var self = this;
                return self._hash !== hash(self);
            },
            identity: function() {
                var self = this;
                return self[self._meta.id];
            },
            setNotChanged: function() {
                var self = this;
                return Object.defineProperty(self, "_hash", {
                    value: hash(self)
                });
            }
        });
    }();
    exports.db = function(config) {
        var self = this;
        var db, gen43_asyncResult;
        return new Promise(function(gen13_onFulfilled) {
            db = {
                row: function(rowConfig) {
                    var self = this;
                    var table, id, log, foreignKeyFor, rowPrototype;
                    table = rowConfig.table;
                    delete rowConfig.table;
                    id = rowConfig.id || "id";
                    delete rowConfig.id;
                    log = rowConfig.log || false;
                    delete rowConfig.log;
                    foreignKeyFor = rowConfig.foreignKeyFor || false;
                    delete rowConfig.foreignKeyFor;
                    rowConfig._meta = {
                        table: table,
                        id: id,
                        log: log,
                        connection: self.connection,
                        foreignKeyFor: foreignKeyFor
                    };
                    rowPrototype = prototypeExtending(rowBase, rowConfig);
                    return function(obj) {
                        var row;
                        row = rowPrototype(obj);
                        if (row.identity()) {
                            row.setNotChanged();
                        }
                        return row;
                    };
                },
                query: function(query) {
                    var self = this;
                    var request, gen44_asyncResult, records;
                    return new Promise(function(gen13_onFulfilled) {
                        request = new sql.Request(self.connection);
                        gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                            return request.query(query, gen17_callback);
                        }).then(function(gen44_asyncResult) {
                            return records = gen44_asyncResult;
                        }));
                    });
                },
                connect: function() {
                    var self = this;
                    var gen45_asyncResult;
                    return new Promise(function(gen13_onFulfilled) {
                        self.connection = new sql.Connection(config);
                        gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                            return self.connection.connect(gen17_callback);
                        }));
                    });
                },
                close: function() {
                    var self = this;
                    return self.connection.close();
                }
            };
            gen13_onFulfilled(Promise.resolve(db.connect()).then(function(gen43_asyncResult) {
                gen43_asyncResult;
                return db;
            }));
        });
    };
    toSql = function(v) {
        if (typeof v === "string") {
            return "'" + v.replace(/'/g, "''") + "'";
        } else if (v instanceof Date) {
            return "'" + v.toISOString() + "'";
        } else if (typeof v === "boolean") {
            if (v) {
                return 1;
            } else {
                return 0;
            }
        } else if (typeof v === "number") {
            return v;
        } else {
            throw new Error("could not pass value to query: " + v);
        }
    };
}).call(this);