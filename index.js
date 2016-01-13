var crypto = require("crypto");
var _ = require("underscore");
var mssqlDriver = require("./mssqlDriver");
var pgDriver = require("./pgDriver");
var mysqlDriver = require("./mysqlDriver");
var oracleDriver = require("./oracleDriver");
var sqliteDriver = require("./sqliteDriver");
var debugQuery = require("debug")("sworm");
var debugResults = require("debug")("sworm:results");

var rowBase = function() {
  function fieldsForObject(obj) {
    return Object.keys(obj).filter(function (key) {
      var value = obj[key];
      return value instanceof Date || value !== null && value !== undefined && !(value instanceof Object);
    });
  }

  function foreignFieldsForObject(obj) {
    return Object.keys(obj).filter(function (key) {
      if (/^_/.test(key) && key !== obj._meta.id) {
        return false;
      } else {
        var value = obj[key];
        return !(value instanceof Date) && value instanceof Object;
      }
    });
  }

  function insert(obj) {
    var keys = fieldsForObject(obj);
    var fields = keys.join(', ');
    var values = keys.map(function (key) { return '@' + key; }).join(', ');

    var outputId;
    if (typeof obj._meta.id == 'string') {
      outputId = obj._meta.db.driver.outputId(obj._meta.id);
    } else {
      outputId = '';
    }

    var statementString = 'insert into ' + obj._meta.table + ' (' + fields + ') values (' + values + ') ' + outputId;

    var params = _.pick(obj, keys);

    if (obj._meta.db.driver.outputIdKeys && !obj._meta.compoundKey) {
      params = _.extend(params, obj._meta.db.driver.outputIdKeys(obj._meta.idType));
    }

    return obj._meta.db.query(statementString, params, {
      statement: true
    }).then(function (r) {
      obj.setSaved();

      if (!obj._meta.compoundKey) {
          var insertedId = obj._meta.db.driver.insertedId(r, obj._meta.id);
          obj[obj._meta.id] = insertedId;
      }

      return obj.setNotChanged();
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
      return obj[field]();
    } else {
      return v;
    }
  }

  function saveManyToOne(obj, field) {
    var value = foreignField(obj, field);

    if (!(value instanceof Array)) {
      return value.save().then(function () {
        var foreignId =
          obj._meta.foreignKeyFor
            ? obj._meta.foreignKeyFor(field)
            : field + '_id';

        if (!value._meta.compoundKey) {
          obj[foreignId] = value.identity();
        }
      });
    } else {
      return Promise.resolve();
    }
  }

  function saveManyToOnes(obj) {
    return Promise.all(foreignFieldsForObject(obj).map(function (field) {
      return saveManyToOne(obj, field);
    }));
  }

  function saveOneToMany(obj, field) {
    var items = foreignField(obj, field);

    if (items instanceof Array) {
      return Promise.all(items.map(function (item) {
        return item.save();
      }));
    } else {
      return Promise.resolve();
    }
  }

  function saveOneToManys(obj) {
    return Promise.all(foreignFieldsForObject(obj).map(function (field) {
      return saveOneToMany(obj, field);
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
      var self = this;
      var force = options && options.hasOwnProperty('force')? options.force: false;

      if (!self._saving) {
        function setNotSaving() {
          self.setSaving(false);
        }
        self.setSaving(true);

        return saveManyToOnes(this).then(function () {
          if (self.changed() || force) {
            var writePromise = self.saved()
              ? update(self)
              : insert(self);

            return writePromise.then(function () {
              return saveOneToManys(self);
            });
          } else {
            return saveOneToManys(self);
          }
        }).then(function () {
          self.setSaving(false);
        }, function (error) {
          self.setSaving(false);
          throw error;
        });
      } else {
        return Promise.resolve();
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
          value: true,
          configurable: true
        });
      } else {
        delete this._saving;
      }
    },

    setNotChanged: function() {
      if (this._hash) {
        return this._hash = hash(this);
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
  var self = this;
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
        compoundKey: id instanceof Array
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
      return this.driver.query(query, params, options).then(function (results) {
        self.logResults(query, params, results, options && options.statement);
        return results;
      }, function (e) {
        self.logError(query, params, e);
        throw e;
      });
    },

    logError: function(query, params, error) {
      debugQuery(query, params, error);
    },

    logResults: function(query, params, results, statement) {
        if (typeof this.log == 'function') {
          return this.log(query, params, results, statement);
        } else {
          if (params) {
            debugQuery(query, params);
          } else {
            debugQuery(query);
          }
          if (!statement && results) {
            return debugResults(results);
          }
        }
    },

    connect: function (config) {
      var driver = {
          mssql: mssqlDriver,
          pg: pgDriver,
          mysql: mysqlDriver,
          oracle: oracleDriver,
          sqlite: sqliteDriver
      }[config.driver];

      if (!driver) {
          throw new Error("no such driver: `" + config.driver + "'");
      }

      this.driver = driver();
      return this.driver.connect(config);
    },
    close: function() {
      return this.driver.close();
    }
  };

  if (config) {
    return db.connect(config).then(function () {
      return db;
    });
  } else {
      return db;
  }
};
