var promisify = require('./promisify');
var optionalRequire = require("./optionalRequire");
var debug = require('debug')('sworm:mssql');

module.exports = function() {
  var sql = optionalRequire("mssql");

  return {
    query: function(query, params, options) {
      var request = new sql.Request(this.transaction || this.connection);

      if (params) {
        Object.keys(params).forEach(function (key) {
          request.input(key, params[key]);
        });
      }

      debug(query, params);
      return request.query(query).then(function (result) {
        if (options.statement || options.insert) {
          var r = {}

          if (options.statement) {
            r.changes = result.rowsAffected[0]
          }

          if (options.insert) {
            r.id = params.hasOwnProperty(options.id) ? params[options.id] : result.recordset[0][options.id]
          }

          return r
        } else {
          return result.recordset
        }
      })
    },

    connect: function(config) {
      var self = this;
      self.connection = new sql.ConnectionPool(config.config || config.url);

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

    insertEmpty: function(meta) {
      return findInsert(meta).insertEmpty(meta)
    },

    insertStatement: function(meta, fields, values) {
      return findInsert(meta).insertStatement(meta, fields, values)
    },

    insert: function(query, params, options) {
      return this.query(query, params, options)
    },

    close: function() {
      this.connection.close();
      return Promise.resolve();
    }
  };
};

function findInsert(meta) {
  var generatedId = (meta.hasOwnProperty('generatedId')? meta.generatedId: undefined) || 'scope_identity';

  if (meta.compoundKey) {
    return insertNoIdentity
  } else if (generatedId == 'scope_identity') {
    return insertScopeIdentity
  } else if (generatedId == 'output') {
    return insertOutputIdentity
  } else {
    throw new Error('expected generatedId to be either scope_identity or output, found: ' + generatedId)
  }
}

var insertScopeIdentity = {
  insertEmpty: function(meta) {
    return 'insert into ' + meta.table + ' default values; select scope_identity() as ' + meta.id;
  },

  insertStatement: function(meta, fields, values) {
    return 'insert into ' + meta.table + ' (' + fields + ') values (' + values + '); select scope_identity() as ' + meta.id;
  }
}

var insertNoIdentity = {
  insertEmpty: function(meta) {
    return 'insert into ' + meta.table + ' default values'
  },

  insertStatement: function(meta, fields, values) {
    return 'insert into ' + meta.table + ' (' + fields + ') values (' + values + ')';
  }
}

var insertOutputIdentity = {
  insertEmpty: function(meta) {
    return 'insert into ' + meta.table + ' output inserted.' + meta.id + ' default values'
  },

  insertStatement: function(meta, fields, values) {
    return 'insert into ' + meta.table + ' (' + fields + ') output inserted.' + meta.id + ' values (' + values + ')';
  }
}
