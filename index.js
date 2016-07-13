var crypto = require("crypto");
var _ = require("underscore");
var mssqlDriver = require("./mssqlDriver");
var pgDriver = require("./pgDriver");
var mysqlDriver = require("./mysqlDriver");
var oracleDriver = require("./oracleDriver");
var sqliteDriver = require("./sqliteDriver");
var debug = require("debug")("sworm");
var debugResults = require("debug")("sworm:results");
var redactConfig = require('./redactConfig');

var rowBase = function() {
  function fieldsForObject(obj) {
    return Object.keys(obj).filter(function (key) {
      var value = obj[key];
      return value instanceof Date || value instanceof Buffer || value !== null && value !== undefined && !(value instanceof Object);
    });
  }

  function foreignFieldsForObject(obj) {
    return Object.keys(obj).filter(function (key) {
      if (/^_/.test(key) && key !== obj._meta.id) {
        return false;
      } else {
        var value = obj[key];
        return !(value instanceof Date) && !(value instanceof Buffer) && value instanceof Object;
      }
    });
  }

  function insertStatement(obj, keys) {
    var fields = keys.join(', ');
    var values = keys.map(function (key) { return '@' + key; }).join(', ');

    if (!fields.length) {
      if (obj._meta.db.driver.insertEmpty) {
        return obj._meta.db.driver.insertEmpty(obj._meta.table, obj._meta.id);
      } else {
        return 'insert into ' + obj._meta.table + ' default values';
      }
    } else {
      return 'insert into ' + obj._meta.table + ' (' + fields + ') values (' + values + ')';
    }
  }

  function insert(obj) {
    return obj._meta.db.whenConnected(function () {
      var keys = fieldsForObject(obj);
      var statementString = insertStatement(obj, keys);

      var params = _.pick(obj, keys);

      if (obj._meta.db.driver.outputIdKeys && !obj._meta.compoundKey) {
        params = _.extend(params, obj._meta.db.driver.outputIdKeys(obj._meta.idType));
      }

      return obj._meta.db.query(statementString, params, {
        insert: !obj._meta.compoundKey,
        statement: obj._meta.compoundKey,
        id: obj._meta.id
      }).then(function (insertedId) {
        obj.setSaved();

        if (!obj._meta.compoundKey) {
          obj[obj._meta.id] = insertedId;
        }

        return obj.setNotChanged();
      });
    });
  }

  function update(obj) {
    var keys = fieldsForObject(obj).filter(function (key) {
      return key !== obj._meta.id;
    });
    var assignments = keys.map(function (key) {
      return key + ' = @' + key;
    }).join(', ');

    var whereClause;

    if (obj._meta.compoundKey) {
      keys.push.apply(keys, obj._meta.id);
      whereClause = obj._meta.id.map(function (key) {
        return key + ' = @' + key;
      }).join(' and ');
    } else {
      if (obj.identity() === undefined) {
        throw new Error('entity must have ' + obj._meta.id + ' to be updated');
      }

      keys.push(obj._meta.id);
      whereClause = obj._meta.id + ' = @' + obj._meta.id;
    }

    var statementString = 'update ' + obj._meta.table + ' set ' + assignments + ' where ' + whereClause;

    return obj._meta.db.query(statementString, _.pick(obj, keys), {statement: true}).then(function() {
      return obj.setNotChanged();
    });
  }

  function foreignField(obj, field) {
    var v = obj[field];
    if (typeof v == 'function') {
      var value = obj[field]();
      obj[field] = value;
      return value;
    } else {
      return v;
    }
  }

  function saveManyToOne(obj, field, options) {
    var value = foreignField(obj, field);

    if (value && !(value instanceof Array)) {
      return value.save(options).then(function () {
        var foreignId =
          obj._meta.foreignKeyFor ?
            obj._meta.foreignKeyFor(field) :
              field + '_id';

        if (!value._meta.compoundKey) {
          obj[foreignId] = value.identity();
        }
      });
    } else {
      return Promise.resolve();
    }
  }

  function saveManyToOnes(obj, options) {
    return Promise.all(foreignFieldsForObject(obj).map(function (field) {
      return saveManyToOne(obj, field, options);
    }));
  }

  function saveOneToMany(obj, field, options) {
    var items = foreignField(obj, field);

    if (items instanceof Array) {
      return Promise.all(items.map(function (item) {
        return item.save(options);
      }));
    } else {
      return Promise.resolve();
    }
  }

  function saveOneToManys(obj, options) {
    return Promise.all(foreignFieldsForObject(obj).map(function (field) {
      return saveOneToMany(obj, field, options);
    }));
  }

  function hash(obj) {
    var h = crypto.createHash('md5');
    var fields = fieldsForObject(obj).map(function (field) {
      return [field, obj[field]];
    });
    h.update(JSON.stringify(fields));
    return h.digest('hex');
  }

  return {
    save: function(options) {
      this._meta.db.ensureConfigured();

      var self = this;
      var force = options && options.hasOwnProperty('force')? options.force: false;

      var waitForOneToManys;
      var oneToManyPromises;

      if (typeof options == 'object' && options.hasOwnProperty('oneToManyPromises')) {
        waitForOneToManys = false;
        oneToManyPromises = options.oneToManyPromises;
      } else {
        waitForOneToManys = true;
        oneToManyPromises = [];
      }

      if (!self._saving) {
        self.setSaving(saveManyToOnes(this, {oneToManyPromises: oneToManyPromises}).then(function () {
          if (self.changed() || force) {
            var writePromise = self.saved() ? update(self) : insert(self);

            return writePromise.then(function () {
              return {
                oneToManys: saveOneToManys(self, {oneToManyPromises: oneToManyPromises})
              };
            });
          } else {
            return {
              oneToManys: saveOneToManys(self, {oneToManyPromises: oneToManyPromises})
            };
          }
        }).then(function (value) {
          self.setSaving(false);
          return value;
        }, function (error) {
          self.setSaving(false);
          throw error;
        }));
      }

      oneToManyPromises.push(self._saving.then(function (r) {
        return r.oneToManys;
      }));

      if (waitForOneToManys) {
        return self._saving.then(function () {
          return Promise.all(oneToManyPromises);
        });
      } else {
        return self._saving;
      }
    },

    changed: function() {
      return !this._hash || this._hash !== hash(this);
    },

    identity: function () {
      if (this._meta.compoundKey) {
        var self = this;
        return this._meta.id.map(function (id) {
          return self[id];
        });
      } else {
        return this[this._meta.id];
      }
    },

    saved: function() {
      return this._saved;
    },

    setSaving: function(saving) {
      if (saving) {
        Object.defineProperty(this, "_saving", {
          value: saving,
          configurable: true
        });
      } else {
        delete this._saving;
      }
    },

    setNotChanged: function() {
      if (this._hash) {
        this._hash = hash(this);
        return this._hash;
      } else {
        return Object.defineProperty(this, "_hash", {
          value: hash(this),
          writable: true
        });
      }
    },

    setSaved: function() {
      if (!this._saved) {
        return Object.defineProperty(this, "_saved", {
          value: true
        });
      }
    }
  };
}();

