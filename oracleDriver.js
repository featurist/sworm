var optionalRequire = require('./optionalRequire');
var promisify = require('./promisify');
var debug = require('debug')('sworm:oracle');
var swormDebug = require('debug')('sworm');
var _ = require('underscore');
var urlUtils = require('url');
var redactConfig = require('./redactConfig');
var outstandingQueries = require('./outstandingQueries');
var randomstring = require('randomstring');
var cooperative = require('cooperative')

module.exports = function () {
  var oracledb = optionalRequire('oracledb');


  return {
    outstandingQueries: outstandingQueries(),

    query: function (query, params, options) {
      var resultsPromise = this.execute(replaceParameters(query), params, _.extend({outFormat: oracledb.ARRAY}, options))

      if (options.statement || options.insert) {
        return resultsPromise.then(function (results) {
          var r = {}

          if (options.statement) {
            r.changes = results.rowsAffected
          }

          if (options.insert) {
            r.id = results.outBinds.returning_into_id[0]
          }

          return r
        })
      } else {
        return resultsPromise;
      }
    },

    execute: function (query, params, options) {
      var self = this;
      debug(query, params);

      var promise = options.statement || options.insert
        ? promisify(function (cb) {
          self.connection.execute(query, params || {}, options, cb)
        })
        : this.queryResultSet(query, params || {}, options)

      return this.outstandingQueries.execute(promise);
    },

    queryResultSet: function(query, params, options) {
      return this.connection.execute(query, params, _.extend(options, {resultSet: true})).then(function (results) {
        var resultSet = results.resultSet
        var numberOfRows = oracledb.maxRows || 100

        function fetchRows(allRows) {
          return resultSet.getRows(numberOfRows).then(function (rows) {
            allRows.push(rows)

            if (rows.length < numberOfRows) {
              return resultSet.close().then(function () {
                return allRows
              })
            } else {
              return fetchRows(allRows)
            }
          })
        }

        return fetchRows([]).then(function (_rows) {
          var rows = _.flatten(_rows, true)

          if (options.formatRows === false) {
            return rows
          } else {
            return formatRows(results.metaData, rows)
          }
        }, function (error) {
          return resultSet.close().then(function () {
            throw error
          })
        })
      }, function (error) {
        if (/NJS-019/.test(error.message)) {
          throw new Error('oracle: you cannot pass an SQL statement to db.query(), please use db.statement()')
        } else {
          throw error
        }
      })
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + ' returning ' + id + ' into :returning_into_id', params, options)
    },

    generateTransactionName: function() {
      return 't' + randomstring.generate();
    },

    begin: function(options) {
      var transactionName = options && options.name || this.generateTransactionName();
      return this.query("set transaction name '" + transactionName + "'", undefined, {statement: true});
    },

    connect: function (swormConfig) {
      var self = this;
      var config = swormConfig.url? parseUrl(swormConfig.url): swormConfig.config;

      oracledb.autoCommit = true;

      if (config.options) {
        Object.keys(config.options).forEach(function (key) {
          oracledb[key] = config.options[key];
        });
      }

      function makeConnection() {
        if (config.pool === true) {
          return connectionPool(oracledb, config, swormConfig).then(function (pool) {
            return promisify(function (cb) { pool.getConnection(cb); });
          });
        } else if (config.pool) {
          return promisify(function (cb) { config.pool.getConnection(cb); });
        } else {
          return promisify(function (cb) { oracledb.getConnection(config, cb); });
        }
      }

      return makeConnection().then(function (connection) {
        self.connection = connection;
      });
    },

    close: function () {
      var self = this;
      if (self.connection) {
        return this.outstandingQueries.whenNotExecuting(function () {
          return promisify(function (cb) {
            self.connection.release(cb);
          });
        });
      } else {
        return Promise.resolve();
      }
    },

    insertEmpty: function(meta) {
      return 'insert into ' + meta.table + ' (' + meta.id + ') values (default)';
    },

    outputIdKeys: function (idType) {
      return {
        returning_into_id: { type: idType || oracledb.NUMBER, dir: oracledb.BIND_OUT }
      };
    }
  };
};

function formatRows(metadata, rows) {
  var fields = metadata.map(function (field) {
    if (/[a-z]/.test(field.name)) {
      return field.name;
    } else {
      return field.name.toLowerCase();
    }
  });

  if (fields.length > 0) {
    var length = rows.length;
    var results = new Array(length);

    return cooperative.forEach(rows, function(row, index) {
      var formattedRow = {};
      results[index] = formattedRow;
      for (var f = 0; f < fields.length; f++) {
        formattedRow[fields[f]] = row[f];
      }
    }).then(function () {
      return results
    })
  } else {
    return Promise.resolve(rows);
  }
}

function replaceParameters(query) {
  return query.replace(/@([a-z_0-9]+)\b/gi, function (_, paramName) {
    return ':' + paramName;
  });
}

function parseValue(value) {
  var number = Number(value);
  if (!isNaN(number)) {
    return number;
  }
  
  if (value == 'true' || value == 'false') {
    return value == 'true';
  }

  return value;
}

function parseOptions(options) {
  var result = {};

  Object.keys(options).forEach(function (key) {
    result[key] = parseValue(options[key]);
  });

  return result;
}

function parseUrl(url) {
  var u = urlUtils.parse(url, true);
  var auth = u.auth? u.auth.split(':'): [];

  var options = parseOptions(u.query);

  var pool = options.pool;
  delete options.pool;

  return {
    user: auth[0],
    password: auth[1],
    connectString: u.host + u.pathname,
    pool: pool,
    options: options
  };
}

var connectionPoolCache = {};

module.exports.connectionPoolCache = connectionPoolCache;

function connectionPool(oracledb, config, swormConfig) {
  var key = JSON.stringify(config);

  var value = connectionPoolCache[key];

  if (!value) {
    value = connectionPoolCache[key] = promisify(function (cb) {
      swormDebug('creating connection pool', redactConfig(swormConfig));
      oracledb.createPool(config, cb);
    });
  }

  return value;
}
