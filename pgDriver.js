var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:pg');
var urlUtils = require('url');

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
        debug(query, paramList);
        return self.client.query(query, paramList, cb);
      }).then(function(result) {
        return result.rows;
      });
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + ' returning ' + id, params).then(function (rows) {
        return rows[0][id];
      });
    },

    connect: function(config) {
      var self = this;
      var options = connectionOptions(config);

      if (options.pool) {
        return new Promise(function(result, error) {
          pg.connect(config.url || config.config, function(err, client, done) {
            if (err) {
              return error(err);
            } else {
              self.client = client;
              self.done = done;
              return result();
            }
          });
        });
      } else {
        self.client = new pg.Client(config.url || config.config);
        self.done = function () {
          self.client.end();
        };
        return promisify(function (cb) {
          self.client.connect(cb);
        });
      }
    },

    close: function() {
      if (this.done) {
        this.done();
      }

      return Promise.resolve();
    }
  };
};

function connectionOptions(config) {
  if (config.url) {
    return urlUtils.parse(config.url, true).query;
  } else {
    return config.config;
  }
}
