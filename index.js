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
    var sql, crypto, rowBase, option;
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
            var keys, fields, values, request, outputId, gen9_items, gen10_i, name, statementString, gen11_asyncResult, r;
            return new Promise(function(gen12_onFulfilled) {
                keys = fieldsForObject(obj);
                fields = keys.join(", ");
                values = function() {
                    var gen13_results, gen14_items, gen15_i, key;
                    gen13_results = [];
                    gen14_items = keys;
                    for (gen15_i = 0; gen15_i < gen14_items.length; ++gen15_i) {
                        key = gen14_items[gen15_i];
                        (function(key) {
                            return gen13_results.push("@" + key);
                        })(key);
                    }
                    return gen13_results;
                }().join(", ");
                request = new sql.Request(obj._meta.db.connection);
                outputId = function() {
                    if (typeof obj._meta.id === "string") {
                        return "output Inserted." + obj._meta.id;
                    } else {
                        return "";
                    }
                }();
                gen9_items = keys;
                for (gen10_i = 0; gen10_i < gen9_items.length; ++gen10_i) {
                    name = gen9_items[gen10_i];
                    request.input(name, obj[name]);
                }
                statementString = "insert into " + obj._meta.table + " (" + fields + ") " + outputId + " values (" + values + ")";
                logSql(obj, statementString);
                gen12_onFulfilled(gen1_promisify(function(gen16_callback) {
                    return request.query(statementString, gen16_callback);
                }).then(function(gen11_asyncResult) {
                    r = gen11_asyncResult;
                    obj.setSaved();
                    if (!obj._meta.compoundKey) {
                        obj[obj._meta.id] = r[0][obj._meta.id];
                    }
                    return obj.setNotChanged();
                }));
            });
        };
        update = function(obj) {
            var keys, assignments, request, gen17_items, gen18_i, n, gen19_items, gen20_i, name, whereClause, statementString, gen21_asyncResult;
            return new Promise(function(gen12_onFulfilled) {
                keys = fieldsForObject(obj);
                assignments = function() {
                    var gen22_results, gen23_items, gen24_i, key;
                    gen22_results = [];
                    gen23_items = keys;
                    for (gen24_i = 0; gen24_i < gen23_items.length; ++gen24_i) {
                        key = gen23_items[gen24_i];
                        (function(key) {
                            if (key !== obj._meta.id) {
                                return gen22_results.push(key + " = @" + key);
                            }
                        })(key);
                    }
                    return gen22_results;
                }().join(", ");
                request = new sql.Request(obj._meta.db.connection);
                gen17_items = keys;
                for (gen18_i = 0; gen18_i < gen17_items.length; ++gen18_i) {
                    n = gen17_items[gen18_i];
                    if (n !== obj._meta.id) {
                        request.input(n, obj[n]);
                    }
                }
                whereClause = function() {
                    if (obj._meta.compoundKey) {
                        gen19_items = obj._meta.compoundKey;
                        for (gen20_i = 0; gen20_i < gen19_items.length; ++gen20_i) {
                            name = gen19_items[gen20_i];
                            request.input(name, obj[name]);
                        }
                        return function() {
                            var gen25_results, gen26_items, gen27_i, key;
                            gen25_results = [];
                            gen26_items = obj._meta.id;
                            for (gen27_i = 0; gen27_i < gen26_items.length; ++gen27_i) {
                                key = gen26_items[gen27_i];
                                (function(key) {
                                    return gen25_results.push(key + " = @" + key);
                                })(key);
                            }
                            return gen25_results;
                        }().join(" and ");
                    } else {
                        request.input(obj._meta.id, obj.identity());
                        return obj._meta.id + " = @" + obj._meta.id;
                    }
                }();
                statementString = "update " + obj._meta.table + " set " + assignments + " where " + whereClause;
                logSql(obj, statementString);
                gen12_onFulfilled(gen1_promisify(function(gen16_callback) {
                    return request.query(statementString, gen16_callback);
                }).then(function(gen21_asyncResult) {
                    gen21_asyncResult;
                    return obj.setNotChanged();
                }));
            });
        };
        saveManyToOne = function(obj, field) {
            var value, gen28_asyncResult, foreignId;
            return new Promise(function(gen12_onFulfilled) {
                value = obj[field];
                gen12_onFulfilled(Promise.resolve(function() {
                    if (!(value instanceof Array)) {
                        return new Promise(function(gen12_onFulfilled) {
                            gen12_onFulfilled(Promise.resolve(value.save()).then(function(gen29_asyncResult) {
                                gen29_asyncResult;
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
            var gen30_asyncResult;
            return new Promise(function(gen12_onFulfilled) {
                gen12_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen31_index, field, gen32_result) {
                    var gen33_asyncResult;
                    return new Promise(function(gen12_onFulfilled) {
                        gen12_onFulfilled(Promise.resolve(saveManyToOne(obj, field)).then(function(gen33_asyncResult) {
                            return gen32_result(gen33_asyncResult, gen31_index);
                        }));
                    });
                })));
            });
        };
        saveOneToMany = function(obj, field) {
            var items, gen34_asyncResult;
            return new Promise(function(gen12_onFulfilled) {
                items = obj[field];
                gen12_onFulfilled(Promise.resolve(function() {
                    if (items instanceof Array) {
                        return new Promise(function(gen12_onFulfilled) {
                            gen12_onFulfilled(Promise.resolve(gen2_listComprehension(items, false, function(gen35_index, item, gen36_result) {
                                var gen37_asyncResult;
                                return new Promise(function(gen12_onFulfilled) {
                                    gen12_onFulfilled(Promise.resolve(item.save()).then(function(gen37_asyncResult) {
                                        return gen36_result(gen37_asyncResult, gen35_index);
                                    }));
                                });
                            })));
                        });
                    }
                }()));
            });
        };
        saveOneToManys = function(obj) {
            var gen38_asyncResult;
            return new Promise(function(gen12_onFulfilled) {
                gen12_onFulfilled(Promise.resolve(gen2_listComprehension(foreignFieldsForObject(obj), false, function(gen39_index, field, gen40_result) {
                    var gen41_asyncResult;
                    return new Promise(function(gen12_onFulfilled) {
                        gen12_onFulfilled(Promise.resolve(saveOneToMany(obj, field)).then(function(gen41_asyncResult) {
                            return gen40_result(gen41_asyncResult, gen39_index);
                        }));
                    });
                })));
            });
        };
        hash = function(obj) {
            var h, fields;
            h = crypto.createHash("md5");
            fields = function() {
                var gen42_results, gen43_items, gen44_i, field;
                gen42_results = [];
                gen43_items = fieldsForObject(obj);
                for (gen44_i = 0; gen44_i < gen43_items.length; ++gen44_i) {
                    field = gen43_items[gen44_i];
                    (function(field) {
                        return gen42_results.push([ field, obj[field] ]);
                    })(field);
                }
                return gen42_results;
            }();
            h.update(JSON.stringify(fields));
            return h.digest("hex");
        };
        return prototype({
            save: function(gen45_options) {
                var self = this;
                var force;
                force = gen45_options !== void 0 && Object.prototype.hasOwnProperty.call(gen45_options, "force") && gen45_options.force !== void 0 ? gen45_options.force : false;
                var gen46_asyncResult;
                return new Promise(function(gen12_onFulfilled) {
                    gen12_onFulfilled(Promise.resolve(function() {
                        if (self.changed() || force) {
                            return new Promise(function(gen12_onFulfilled) {
                                gen12_onFulfilled(Promise.resolve(saveManyToOnes(self)).then(function(gen47_asyncResult) {
                                    gen47_asyncResult;
                                    return Promise.resolve(function() {
                                        if (!self.saved()) {
                                            return new Promise(function(gen12_onFulfilled) {
                                                gen12_onFulfilled(Promise.resolve(insert(self)));
                                            });
                                        } else {
                                            return new Promise(function(gen12_onFulfilled) {
                                                gen12_onFulfilled(Promise.resolve(update(self)));
                                            });
                                        }
                                    }()).then(function(gen48_asyncResult) {
                                        gen48_asyncResult;
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
                        var gen49_results, gen50_items, gen51_i, id;
                        gen49_results = [];
                        gen50_items = self._meta.id;
                        for (gen51_i = 0; gen51_i < gen50_items.length; ++gen51_i) {
                            id = gen50_items[gen51_i];
                            (function(id) {
                                return gen49_results.push(self[id]);
                            })(id);
                        }
                        return gen49_results;
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
                model = function(obj, gen52_options) {
                    var saved, modified;
                    saved = gen52_options !== void 0 && Object.prototype.hasOwnProperty.call(gen52_options, "saved") && gen52_options.saved !== void 0 ? gen52_options.saved : false;
                    modified = gen52_options !== void 0 && Object.prototype.hasOwnProperty.call(gen52_options, "modified") && gen52_options.modified !== void 0 ? gen52_options.modified : false;
                    var row;
                    row = modelPrototype(obj);
                    if (saved) {
                        row.setSaved();
                        if (!modified) {
                            row.setNotChanged();
                        }
                    }
                    return row;
                };
                model.query = function() {
                    var self = this;
                    var args = Array.prototype.slice.call(arguments, 0, arguments.length);
                    var gen53_asyncResult, gen54_asyncResult, gen55_o;
                    return new Promise(function(gen12_onFulfilled) {
                        gen55_o = db;
                        gen12_onFulfilled(Promise.resolve(gen55_o.query.apply(gen55_o, args)).then(function(gen54_asyncResult) {
                            return Promise.resolve(gen2_listComprehension(gen54_asyncResult, false, function(gen56_index, e, gen57_result) {
                                return gen57_result(self(e, {
                                    saved: true
                                }), gen56_index);
                            }));
                        }));
                    });
                };
                return model;
            },
            query: function(query, params) {
                var self = this;
                var request, gen58_items, gen59_i, key, gen60_asyncResult;
                return new Promise(function(gen12_onFulfilled) {
                    request = new sql.Request(self.connection);
                    if (params) {
                        gen58_items = Object.keys(params);
                        for (gen59_i = 0; gen59_i < gen58_items.length; ++gen59_i) {
                            key = gen58_items[gen59_i];
                            request.input(key, params[key]);
                        }
                    }
                    gen12_onFulfilled(gen1_promisify(function(gen16_callback) {
                        return request.query(query, gen16_callback);
                    }));
                });
            },
            connect: function(config) {
                var self = this;
                var gen61_asyncResult;
                return new Promise(function(gen12_onFulfilled) {
                    self.connection = new sql.Connection(config);
                    gen12_onFulfilled(gen1_promisify(function(gen16_callback) {
                        return self.connection.connect(gen16_callback);
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
                var gen62_asyncResult;
                return new Promise(function(gen12_onFulfilled) {
                    gen12_onFulfilled(Promise.resolve(db.connect(config)).then(function(gen62_asyncResult) {
                        gen62_asyncResult;
                        return db;
                    }));
                });
            }();
        } else {
            return db;
        }
    };
}).call(this);