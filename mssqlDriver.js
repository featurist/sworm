var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:mssql');

module.exports = function() {
  var sql = optionalRequire("mssql");

  return {
    query: function(query, params) {
      var request = new sql.Request(this.transaction || this.connection);

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

    begin: function() {
      this.transaction = this.connection.transaction();
      debug('begin transaction');
      return this.transaction.begin();
    },

    commit: function() {
      var self = this;

      debug('commit');
      return this.transaction.commit().then(function() {
        self.transaction = undefined;
      });
    },

    rollback: function() {
      var self = this;

      debug('rollback');
      return this.transaction.rollback().then(function() {
        self.transaction = undefined;
      });
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + "; select scope_identity() as " + id, params).then(function (rows) {
        return rows[0][id];
      });
    },

    close: function() {
      this.connection.close();
      return Promise.resolve();
    }
  };
};
