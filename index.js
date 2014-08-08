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
    var sql, crypto, rowBase, option, toSql;
    sql = require("mssql");
    crypto = require("crypto");
    rowBase = function() {
        var keysForObject, fieldsForObject, foreignFieldsForObject, logSql, insert, update, saveManyToOne, saveManyToOnes, saveOneToMany, saveOneToManys, hash;
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
        logSql = function(obj, sql) {
            if (obj._meta.db.log) {
                if (obj._meta.db.log instanceof Function) {
                    return obj._meta.db.log(sql);
                } else {
                    return console.log(sql);
                }
            }
        };
        insert = function(obj) {
            var keys, fields, values, request, outputId, statementString, gen12_asyncResult, r;
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
                request = new sql.Request(obj._meta.db.connection);
                outputId = function() {
                    if (typeof obj._meta.id === "string") {
                        return "output Inserted." + obj._meta.id;
                    } else {
                        return "";
                    }
                }();
                statementString = "insert into " + obj._meta.table + " (" + fields + ") " + outputId + " values (" + values + ")";
                logSql(obj, statementString);
                gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                    return request.query(statementString, gen17_callback);
                }).then(function(gen12_asyncResult) {
                    r = gen12_asyncResult;
                    obj.setSaved();
                    if (!obj._meta.compoundKey) {
                        obj[obj._meta.id] = r[0][obj._meta.id];
                    }
                    return obj.setNotChanged();
                }));
            });
        };
        update = function(obj) {
            var keys, assignments, whereClause, request, statementString, gen18_asyncResult;
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
                whereClause = function() {
                    if (obj._meta.compoundKey) {
                        return function() {
                            var gen22_results, gen23_items, gen24_i, key;
                            gen22_results = [];
                            gen23_items = obj._meta.id;
                            for (gen24_i = 0; gen24_i < gen23_items.length; ++gen24_i) {
                                key = gen23_items[gen24_i];
                                (function(key) {
                                    return gen22_results.push(key + " = " + toSql(obj[key]));
                                })(key);
                            }
                            return gen22_results;
                        }().join(" and ");
                    } else {
                        return obj._meta.id + " = " + toSql(obj.identity());
                    }
                }();
                request = new sql.Request(obj._meta.db.connection);
                statementString = "update " + obj._meta.table + " set " + assignments + " where " + whereClause;
                logSql(obj, statementString);
                gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                    return request.query(statementString, gen17_callback);
                }).then(function(gen18_asyncResult) {
                    gen18_asyncResult;
                    return obj.setNotChanged();
                }));
            });
        };
        saveManyToOne = function(obj, field) {
            var value, gen25_asyncResult, foreignId;
            return new Promise(function(gen13_onFulfilled) {
                value = obj[field];
                gen13_onFulfilled(Promise.resolve(function() {
                    if (!(value instanceof Array)) {
                        return new Promise(function(gen13_onFulfilled) {
                            gen13_onFulfilled(Promise.resolve(value.save()).then(function(gen26_asyncResult) {
                                gen26_asyncResult;
                                foreignId = function() {
                                    if (obj._meta.foreignKeyFor) {
                                        return obj._meta.foreignKeyFor(field);
                                    } else {
                                        return field + "Id";
                                    }
                                }();
                                if (!value._meta.compoundKey) {
                                    return obj[foreignId] = value.identity();
                                }
                            }));
                        });
                    }
                }()));
            });
        };
        saveManyToOnes = function(obj) {
            var gen27_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                gen13_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen28_index, field, gen29_result) {
                    var gen30_asyncResult;
                    return new Promise(function(gen13_onFulfilled) {
                        gen13_onFulfilled(Promise.resolve(saveManyToOne(obj, field)).then(function(gen30_asyncResult) {
                            return gen29_result(gen30_asyncResult, gen28_index);
                        }));
                    });
                })));
            });
        };
        saveOneToMany = function(obj, field) {
            var items, gen31_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                items = obj[field];
                gen13_onFulfilled(Promise.resolve(function() {
                    if (items instanceof Array) {
                        return new Promise(function(gen13_onFulfilled) {
                            gen13_onFulfilled(Promise.resolve(gen2_listComprehension(items, false, function(gen32_index, item, gen33_result) {
                                var gen34_asyncResult;
                                return new Promise(function(gen13_onFulfilled) {
                                    gen13_onFulfilled(Promise.resolve(item.save()).then(function(gen34_asyncResult) {
                                        return gen33_result(gen34_asyncResult, gen32_index);
                                    }));
                                });
                            })));
                        });
                    }
                }()));
            });
        };
        saveOneToManys = function(obj) {
            var gen35_asyncResult;
            return new Promise(function(gen13_onFulfilled) {
                gen13_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen36_index, field, gen37_result) {
                    var gen38_asyncResult;
                    return new Promise(function(gen13_onFulfilled) {
                        gen13_onFulfilled(Promise.resolve(saveOneToMany(obj, field)).then(function(gen38_asyncResult) {
                            return gen37_result(gen38_asyncResult, gen36_index);
                        }));
                    });
                })));
            });
        };
        hash = function(obj) {
            var h, fields;
            h = crypto.createHash("md5");
            fields = function() {
                var gen39_results, gen40_items, gen41_i, field;
                gen39_results = [];
                gen40_items = fieldsForObject(obj);
                for (gen41_i = 0; gen41_i < gen40_items.length; ++gen41_i) {
                    field = gen40_items[gen41_i];
                    (function(field) {
                        return gen39_results.push([ field, obj[field] ]);
                    })(field);
                }
                return gen39_results;
            }();
            h.update(JSON.stringify(fields));
            return h.digest("hex");
        };
        return prototype({
            save: function(gen42_options) {
                var self = this;
                var force;
                force = gen42_options !== void 0 && Object.prototype.hasOwnProperty.call(gen42_options, "force") && gen42_options.force !== void 0 ? gen42_options.force : false;
                var gen43_asyncResult;
                return new Promise(function(gen13_onFulfilled) {
                    gen13_onFulfilled(Promise.resolve(function() {
                        if (self.changed() || force) {
                            return new Promise(function(gen13_onFulfilled) {
                                gen13_onFulfilled(Promise.resolve(saveManyToOnes(self)).then(function(gen44_asyncResult) {
                                    gen44_asyncResult;
                                    return Promise.resolve(function() {
                                        if (!self.saved()) {
                                            return new Promise(function(gen13_onFulfilled) {
                                                gen13_onFulfilled(Promise.resolve(insert(self)));
                                            });
                                        } else {
                                            return new Promise(function(gen13_onFulfilled) {
                                                gen13_onFulfilled(Promise.resolve(update(self)));
                                            });
                                        }
                                    }()).then(function(gen45_asyncResult) {
                                        gen45_asyncResult;
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
                return !self._hash || self._hash !== hash(self);
            },
            identity: function() {
                var self = this;
                if (self._meta.compoundKey) {
                    return function() {
                        var gen46_results, gen47_items, gen48_i, id;
                        gen46_results = [];
                        gen47_items = self._meta.id;
                        for (gen48_i = 0; gen48_i < gen47_items.length; ++gen48_i) {
                            id = gen47_items[gen48_i];
                            (function(id) {
                                return gen46_results.push(self[id]);
                            })(id);
                        }
                        return gen46_results;
                    }();
                } else {
                    return self[self._meta.id];
                }
            },
            saved: function() {
                var self = this;
                return self._saved;
            },
            setNotChanged: function() {
                var self = this;
                if (self._hash) {
                    return self._hash = hash(self);
                } else {
                    return Object.defineProperty(self, "_hash", {
                        value: hash(self),
                        writable: true
                    });
                }
            },
            setSaved: function() {
                var self = this;
                if (!self._saved) {
                    return Object.defineProperty(self, "_saved", {
                        value: true
                    });
                }
            }
        });
    }();
    option = function(obj, property, value) {
        var opt;
        if (obj.hasOwnProperty(property)) {
            opt = obj[property];
            delete obj[property];
            return opt;
        } else {
            return value;
        }
    };
    exports.db = function(config) {
        var self = this;
        var db;
        db = {
            log: function() {
                if (config) {
                    return config.log;
                }
            }(),
            config: config,
            model: function(modelConfig) {
                var self = this;
                var foreignKeyFor, id, table, modelPrototype, model;
                foreignKeyFor = option(modelConfig, "foreignKeyFor");
                id = option(modelConfig, "id", "id");
                table = option(modelConfig, "table");
                modelConfig._meta = {
                    table: table,
                    id: id,
                    db: self,
                    foreignKeyFor: foreignKeyFor,
                    compoundKey: id instanceof Array
                };
                modelPrototype = prototypeExtending(rowBase, modelConfig);
                model = function(obj, saved) {
                    var row;
                    row = modelPrototype(obj);
                    if (saved) {
                        row.setSaved();
                        row.setNotChanged();
                    }
                    return row;
                };
                model.query = function() {
                    var self = this;
                    var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                    var gen49_asyncResult, gen50_asyncResult, gen51_o;
                    return new Promise(function(gen13_onFulfilled) {
                        gen51_o = db;
                        gen13_onFulfilled(Promise.resolve(gen51_o.query.apply(gen51_o, args)).then(function(gen50_asyncResult) {
                            return Promise.resolve(gen2_listComprehension(gen50_asyncResult, false, function(gen52_index, e, gen53_result) {
                                return gen53_result(self(e, true), gen52_index);
                            }));
                        }));
                    });
                };
                return model;
            },
            query: function(query, params) {
                var self = this;
                var request, s, gen54_items, gen55_i, key, queryString, gen56_asyncResult;
                return new Promise(function(gen13_onFulfilled) {
                    request = new sql.Request(self.connection);
                    queryString = function() {
                        if (params) {
                            s = query;
                            gen54_items = Object.keys(params);
                            for (gen55_i = 0; gen55_i < gen54_items.length; ++gen55_i) {
                                key = gen54_items[gen55_i];
                                s = s.replace(new RegExp("@" + key + "\\b", "g"), toSql(params[key]));
                            }
                            return s;
                        } else {
                            return query;
                        }
                    }();
                    gen13_onFulfilled(gen1_promisify(function(gen17_callback) {
                        return request.query(queryString, gen17_callback);
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                var gen57_asyncResult;
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
        if (config) {
            return function() {
                var gen58_asyncResult;
                return new Promise(function(gen13_onFulfilled) {
                    gen13_onFulfilled(Promise.resolve(db.connect(config)).then(function(gen58_asyncResult) {
                        gen58_asyncResult;
                        return db;
                    }));
                });
            }();
        } else {
            return db;
        }
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