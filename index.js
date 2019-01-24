var crypto = require("crypto");
var _ = require("underscore");
var mssqlDriver = require("./mssqlDriver");
var pgDriver = require("./pgDriver");
var mysqlDriver = require("./mysqlDriver");
var oracleDriver = require("./oracleDriver");
var sqliteDriver = require("./sqliteDriver");
var websqlDriver = require("./websqlDriver");
var debug = require("debug")("sworm");
var debugResults = require("debug")("sworm:results");
var redactConfig = require('./redactConfig');
var urlUtils = require('url')
var unescape = require('./unescape')

function fieldsForObject(obj) {
  return Object.keys(obj).filter(function (key) {
    var value = obj[key];
    return value instanceof Date
      || unescape.isUnescape(value)
      || value instanceof Buffer
      || !(
        value === null
        || value === undefined
        || value instanceof Object
      );
  });
}

function foreignFieldsForObject(obj) {
  return Object.keys(obj).filter(function (key) {
    if (/^_/.test(key) && key !== obj._meta.id) {
      return false;
    } else {
      var value = obj[key];
      return !(value instanceof Date) && !(unescape.isUnescape(value)) && !(value instanceof Buffer) && value instanceof Object;
    }
  });
}

function mapDefinition (graphDefinition) {
  var isOneToMany = graphDefinition instanceof Array
  var model = isOneToMany? graphDefinition[0]: graphDefinition

  var foreignFields = foreignFieldsForObject(model)

  foreignFields.forEach(function (field) {
    var foreign = model[field]
    model[field] = mapDefinition(foreign)
  })

  return {
    model: model,
    isOneToMany: isOneToMany,
    identityMap: {}
  }
}

function graphify(definition, rows) {
  var map = mapDefinition([definition])

  function loadEntity (row, map) {
    var fields = fieldsForObject(map.model)
    var foreignFields = foreignFieldsForObject(map.model)

    if (!map.model.hasIdentity()) {
      throw new Error('expected definition for ' + map.model._meta.table + ' to have id')
    }
    var idField = map.model.identity()

    if (!row.hasOwnProperty(idField)) {
      throw new Error('expected ' + map.model._meta.table + '.' + map.model._meta.id + ' to be present in results as ' + idField)
    }

    var id = row[idField]
    if (id !== null) {
      var entity = map.identityMap[id]
      if (!entity) {
        entity = map.identityMap[id] = map.model._meta.model({}, {saved: true})
        fields.forEach(function (field) {
          entity[field] = row[map.model[field]]
        })
      }

      foreignFields.forEach(function (field) {
        var foreign = map.model[field]

        var foreignEntity = loadEntity(row, foreign)

        if (foreign.isOneToMany) {
          var array = entity[field]
          if (!array) {
            array = entity[field] = []
          }
          var existing = array.find(function (item) {
            return item.identity() === foreignEntity.identity()
          })
          if (foreignEntity && !existing) {
            array.push(foreignEntity)
          }
        } else if (foreignEntity && !entity[field]) {
          foreignEntity.setForeignKeyField(false)
          entity[field] = foreignEntity
        }
      })

      entity.setNotChanged()
      return entity
    }
  }

  var results = []
  var resultsSet = new Set()

  rows.forEach(function (row) {
    var entity = loadEntity(row, map)
    if (!resultsSet.has(entity)) {
      results.push(entity)
      resultsSet.add(entity)
    }
  })

  return results
}

