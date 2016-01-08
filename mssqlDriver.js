var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");

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

    close: function() {
      return this.connection.close();
    },
    outputIdBeforeValues: function(id) {
      return "output Inserted." + id;
    },
    outputIdAfterValues: function(id) {
      return "";
    },
    insertedId: function(rows, id) {
      return rows[0][id];
    }
  };
};
