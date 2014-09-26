(function() {
    var Promise = require("bluebird");
    var gen1_listComprehension = function(items, areRanges, block) {
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
    var crypto, _, mssqlDriver, pgDriver, mysqlDriver, rowBase, option;
    crypto = require("crypto");
    _ = require("underscore");
    mssqlDriver = require("./mssqlDriver");
    pgDriver = require("./pgDriver");
    mysqlDriver = require("./mysqlDriver");
    rowBase = function() {
        var fieldsForObject, foreignFieldsForObject, insert, update, foreignField, saveManyToOne, saveManyToOnes, saveOneToMany, saveOneToManys, hash;
        fieldsForObject = function(obj) {
            return function() {
                var gen2_results, gen3_items, gen4_i, key;
                gen2_results = [];
                gen3_items = Object.keys(obj);
                for (gen4_i = 0; gen4_i < gen3_items.length; ++gen4_i) {
                    key = gen3_items[gen4_i];
                    (function(key) {
                        var value;
                        value = obj[key];
                        if (value instanceof Date || value !== null && value !== void 0 && !(value instanceof Object)) {
                            return gen2_results.push(key);
                        }
                    })(key);
                }
                return gen2_results;
            }();
        };
        foreignFieldsForObject = function(obj) {
            return function() {
                var gen5_results, gen6_items, gen7_i, key;
                gen5_results = [];
                gen6_items = Object.keys(obj);
                for (gen7_i = 0; gen7_i < gen6_items.length; ++gen7_i) {
                    key = gen6_items[gen7_i];
                    (function(key) {
                        var value;
                        if (!/^_/.test(key) && key !== obj._meta.id) {
                            value = obj[key];
                            if (!(value instanceof Date) && value instanceof Object) {
                                return gen5_results.push(key);
                            }
                        }
                    })(key);
                }
                return gen5_results;
            }();
        };
        insert = function(obj) {
            var keys, fields, values, outputId, statementString, gen8_asyncResult, r, insertedId;
            return new Promise(function(gen9_onFulfilled) {
                keys = fieldsForObject(obj);
                fields = keys.join(", ");
                values = function() {
                    var gen10_results, gen11_items, gen12_i, key;
                    gen10_results = [];
                    gen11_items = keys;
                    for (gen12_i = 0; gen12_i < gen11_items.length; ++gen12_i) {
                        key = gen11_items[gen12_i];
                        (function(key) {
                            return gen10_results.push("@" + key);
                        })(key);
                    }
                    return gen10_results;
                }().join(", ");
                outputId = function() {
                    if (typeof obj._meta.id === "string") {
                        return {
                            beforeValues: function() {
                                var self = this;
                                return obj._meta.db.driver.outputIdBeforeValues(obj._meta.id);
                            },
                            afterValues: function() {
                                var self = this;
                                return obj._meta.db.driver.outputIdAfterValues(obj._meta.id);
                            }
                        };
                    } else {
                        return {
                            beforeValues: function() {
                                var self = this;
                                return "";
                            },
                            afterValues: function() {
                                var self = this;
                                return "";
                            }
                        };
                    }
                }();
                statementString = "insert into " + obj._meta.table + "\n  (" + fields + ")\n  " + outputId.beforeValues() + "\n  values (" + values + ")\n  " + outputId.afterValues();
                gen9_onFulfilled(Promise.resolve(obj._meta.db.query(statementString, _.pick(obj, keys))).then(function(gen8_asyncResult) {
                    r = gen8_asyncResult;
                    obj.setSaved();
                    if (!obj._meta.compoundKey) {
                        insertedId = obj._meta.db.driver.insertedId(r, obj._meta.id);
                        obj[obj._meta.id] = insertedId;
                    }
                    return obj.setNotChanged();
                }));
            });
        };
        update = function(obj) {
            var keys, assignments, gen13_o, whereClause, statementString, gen14_asyncResult;
            return new Promise(function(gen9_onFulfilled) {
                keys = function() {
                    var gen15_results, gen16_items, gen17_i, key;
                    gen15_results = [];
                    gen16_items = fieldsForObject(obj);
                    for (gen17_i = 0; gen17_i < gen16_items.length; ++gen17_i) {
                        key = gen16_items[gen17_i];
                        (function(key) {
                            if (key !== obj._meta.id) {
                                return gen15_results.push(key);
                            }
                        })(key);
                    }
                    return gen15_results;
                }();
                assignments = function() {
                    var gen18_results, gen19_items, gen20_i, key;
                    gen18_results = [];
                    gen19_items = keys;
                    for (gen20_i = 0; gen20_i < gen19_items.length; ++gen20_i) {
                        key = gen19_items[gen20_i];
                        (function(key) {
                            return gen18_results.push(key + " = @" + key);
                        })(key);
                    }
                    return gen18_results;
                }().join(", ");
                whereClause = function() {
                    if (obj._meta.compoundKey) {
                        gen13_o = keys;
                        gen13_o.push.apply(gen13_o, obj._meta.id);
                        return function() {
                            var gen21_results, gen22_items, gen23_i, key;
                            gen21_results = [];
                            gen22_items = obj._meta.id;
                            for (gen23_i = 0; gen23_i < gen22_items.length; ++gen23_i) {
                                key = gen22_items[gen23_i];
                                (function(key) {
                                    return gen21_results.push(key + " = @" + key);
                                })(key);
                            }
                            return gen21_results;
                        }().join(" and ");
                    } else {
                        if (obj.identity() === void 0) {
                            throw new Error("entity must have " + obj._meta.id + " to be updated");
                        }
                        keys.push(obj._meta.id);
                        return obj._meta.id + " = @" + obj._meta.id;
                    }
                }();
                statementString = "update " + obj._meta.table + " set " + assignments + " where " + whereClause;
                gen9_onFulfilled(Promise.resolve(obj._meta.db.query(statementString, _.pick(obj, keys))).then(function(gen14_asyncResult) {
                    gen14_asyncResult;
                    return obj.setNotChanged();
                }));
            });
        };
        foreignField = function(obj, field) {
            var v;
            v = obj[field];
            if (v instanceof Function) {
                return obj[field]();
            } else {
                return v;
            }
        };
        saveManyToOne = function(obj, field) {
            var value, gen24_asyncResult, foreignId;
            return new Promise(function(gen9_onFulfilled) {
                value = foreignField(obj, field);
                gen9_onFulfilled(Promise.resolve(function() {
                    if (!(value instanceof Array)) {
                        return new Promise(function(gen9_onFulfilled) {
                            gen9_onFulfilled(Promise.resolve(value.save()).then(function(gen25_asyncResult) {
                                gen25_asyncResult;
                                foreignId = function() {
                                    if (obj._meta.foreignKeyFor) {
                                        return obj._meta.foreignKeyFor(field);
                                    } else {
                                        return field + "_id";
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
            var gen26_asyncResult;
            return new Promise(function(gen9_onFulfilled) {
                gen9_onFulfilled(Promise.resolve(gen1_listComprehension(foreignFieldsForObject(obj), false, function(gen27_index, field, gen28_result) {
                    var gen29_asyncResult;
                    return new Promise(function(gen9_onFulfilled) {
                        gen9_onFulfilled(Promise.resolve(saveManyToOne(obj, field)).then(function(gen29_asyncResult) {
                            return gen28_result(gen29_asyncResult, gen27_index);
                        }));
                    });
                })));
            });
        };
        saveOneToMany = function(obj, field) {
            var items, gen30_asyncResult;
            return new Promise(function(gen9_onFulfilled) {
                items = foreignField(obj, field);
                gen9_onFulfilled(Promise.resolve(function() {
                    if (items instanceof Array) {
                        return new Promise(function(gen9_onFulfilled) {
                            gen9_onFulfilled(Promise.resolve(gen1_listComprehension(items, false, function(gen31_index, item, gen32_result) {
                                var gen33_asyncResult;
                                return new Promise(function(gen9_onFulfilled) {
                                    gen9_onFulfilled(Promise.resolve(item.save()).then(function(gen33_asyncResult) {
                                        return gen32_result(gen33_asyncResult, gen31_index);
                                    }));
                                });
                            })));
                        });
                    }
                }()));
            });
        };
        saveOneToManys = function(obj) {
            var gen34_asyncResult;
            return new Promise(function(gen9_onFulfilled) {
                gen9_onFulfilled(Promise.resolve(gen1_listComprehension(foreignFieldsForObject(obj), false, function(gen35_index, field, gen36_result) {
                    var gen37_asyncResult;
                    return new Promise(function(gen9_onFulfilled) {
                        gen9_onFulfilled(Promise.resolve(saveOneToMany(obj, field)).then(function(gen37_asyncResult) {
                            return gen36_result(gen37_asyncResult, gen35_index);
                        }));
                    });
                })));
            });
        };
        hash = function(obj) {
            var h, fields;
            h = crypto.createHash("md5");
            fields = function() {
                var gen38_results, gen39_items, gen40_i, field;
                gen38_results = [];
                gen39_items = fieldsForObject(obj);
                for (gen40_i = 0; gen40_i < gen39_items.length; ++gen40_i) {
                    field = gen39_items[gen40_i];
                    (function(field) {
                        return gen38_results.push([ field, obj[field] ]);
                    })(field);
                }
                return gen38_results;
            }();
            h.update(JSON.stringify(fields));
            return h.digest("hex");
        };
        return prototype({
            save: function(gen41_options) {
                var self = this;
                var force;
                force = gen41_options !== void 0 && Object.prototype.hasOwnProperty.call(gen41_options, "force") && gen41_options.force !== void 0 ? gen41_options.force : false;
                var gen42_asyncResult;
                return new Promise(function(gen9_onFulfilled) {
                    gen9_onFulfilled(Promise.resolve(function() {
                        if (!self._saving) {
                            return new Promise(function(gen9_onFulfilled) {
                                self.setSaving(true);
                                gen9_onFulfilled(new Promise(function(gen9_onFulfilled) {
                                    gen9_onFulfilled(Promise.resolve(saveManyToOnes(self)).then(function(gen43_asyncResult) {
                                        gen43_asyncResult;
                                        return Promise.resolve(function() {
                                            if (self.changed() || force) {
                                                return new Promise(function(gen9_onFulfilled) {
                                                    gen9_onFulfilled(Promise.resolve(function() {
                                                        if (!self.saved()) {
                                                            return new Promise(function(gen9_onFulfilled) {
                                                                gen9_onFulfilled(Promise.resolve(insert(self)));
                                                            });
                                                        } else {
                                                            return new Promise(function(gen9_onFulfilled) {
                                                                gen9_onFulfilled(Promise.resolve(update(self)));
                                                            });
                                                        }
                                                    }()));
                                                });
                                            }
                                        }()).then(function(gen44_asyncResult) {
                                            gen44_asyncResult;
                                            return Promise.resolve(saveOneToManys(self));
                                        });
                                    }));
                                }).then(function(gen45_result) {
                                    return Promise.resolve(self.setSaving(false)).then(function() {
                                        return gen45_result;
                                    });
                                }, function(gen45_result) {
                                    return Promise.resolve(self.setSaving(false)).then(function() {
                                        throw gen45_result;
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
            setSaving: function(saving) {
                var self = this;
                if (saving) {
                    return Object.defineProperty(self, "_saving", {
                        value: true,
                        configurable: true
                    });
                } else {
                    return delete self._saving;
                }
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
                model = function(obj, gen49_options) {
                    var saved, modified;
                    saved = gen49_options !== void 0 && Object.prototype.hasOwnProperty.call(gen49_options, "saved") && gen49_options.saved !== void 0 ? gen49_options.saved : false;
                    modified = gen49_options !== void 0 && Object.prototype.hasOwnProperty.call(gen49_options, "modified") && gen49_options.modified !== void 0 ? gen49_options.modified : false;
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
                    var gen50_asyncResult, gen51_asyncResult, gen52_o;
                    return new Promise(function(gen9_onFulfilled) {
                        gen52_o = db;
                        gen9_onFulfilled(Promise.resolve(gen52_o.query.apply(gen52_o, args)).then(function(gen51_asyncResult) {
                            return Promise.resolve(gen1_listComprehension(gen51_asyncResult, false, function(gen53_index, e, gen54_result) {
                                return gen54_result(self(e, {
                                    saved: true
                                }), gen53_index);
                            }));
                        }));
                    });
                };
                return model;
            },
            query: function(query, params) {
                var self = this;
                self.logQuery(query, params);
                return self.driver.query(query, params);
            },
            logQuery: function(query, params) {
                var self = this;
                if (self.log) {
                    if (self.log instanceof Function) {
                        return self.log(query, params);
                    } else {
                        return console.log(query, params);
                    }
                }
            },
            connect: function(config) {
                var self = this;
                var gen55_asyncResult;
                return new Promise(function(gen9_onFulfilled) {
                    self.driver = {
                        mssql: mssqlDriver,
                        pg: pgDriver,
                        mysql: mysqlDriver
                    }[config.driver]();
                    gen9_onFulfilled(Promise.resolve(self.driver.connect(config)));
                });
            },
            close: function() {
                var self = this;
                return self.driver.close();
            }
        };
        if (config) {
            return function() {
                var gen56_asyncResult;
                return new Promise(function(gen9_onFulfilled) {
                    gen9_onFulfilled(Promise.resolve(db.connect(config)).then(function(gen56_asyncResult) {
                        gen56_asyncResult;
                        return db;
                    }));
                });
            }();
        } else {
            return db;
        }
    };
}).call(this);