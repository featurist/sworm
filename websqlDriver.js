var debug = require('debug')('sworm:websql');
var paramRegex = require('./paramRegex')
var urlUtils = require('url')

module.exports = function() {
  return {
    query: function(query, params, options) {
      var self = this;
      var paramList = []

      if (params) {
        query = query.replace(paramRegex, function(_, paramName) {
          if (!params.hasOwnProperty(paramName)) {
            throw new Error('no such parameter @' + paramName);
          } else {
            paramList.push(params[paramName]);
          }
          return '?';
        });
      }

      return new Promise(function (fulfil, reject) {
        debug(query, paramList);
        self.connection.transaction(function(tx) {
          tx.executeSql(query, paramList, function(tx, result){
            if (options.statement || options.insert) {
              var r = {}

              if (options.statement) {
                r.changes = result.rowsAffected
              }

              if (options.insert) {
                r.id = params.hasOwnProperty(options.id) ? params[options.id] : result.insertId
              }

              fulfil(r)
            } else {
              var results = []
              for (var i = 0; i<result.rows.length; i++) {
                results.push(result.rows.item(i))
              }
              fulfil(results)
            }
          }, function(tx, error){
            reject(error)
          });
        });
      });
    },

    insert: function(query, params, options) {
      return this.query(query, params, options)
    },

    connect: function(options) {
      var openDatabase = (options.config && options.config.openDatabase) || window.openDatabase
      var config = parseConfig(options)
      var defaultSize = 5 * 1024 * 1024;
      this.connection = openDatabase(config.name, '1.0', config.description, config.size || defaultSize)

      return Promise.resolve()
    },

    close: function() {
      return Promise.resolve()
    },

    noTransactions: function () {
      throw new Error('transactions are not supported with websql')
    },

    begin: function () {
      this.noTransactions()
    },

    commit: function () {
      this.noTransactions()
    },

    rollback: function () {
      this.noTransactions()
    }
  };
};

function parseConfig(options) {
  if (options.url) {
    var url = urlUtils.parse(options.url)

    if (url.protocol) {
      return {
        name: url.pathname.replace(/^\//, '')
      }
    } else {
      return {
        name: options.url
      }
    }
  } else {
    return options.config
  }
}
