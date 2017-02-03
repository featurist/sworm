var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:pg');
var urlUtils = require('url');
var _ = require('underscore')
var paramRegex = require('./paramRegex')

module.exports = function() {
  var pg = optionalRequire("pg");

  return {
    query: function(query, params, options) {
      var self = this;
      var paramList = [];

      if (params) {
        var paramIndexes = _.mapObject(params, function (value) {
          paramList.push(value);
          return paramList.length
        })

        query = query.replace(paramRegex, function(_, name) {
          if (paramIndexes.hasOwnProperty(name)) {
            return '$' + paramIndexes[name]
          } else {
            throw new Error('no such parameter @' + name);
          }
        });
      }

      return promisify(function(cb) {
        debug(query, paramList);
        return self.connection.query(query, paramList, cb);
      }).then(function(result) {
        if (options.statement || options.insert) {
          var r = {}

          if (options.statement) {
            r.changes = result.rowCount
          }

          if (options.insert) {
            r.id = result.rows[0][options.id]
          }

          return r
        } else {
          return result.rows;
        }
      });
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + ' returning ' + id, params, options)
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
              self.connection = client;
              self.done = done;
              return result();
            }
          });
        });
      } else {
        self.connection = new pg.Client(config.url || config.config);
        self.done = function () {
          self.connection.end();
        };
        return promisify(function (cb) {
          self.connection.connect(cb);
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