function insertStatement(obj, keys) {
  var fields = keys.join(', ');
  var values = keys.map(function (key) { return '@' + key; }).join(', ');

  if (!fields.length) {
    if (obj._meta.db.driver.insertEmpty) {
      return obj._meta.db.driver.insertEmpty(obj._meta);
    } else {
      return 'insert into ' + obj._meta.table + ' default values';
    }
  } else {
    if (obj._meta.db.driver.insertStatement) {
      return obj._meta.db.driver.insertStatement(obj._meta, fields, values)
    } else {
      return 'insert into ' + obj._meta.table + ' (' + fields + ') values (' + values + ')';
    }
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
    }).then(function (result) {
      obj.setSaved();

      if (!obj._meta.compoundKey) {
        obj[obj._meta.id] = result.id;
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

  if (!obj.hasIdentity()) {
    throw new Error(obj._meta.table + ' entity must have ' + obj._meta.id + ' to be updated');
  }

  if (obj._meta.compoundKey) {
    keys.push.apply(keys, obj._meta.id);
    whereClause = obj._meta.id.map(function (key) {
      return key + ' = @' + key;
    }).join(' and ');
  } else {
    keys.push(obj._meta.id);
    whereClause = obj._meta.id + ' = @' + obj._meta.id;
  }

  var statementString = 'update ' + obj._meta.table + ' set ' + assignments + ' where ' + whereClause;

  return obj._meta.db.query(statementString, _.pick(obj, keys), {statement: true}).then(function(result) {
    if (result.changes == 0) {
      throw new Error(obj._meta.table + ' entity with ' + obj._meta.id + ' = ' + obj.identity() + ' not found to update')
    } else {
      return obj.setNotChanged();
    }
  });
}

function foreignField(obj, field) {
  var v = obj[field];
  if (typeof v == 'function') {
    var value = obj[field](obj);
    if (value && !(value instanceof Array)) {
      throw new Error('functions must return arrays of entities: ' + obj._meta.table + '.' + field)
    }
    obj[field] = value;
    return value;
  } else {
    return v;
  }
}

function saveManyToOne(obj, field, options) {
  var value = obj[field]

  if (value && !(value instanceof Array || typeof value === 'function' || value._foreignKeyField !== undefined)) {
    return value.save(options).then(function () {
      var foreignId =
        obj._meta.foreignKeyFor ?
          obj._meta.foreignKeyFor(field) :
            field + '_id';

      if (!value._meta.compoundKey) {
        obj[foreignId] = value.identity();
      }
    });
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
  } else if (items && items._foreignKeyField !== undefined) {
    if (items._foreignKeyField) {
      items[items._foreignKeyField] = obj
    }
    return items.save()
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

var rowBase = function() {
  return {
    save: function(options) {
      this._meta.db.ensureConfigured();

      var self = this;
      var forceUpdate = options && options.hasOwnProperty('update')? options.update: false;
      var forceInsert = options && options.hasOwnProperty('insert')? options.insert: false;
      var force = options && options.hasOwnProperty('force')? options.force: forceInsert || forceUpdate;

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
        var saving = saveManyToOnes(this, {oneToManyPromises: oneToManyPromises}).then(function () {
          if (self.changed() || force) {
            var writePromise = self.saved() || forceUpdate ? update(self) : insert(self);

            return writePromise.then(function () {
              oneToManyPromises.push(saveOneToManys(self, {oneToManyPromises: oneToManyPromises}))
            });
          } else {
            oneToManyPromises.push(saveOneToManys(self, {oneToManyPromises: oneToManyPromises}))
          }
        }).then(function (value) {
          self.setSaving(false);
          return value;
        }, function (error) {
          self.setSaving(false);
          throw error;
        })

        self.setSaving(saving)
     }

      oneToManyPromises.push(self._saving)

      function waitForPromises () {
        if (oneToManyPromises.length) {
          var promises = oneToManyPromises.slice()
          oneToManyPromises.length = 0
          return Promise.all(promises).then(waitForPromises)
        } else {
          return Promise.resolve()
        }
      }

      if (waitForOneToManys) {
        return waitForPromises()
      } else {
        return self._saving;
      }
    },

    changed: function() {
      return !this._hash || this._hash !== hash(this);
    },

    identity: function () {
      if (this.hasIdentity()) {
        if (this._meta.compoundKey) {
          var self = this;
          return this._meta.id.map(function (id) {
            return self[id];
          });
        } else {
          return this[this._meta.id];
        }
      }
    },

    hasIdentity: function () {
      if (this._meta.compoundKey) {
        var self = this;
        return this._meta.id.every(function (id) {
          return self.hasOwnProperty(id) && !!self[id]
        });
      } else {
        return this.hasOwnProperty(this._meta.id) && !!this[this._meta.id]
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
    },

    setForeignKeyField: function (foreignKeyField) {
      return Object.defineProperty(this, "_foreignKeyField", {
        value: foreignKeyField
      });
    },

    insert: function () {
      return this.save({insert: true})
    },

    update: function () {
      return this.save({update: true})
    },

    upsert: function () {
      if (this.hasIdentity()) {
        return this.update()
      } else {
        return this.insert()
      }
    }
  };
}();

function isModelMeta(value, key) {
  return typeof value !== 'function' || key === 'foreignKeyFor'; 
}

exports.db = function(config) {
  var db = {
    log: config && config.log,
    config: config,

    model: function(modelConfig) {
      var proto = _.omit(modelConfig, isModelMeta);
      proto._meta = _.extend({
        id: 'id'
      }, _.pick(modelConfig, isModelMeta));

      proto._meta.db = this;
      var id = proto._meta.id;
      proto._meta.compoundKey = id == false || id instanceof Array;

      var modelPrototype = _.extend(Object.create(rowBase), proto);

      function model(obj, options) {
        var saved = typeof options == 'object' && options.hasOwnProperty('saved')? options.saved: false;
        var modified = typeof options == 'object' && options.hasOwnProperty('modified')? options.modified: false;
        var foreignKeyField = typeof options == 'object' && options.hasOwnProperty('foreignKeyField')? options.foreignKeyField: undefined;
        var row = _.extend(Object.create(modelPrototype), obj);

        if (saved) {
          row.setSaved();
          if (!modified) {
            row.setNotChanged();
          }
        }

        if (foreignKeyField !== undefined) {
          row.setForeignKeyField(foreignKeyField)
        }

        return row;
      }

      proto._meta.model = model

      model.query = function() {
        var self = this;
        return db.query.apply(db, arguments).then(function (entities) {
          return entities.map(function (e) {
            return self(e, {saved: true});
          });
        });
      };

      modelPrototype.queryGraph = function() {
        var self = this;
        return db.query.apply(db, arguments).then(function (entities) {
          return graphify(self, entities)
        });
      };

      return model;
    },

    query: function(_query, _params, _options) {
      var self = this;
      var queryParams = unescape.interpolate(_query, _params)
      var query = queryParams.query
      var params = queryParams.params
      var options = _options || {}

      return this.whenConnected(function () {
        var command = options.insert
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

    queryGraph: function(graphDefinition, query, params, options) {
      var queryArgs = Array.prototype.slice.call(arguments, 1)
      return db.query.apply(db, queryArgs).then(function (entities) {
        return graphify(graphDefinition, entities)
      });
    },

    statement: function(query, params, options) {
      options = _.extend({statement: true}, options);
      return this.query(query, params, options);
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

        if (options.insert) {
          return debugResults('id = ' + results.id);
        } else if (options.statement) {
          return debugResults('rows affected = ' + results.changes);
        } else if (!options.statement && results) {
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
      if (typeof this.config == 'string') {
        this.config = configFromUrl(this.config)
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
          sqlite: sqliteDriver,
          websql: websqlDriver
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
          return Promise.resolve(self.config.setupSession(self)).then(function (result) {
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

    transaction: function (options, fn) {
      var self = this;

      if (typeof options === 'function') {
        fn = options;
        options = undefined;
      }

      return this.begin(options).then(function() {
        return fn();
      }).then(function(r) {
        return self.commit().then(function() { return r; });
      }, function(e) {
        return self.rollback().then(function() { throw e; });
      });
    },

    begin: function (options) {
      if (this.driver.begin) {
        return this.driver.begin(options);
      } else {
        return this.statement('begin' + (options? ' ' + options: ''));
      }
    },

    commit: function () {
      if (this.driver.commit) {
        return this.driver.commit();
      } else {
        return this.statement('commit');
      }
    },

    rollback: function () {
      if (this.driver.rollback) {
        return this.driver.rollback();
      } else {
        return this.statement('rollback');
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

exports.unescape = unescape
exports.escape = function(value) {
  if (typeof value == 'string') {
    return "'" + value.replace(/'/g, "''") + "'"
  } else {
    return value
  }
}

function configFromUrl(url) {
  var isBrowser = typeof window !== 'undefined'

  var parsedUrl = urlUtils.parse(url)
  var protocol = parsedUrl.protocol? parsedUrl.protocol.replace(/:$/, ''): (isBrowser? 'websql': 'sqlite')
  var driver = {
    postgres: 'pg',
    file: 'sqlite',
    mssql: 'mssql'
  }[protocol] || protocol

  return {
    driver: driver,
    url: url
  }
}
