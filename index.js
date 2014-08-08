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
        var fieldsForObject, foreignFieldsForObject, logSql, insert, update, saveManyToOne, saveManyToOnes, saveOneToMany, saveOneToManys, hash;
        fieldsForObject = function(obj) {
            return function() {
                var gen3_results, gen4_items, gen5_i, key;
                gen3_results = [];
                gen4_items = Object.keys(obj);
                for (gen5_i = 0; gen5_i < gen4_items.length; ++gen5_i) {
                    key = gen4_items[gen5_i];
                    (function(key) {
                        var value;
                        value = obj[key];
                        if (value instanceof Date || value !== null && value !== void 0 && !(value instanceof Object)) {
                            return gen3_results.push(key);
                        }
                    })(key);
                }
                return gen3_results;
            }();
        };
        foreignFieldsForObject = function(obj) {
            return function() {
                var gen6_results, gen7_items, gen8_i, key;
                gen6_results = [];
                gen7_items = Object.keys(obj);
                for (gen8_i = 0; gen8_i < gen7_items.length; ++gen8_i) {
                    key = gen7_items[gen8_i];
                    (function(key) {
                        var value;
                        if (!/^_/.test(key) && key !== obj._meta.id) {
                            value = obj[key];
                            if (!(value instanceof Date) && value instanceof Object) {
                                return gen6_results.push(key);
                            }
                        }
                    })(key);
                }
                return gen6_results;
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
            var keys, fields, values, request, outputId, statementString, gen9_asyncResult, r;
            return new Promise(function(gen10_onFulfilled) {
                keys = fieldsForObject(obj);
                fields = keys.join(", ");
                values = function() {
                    var gen11_results, gen12_items, gen13_i, key;
                    gen11_results = [];
                    gen12_items = keys;
                    for (gen13_i = 0; gen13_i < gen12_items.length; ++gen13_i) {
                        key = gen12_items[gen13_i];
                        (function(key) {
                            return gen11_results.push(toSql(obj[key]));
                        })(key);
                    }
                    return gen11_results;
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
                gen10_onFulfilled(gen1_promisify(function(gen14_callback) {
                    return request.query(statementString, gen14_callback);
                }).then(function(gen9_asyncResult) {
                    r = gen9_asyncResult;
                    obj.setSaved();
                    if (!obj._meta.compoundKey) {
                        obj[obj._meta.id] = r[0][obj._meta.id];
                    }
                    return obj.setNotChanged();
                }));
            });
        };
        update = function(obj) {
            var keys, assignments, whereClause, request, statementString, gen15_asyncResult;
            return new Promise(function(gen10_onFulfilled) {
                keys = fieldsForObject(obj);
                assignments = function() {
                    var gen16_results, gen17_items, gen18_i, key;
                    gen16_results = [];
                    gen17_items = keys;
                    for (gen18_i = 0; gen18_i < gen17_items.length; ++gen18_i) {
                        key = gen17_items[gen18_i];
                        (function(key) {
                            var sqlValue;
                            if (key !== obj._meta.id) {
                                sqlValue = toSql(obj[key]);
                                return gen16_results.push(key + " = " + sqlValue);
                            }
                        })(key);
                    }
                    return gen16_results;
                }().join(", ");
                whereClause = function() {
                    if (obj._meta.compoundKey) {
                        return function() {
                            var gen19_results, gen20_items, gen21_i, key;
                            gen19_results = [];
                            gen20_items = obj._meta.id;
                            for (gen21_i = 0; gen21_i < gen20_items.length; ++gen21_i) {
                                key = gen20_items[gen21_i];
                                (function(key) {
                                    return gen19_results.push(key + " = " + toSql(obj[key]));
                                })(key);
                            }
                            return gen19_results;
                        }().join(" and ");
                    } else {
                        return obj._meta.id + " = " + toSql(obj.identity());
                    }
                }();
                request = new sql.Request(obj._meta.db.connection);
                statementString = "update " + obj._meta.table + " set " + assignments + " where " + whereClause;
                logSql(obj, statementString);
                gen10_onFulfilled(gen1_promisify(function(gen14_callback) {
                    return request.query(statementString, gen14_callback);
                }).then(function(gen15_asyncResult) {
                    gen15_asyncResult;
                    return obj.setNotChanged();
                }));
            });
        };
        saveManyToOne = function(obj, field) {
            var value, gen22_asyncResult, foreignId;
            return new Promise(function(gen10_onFulfilled) {
                value = obj[field];
                gen10_onFulfilled(Promise.resolve(function() {
                    if (!(value instanceof Array)) {
                        return new Promise(function(gen10_onFulfilled) {
                            gen10_onFulfilled(Promise.resolve(value.save()).then(function(gen23_asyncResult) {
                                gen23_asyncResult;
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
            var gen24_asyncResult;
            return new Promise(function(gen10_onFulfilled) {
                gen10_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen25_index, field, gen26_result) {
                    var gen27_asyncResult;
                    return new Promise(function(gen10_onFulfilled) {
                        gen10_onFulfilled(Promise.resolve(saveManyToOne(obj, field)).then(function(gen27_asyncResult) {
                            return gen26_result(gen27_asyncResult, gen25_index);
                        }));
                    });
                })));
            });
        };
        saveOneToMany = function(obj, field) {
            var items, gen28_asyncResult;
            return new Promise(function(gen10_onFulfilled) {
                items = obj[field];
                gen10_onFulfilled(Promise.resolve(function() {
                    if (items instanceof Array) {
                        return new Promise(function(gen10_onFulfilled) {
                            gen10_onFulfilled(Promise.resolve(gen2_listComprehension(items, false, function(gen29_index, item, gen30_result) {
                                var gen31_asyncResult;
                                return new Promise(function(gen10_onFulfilled) {
                                    gen10_onFulfilled(Promise.resolve(item.save()).then(function(gen31_asyncResult) {
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
            return new Promise(function(gen10_onFulfilled) {
                gen10_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen33_index, field, gen34_result) {
                    var gen35_asyncResult;
                    return new Promise(function(gen10_onFulfilled) {
                        gen10_onFulfilled(Promise.resolve(saveOneToMany(obj, field)).then(function(gen35_asyncResult) {
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
                return new Promise(function(gen10_onFulfilled) {
                    gen10_onFulfilled(Promise.resolve(function() {
                        if (self.changed() || force) {
                            return new Promise(function(gen10_onFulfilled) {
                                gen10_onFulfilled(Promise.resolve(saveManyToOnes(self)).then(function(gen41_asyncResult) {
                                    gen41_asyncResult;
                                    return Promise.resolve(function() {
                                        if (!self.saved()) {
                                            return new Promise(function(gen10_onFulfilled) {
                                                gen10_onFulfilled(Promise.resolve(insert(self)));
                                            });
                                        } else {
                                            return new Promise(function(gen10_onFulfilled) {
                                                gen10_onFulfilled(Promise.resolve(update(self)));
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
                return !self._hash || self._hash !== hash(self);
            },
            identity: function() {
                var self = this;
                if (self._meta.compoundKey) {
                    return function() {
                        var gen43_results, gen44_items, gen45_i, id;
                        gen43_results = [];
                        gen44_items = self._meta.id;
                        for (gen45_i = 0; gen45_i < gen44_items.length; ++gen45_i) {
                            id = gen44_items[gen45_i];
                            (function(id) {
                                return gen43_results.push(self[id]);
                            })(id);
                        }
                        return gen43_results;
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
                    var gen46_asyncResult, gen47_asyncResult, gen48_o;
                    return new Promise(function(gen10_onFulfilled) {
                        gen48_o = db;
                        gen10_onFulfilled(Promise.resolve(gen48_o.query.apply(gen48_o, args)).then(function(gen47_asyncResult) {
                            return Promise.resolve(gen2_listComprehension(gen47_asyncResult, false, function(gen49_index, e, gen50_result) {
                                return gen50_result(self(e, true), gen49_index);
                            }));
                        }));
                    });
                };
                return model;
            },
            query: function(query, params) {
                var self = this;
                var request, s, gen51_items, gen52_i, key, queryString, gen53_asyncResult;
                return new Promise(function(gen10_onFulfilled) {
                    request = new sql.Request(self.connection);
                    queryString = function() {
                        if (params) {
                            s = query;
                            gen51_items = Object.keys(params);
                            for (gen52_i = 0; gen52_i < gen51_items.length; ++gen52_i) {
                                key = gen51_items[gen52_i];
                                s = s.replace(new RegExp("@" + key + "\\b", "g"), toSql(params[key]));
                            }
                            return s;
                        } else {
                            return query;
                        }
                    }();
                    gen10_onFulfilled(gen1_promisify(function(gen14_callback) {
                        return request.query(queryString, gen14_callback);
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                var gen54_asyncResult;
                return new Promise(function(gen10_onFulfilled) {
                    self.connection = new sql.Connection(config);
                    gen10_onFulfilled(gen1_promisify(function(gen14_callback) {
                        return self.connection.connect(gen14_callback);
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
                var gen55_asyncResult;
                return new Promise(function(gen10_onFulfilled) {
                    gen10_onFulfilled(Promise.resolve(db.connect(config)).then(function(gen55_asyncResult) {
                        gen55_asyncResult;
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