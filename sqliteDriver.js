var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:sqlite');

module.exports = function() {
  var sqlite = optionalRequire('sqlite3');

  return {
    query: function(query, params, options) {
      var self = this;
      var sqliteParams = {};

      if (params) {
        Object.keys(params).forEach(function (key) {
          sqliteParams['@' + key] = params[key];
        });
      }

      if (options && (options.statement || options.insert)) {
        return new Promise(function (fulfil, reject) {
          debug(query, sqliteParams);
          self.connection.run(query, sqliteParams, function (error) {
            if (error) {
              reject(error);
            } else {
              fulfil({lastId: this.lastID});
            }
          });
        });
      } else if (options && (options.exec || options.multiline)) {
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
      return this.query(query, params, options).then(function (rows) {
        return rows.lastId;
      });
    },

    connect: function(config) {
      var self = this;

      return promisify(function(cb) {
        if (config.mode) {
          self.connection = new sqlite.Database(config.config.filename, config.config.mode, cb);
        } else {
          self.connection = new sqlite.Database(config.config.filename, cb);
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