function option(obj, property, value) {
  var opt;
  if (obj.hasOwnProperty(property)) {
    opt = obj[property];
    delete obj[property];
    return opt;
  } else {
    return value;
  }
}

exports.db = function(config) {
  var db = {
    log: config && config.log,
    config: config,

    model: function(modelConfig) {
      var foreignKeyFor = option(modelConfig, 'foreignKeyFor');
      var id = option(modelConfig, 'id', 'id');
      var table = option(modelConfig, 'table');

      modelConfig._meta = {
        table: table,
        id: id,
        db: this,
        foreignKeyFor: foreignKeyFor,
        compoundKey: id == false || id instanceof Array
      };

      var modelPrototype = _.extend(Object.create(rowBase), modelConfig);

      function model(obj, options) {
        var saved = typeof options == 'object' && options.hasOwnProperty('saved')? options.saved: false;
        var modified = typeof options == 'object' && options.hasOwnProperty('modified')? options.modified: false;
        var row = _.extend(Object.create(modelPrototype), obj);

        if (saved) {
          row.setSaved();
          if (!modified) {
            row.setNotChanged();
          }
        }

        return row;
      }

      model.query = function() {
        var self = this;
        return db.query.apply(db, arguments).then(function (entities) {
          return entities.map(function (e) {
            return self(e, {saved: true});
          });
        });
      };

      return model;
    },

    query: function(query, params, options) {
      var self = this;

      return this.whenConnected(function () {
        var command = options && options.insert
          ? self.driver.insert(query, params, options)
          : self.driver.query(query, params, options)

        return command.then(function (results) {
          self.logResults(query, params, results, options);
          return results;
        }, function (e) {
          self.logError(query, params, e);
          throw e;
        });
      });
    },

    whenConnected: function(fn) {
      if (this.runningBeginSession) {
        return fn();
      } else {
        return this.connect().then(fn);
      }
    },

    logError: function(query, params, error) {
      debug(query, params, error);
    },

    logResults: function(query, params, results, options) {
        if (typeof this.log == 'function') {
          return this.log(query, params, results, options);
        } else {
          if (params) {
            debug(query, params);
          } else {
            debug(query);
          }

          if (options && options.insert) {
            return debugResults('id = ' + results);
          } else if (!(options && options.statement) && results) {
            return debugResults(results);
          }
        }
    },

    ensureConfigured: function() {
      if (!this.config) {
        throw new Error('sworm has not been configured to a database, use db.connect(config) or sworm.db(config)');
      }
    },

    connected: false,

    connect: function (config, fn) {
      if (typeof config === 'function') {
        fn = config;
        config = undefined;
      }
      if (config) {
        this.config = config;
      }

      var self = this;

      if (this.connection) {
        return this.connection;
      }

      this.ensureConfigured();

      debug('connecting to', redactConfig(this.config));

      var driver = {
          mssql: mssqlDriver,
          pg: pgDriver,
          mysql: mysqlDriver,
          oracle: oracleDriver,
          sqlite: sqliteDriver
      }[this.config.driver];

      if (!driver) {
          throw new Error("no such driver: `" + this.config.driver + "'");
      }

      this.driver = driver();

      this.connection = this.driver.connect(this.config).then(function () {
        debug('connected to', redactConfig(self.config));
        self.connected = true;

        if (self.config.setupSession) {
          self.runningBeginSession = true;
          return self.config.setupSession(self).then(function (result) {
            self.runningBeginSession = false;
            return result;
          }, function (error) {
            self.runningBeginSession = false;
            throw error;
          });
        }
      });

      if (!fn) {
        return this.connection;
      } else {
        return this.connection.then(function () {
          return fn();
        }).then(function (result) {
          return self.close().then(function () {
            return result;
          });
        }, function (error) {
          return self.close().then(function () {
            throw error;
          });
        });
      }
    },

    close: function() {
      var self = this;

      if (this.driver) {
        return this.driver.close().then(function () {
          self.connected = false;
        });
      } else {
        return Promise.resolve();
      }
    }
  };

  return db;
};
