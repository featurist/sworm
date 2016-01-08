var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");

module.exports = function() {
  var mysql = optionalRequire("mysql");

  return {
    query: function(query, params) {
      var self = this;
      var paramList = [];

      if (params) {
        query = query.replace(new RegExp('@([a-zA-Z_0-9]+)\\b', 'g'), function(_, paramName) {
          if (!params.hasOwnProperty(paramName)) {
            throw new Error("no such parameter @" + paramName);
          } else {
            paramList.push(params[paramName]);
          }
          return "?";
        });
      }

      return promisify(function(cb) {
        return self.connection.query(query, paramList, cb);
      });
    },

    connect: function(config) {
      var self = this;

      config.config.multipleStatements = true;
      self.connection = mysql.createConnection(config.config);

      return promisify(function(cb) {
        return self.connection.connect(cb);
      });
    },

    close: function() {
      return this.connection.end();
    },

    outputIdBeforeValues: function(id) {
      return "";
    },

    outputIdAfterValues: function(id) {
      return "; select last_insert_id() as id";
    },

    insertedId: function(rows, id) {
      return rows[1][0].id;
    }
  };
};
