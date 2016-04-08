var optionalRequire = require('./optionalRequire');
var promisify = require('./promisify');
var debug = require('debug')('sworm:oracle');
var _ = require('underscore');

module.exports = function () {
  var oracledb = optionalRequire('oracledb');

  return {
    query: function (query, params, options) {
      var results = this.execute(replaceParameters(query), params, _.extend({outFormat: oracledb.ARRAY}, options));

      if (options && (options.statement || options.insert || options.formatRows == false)) {
        return results;
      } else {
        return results.then(function (r) {
          return formatRows(r);
        });
      }
    },

    execute: function (query, params, options) {
      var self = this;
      debug(query, params);
      return promisify(function (cb) {
        self.connection.execute(query, params || {}, options, cb)
      });
    },

    insert: function(query, params, options) {
      var id = options.id;

      return this.query(query + " returning " + id + " into :returning_into_id", params, options).then(function (rows) {
        return rows.outBinds.returning_into_id[0];
      });
    },

    connect: function (config) {
      var self = this;

      if (config.config.options) {
        Object.keys(config.config.options).forEach(function (key) {
          oracledb[key] = config.config.options[key];
        });
      }

      return promisify(function (cb) {
        if (config.config.pool) {
          config.config.pool.getConnection(cb);
        } else {
          oracledb.getConnection(config.config, cb);
        }
      }).then(function (connection) {
        self.connection = connection;
      });
    },

    close: function () {
      var self = this;
      return promisify(function (cb) {
        self.connection.release(cb);
      });
    },

    insertEmpty: function(table, id) {
      return 'insert into ' + table + ' (' + id + ') values (default)';
    },

    outputIdKeys: function (idType) {
      return {
        returning_into_id: { type: idType || oracledb.NUMBER, dir: oracledb.BIND_OUT }
      };
    }
  };
};

function formatRows(resultSet) {
  var rows = resultSet.rows;
  if (!rows) {
    return rows;
  }

  var fields = resultSet.metaData.map(function (field) {
    if (/[a-z]/.test(field.name)) {
      return field.name;
    } else {
      return field.name.toLowerCase();
    }
  });

  if (fields.length > 0) {
    var length = rows.length;
    var results = new Array(length);

    for (var r = 0; r < length; r++) {
      var row = {};
      results[r] = row;
      for (var f = 0; f < fields.length; f++) {
        row[fields[f]] = rows[r][f];
      }
    }

    return results;
  } else {
    return rows;
  }
}

function replaceParameters(query) {
  return query.replace(/@([a-z_0-9]+)\b/gi, function (_, paramName) {
    return ':' + paramName;
  });
}
