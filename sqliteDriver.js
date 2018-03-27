var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:sqlite');
var urlUtils = require('url')

module.exports = function() {
  var Database;

  try {
    Database = require('better-sqlite3');
    return betterSqliteInit(Database);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      try {
        Database = require('sqlite3').Database;
        return sqliteInit(Database);
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') {
          throw new Error("Driver not found, please install either better-sqlite3 or sqlite3 modules");
        }
        throw e;
      }
    }
    throw e;
  }
};

function betterSqliteInit(Database) {
  return {
    query: function(query, params, options) {
      var sqliteParams = Object.keys(params).reduce(function(result, key) {
        if (params[key] instanceof Date) {
          result[key] = params[key].getTime()
        } else if (typeof params[key] === 'boolean') {
          result[key] = params[key] ? 1 : 0
        } else {
          result[key] = params[key]
        }
        return result
      }, {})

      debug(query, sqliteParams);

      if (options.statement || options.insert) {
        var statement = this.connection.prepare(query);
        var res = statement.run(sqliteParams);
        return Promise.resolve({
          id: sqliteParams.hasOwnProperty(options.id) ? sqliteParams[options.id] : res.lastInsertROWID,
          changes: res.changes
        });
      } else if (options.exec || options.multiline) {
        return Promise.resolve(this.connection.exec(query));
      } else {
        var statement = this.connection.prepare(query);
        try {
          return Promise.resolve(statement.all(sqliteParams));
        } catch (e) {
          if (e.message === 'This statement does not return data. Use run() instead') {
            return Promise.resolve(statement.run(sqliteParams));
          }
          return Promise.reject(e);
        }
      }
    },

    insert: function(query, params, options) {
      return this.query(query, params, options)
    },

    connect: function(options) {
      var config = parseConfig(options)
      this.connection = new Database(config.filename, config);
      return Promise.resolve()
    },

    close: function() {
      this.connection.close();
      return Promise.resolve();
    }
  };
};

function sqliteInit(Database) {
  return {
    query: function(query, params, options) {
      var self = this;
      var sqliteParams = {};

      if (params) {
        Object.keys(params).forEach(function (key) {
          sqliteParams['@' + key] = params[key];
        });
      }

      if (options.statement || options.insert) {
        return new Promise(function (fulfil, reject) {
          debug(query, sqliteParams);
          self.connection.run(query, sqliteParams, function (error) {
            if (error) {
              reject(error);
            } else {
              fulfil({
                id: params.hasOwnProperty(options.id) ? params[options.id] : this.lastID,
                changes: this.changes
              });
            }
          });
        });
      } else if (options.exec || options.multiline) {
        return promisify(function (cb) {
          debug(query, sqliteParams);
          self.connection.exec(query, cb);
        });
      } else {
        return promisify(function (cb) {
          debug(query, sqliteParams);
          self.connection.all(query, sqliteParams, cb);
        });
      }
    },

    insert: function(query, params, options) {
      return this.query(query, params, options)
    },

    connect: function(options) {
      var self = this;
      var config = parseConfig(options)

      return promisify(function(cb) {
        if (options.mode) {
          self.connection = new Database(config.filename, config.mode, cb);
        } else {
          self.connection = new Database(config.filename, cb);
        }
      });
    },

    close: function() {
      var self = this;
      return promisify(function (cb) {
        return self.connection.close(cb);
      });
    }
  };
};

function parseConfig(options) {
  if (options.url) {
    var url = urlUtils.parse(options.url)

    if (url.protocol) {
      return {
        filename: url.pathname
      }
    } else {
      return {
        filename: options.url
      }
    }
  } else {
    return options.config
  }
}
