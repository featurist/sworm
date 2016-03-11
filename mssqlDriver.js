var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:mssql');

module.exports = function() {
  var sql = optionalRequire("mssql");

  return {
    query: function(query, params) {
      var request = new sql.Request(this.connection);

      if (params) {
        Object.keys(params).forEach(function (key) {
          request.input(key, params[key]);
        });
      }

      return promisify(function(cb) {
        debug(query, params);
        return request.query(query, cb);
      });
    },

    connect: function(config) {
      var self = this;
      self.connection = new sql.Connection(config.config);

      return promisify(function(cb) {
        return self.connection.connect(cb);
      });
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + "; select scope_identity() as " + id, params).then(function (rows) {
        return rows[0][id];
      });
    },

    close: function() {
      return this.connection.close();
    }
  };
};
