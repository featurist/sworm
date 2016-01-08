var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");

module.exports = function() {
  var sqlite = optionalRequire('sqlite3');

  return {
    query: function(query, params, statement) {
      var self = this;
      var sqliteParams = {};

      if (params) {
        Object.keys(params).forEach(function (key) {
          sqliteParams['@' + key] = params[key];
        });
      }

      if (statement) {
        return new Promise(function (fulfil, reject) {
          self.connection.run(query, sqliteParams, function (error, result) {
            if (error) {
              reject(error);
            } else {
              fulfil({lastId: this.lastID});
            }
          });
        });
      } else {
        return promisify(function (cb) {
          self.connection.all(query, sqliteParams, cb);
        });
      }
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
    },

    outputIdBeforeValues: function(id) {
      return '';
    },

    outputIdAfterValues: function(id) {
      return '';
    },

    insertedId: function(result, id) {
      return result.lastId;
    }
  };
};
