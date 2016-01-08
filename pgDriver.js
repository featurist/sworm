var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");

module.exports = function() {
  var pg = optionalRequire("pg");

  return {
    query: function(query, params) {
      var self = this;
      var paramList = [];

      if (params) {
        var indexedParams = {};
        var keys = Object.keys(params);

        for (var n = 0; n < keys.length; ++n) {
          var key = keys[n];
          var value = params[key];

          indexedParams[key] = {
            index: n + 1,
            value: value
          };

          paramList.push(value);
        }

        query = query.replace(new RegExp('@([a-zA-Z_0-9]+)\\b', 'g'), function(_, paramName) {
          var param = indexedParams[paramName];
          if (!param) {
            throw new Error('no such parameter @' + paramName);
          }
          return '$' + indexedParams[paramName].index;
        });
      }

      return promisify(function(cb) {
        return self.client.query(query, paramList, cb);
      }).then(function(result) {
        return result.rows;
      });
    },

    connect: function(config) {
      var self = this;
      return new Promise(function(result, error) {
        return pg.connect(config.url, function(err, client, done) {
          if (err) {
            return error(err);
          } else {
            self.client = client;
            self.done = done;
            return result();
          }
        });
      });
    },
    close: function() {
      if (this.done) {
        return this.done();
      }
    },
    outputIdBeforeValues: function(id) {
      return "";
    },
    outputIdAfterValues: function(id) {
      return "returning " + id;
    },
    insertedId: function(rows, id) {
      return rows[0][id];
    }
  };
};
