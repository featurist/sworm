var describeDatabase = require('./describeDatabase');
var expect = require('chai').expect;
var sworm = require('..');

var database = {
  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query(sql);
    }

    return createTable("people",
      'create table if not exists people (id integer primary key, name varchar(50) NOT NULL, address_id integer NULL, photo blob null)'
    ).then(function() {
      return createTable("people_addresses",
        'create table if not exists people_addresses(address_id integer NOT NULL, person_id integer NOT NULL, rating integer NULL)'
      );
    }).then(function() {
      return createTable("addresses",
        'create table if not exists addresses(id integer primary key, address varchar(50) NOT NULL)'
      );
    }).then(function() {
      return createTable("people_weird_id",
        'create table if not exists people_weird_id(weird_id integer primary key, name varchar(50) NULL, address_weird_id integer NULL)'
      );
    }).then(function() {
      return createTable("people_explicit_id",
        'create table if not exists people_explicit_id(id integer NOT NULL, name varchar(50) NOT NULL)'
      );
    });
  },

  "true": 1,
  "false": 0,

  clean: function(records) {
    return records;
  },

  driverModuleName: "websql",

  transactions: false
};

var config = {
  driver: "websql",
  config: { filename: __dirname + "/test.db" }
};

describeDatabase("websql", config, database, function () {
  describe('connection', function () {
    it('can accept a file: URL', function () {
      var db = sworm.db('file://' + config.config.filename + '?asdf=asdf');
      return db.query('select * from people')
    });

    it('can accept a filename', function () {
      var db = sworm.db(config.config.filename);
      return db.query('select * from people')
    });

    context('openDatabase option', function () {
      it('can provide a custom openDatabase implementation that doesnt work', function () {
        var db = sworm.db({
          driver: 'websql',
          config: {},
          openDatabase: function () {
            throw new Error('openDatabase called')
          }})

        expect(db.connect.bind(db)).to.throw('openDatabase called')
      })

      it('can provide a working custom openDatabase implementation', function () {
        var db = sworm.db({
          driver: 'websql',
          config: config.config,
          openDatabase: require('websql')
        })

        return db.query('select * from people')
      })
    })
  });
});
