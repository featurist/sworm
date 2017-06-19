var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:sqlite');
var urlUtils = require('url')

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
          self.connection = new sqlite.Database(config.filename, config.mode, cb);
        } else {
          self.connection = new sqlite.Database(config.filename, cb);
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
