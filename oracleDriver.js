var optionalRequire = require('./optionalRequire');
var promisify = require('./promisify');
var debug = require('debug')('sworm:oracle');

module.exports = function () {
  var oracledb = optionalRequire('oracledb');

  return {
    query: function (query, params, options) {
      var self = this;

      var results = this.execute(replaceParameters(query, params), params);

      if (options && options.statement) {
        return results;
      } else {
        return results.then(function (r) {
          return formatRows(r);
        });
      }
    },

    execute: function (query, params) {
      var self = this;
      debug(query, params);
      return promisify(function (cb) {
        return params
          ? self.connection.execute(query, params, cb)
          : self.connection.execute(query, cb);
      });
    },

    connect: function (config) {
      var self = this;

      if (config.options) {
        Object.keys(config.options).forEach(function (key) {
          oracledb[key] = config.options[key];
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

    outputIdBeforeValues: function (id) {
      return "";
    },

    outputIdAfterValues: function (id) {
      return " returning " + id + " into :returning_into_id";
    },

    outputIdKeys: function (idType) {
      return {
        returning_into_id: { type: idType || oracledb.NUMBER, dir: oracledb.BIND_OUT }
      };
    },

    insertedId: function (rows, id) {
      return rows.outBinds.returning_into_id[0];
    }
  };
};

function formatRows(results) {
  var rows = results.rows;
  if (!rows) {
    return rows;
  }

  var fields = results.metaData.map(function (field) {
    if (/[a-z]/.test(field.name)) {
      return field.name;
    } else {
      return field.name.toLowerCase();
    }
  });

  if (fields.length > 0) {
    var results;
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

function replaceParameters(query, params) {
  return query.replace(/@([a-z_0-9]+)\b/gi, function (_, paramName) {
    if (!params.hasOwnProperty(paramName)) {
      throw new Error ('no such parameter @' + paramName);
    }

    return ':' + paramName;
  });
}
