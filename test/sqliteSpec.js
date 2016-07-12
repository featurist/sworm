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
      'create table if not exists people (id integer primary key, name varchar(50) NOT NULL, address_id integer NULL)'
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

  driverModuleName: "sqlite3"
};

var config = {
  driver: "sqlite",
  config: { filename: __dirname + "/test.db" }
};

describeDatabase("sqlite", config, database, function () {
  describe('options', function () {
    it('can pass options to query', function () {
      var db = sworm.db(config);

      return db.query('drop table if exists blah').then(function () {
        return db.query(
          "create table blah ( x integer not null, y integer not null ); " +
          "insert into blah (x, y) values (1, 2); " +
          "insert into blah (x, y) values (2, 3); "
        , {}, {multiline: true});
      }).then(function () {
        return db.query('select * from blah').then(function (rows) {
          expect(rows).to.eql([
            { x: 1, y: 2 },
            { x: 2, y: 3 } 
          ]);
        });
      });
    });
  });
});
