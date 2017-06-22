var describeDatabase = require('../describeDatabase');
var sworm = require('../..')
var expect = require('chai').expect

var database = {
  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query(sql);
    }

    return createTable("people",
      'create table if not exists people (id integer primary key, name varchar(50) NOT NULL, address_id integer NULL, photo blob null)'
    ).then(function() {
      return createTable("pets",
        'create table if not exists pets (id integer primary key, name varchar(50) NOT NULL, owner_id integer NULL)'
      );
    }).then(function() {
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

  transactions: false,

  noModule: true
};

var config = {
  driver: "websql",
  config: {
    name: 'test'
  }
};

describeDatabase("websql", config, database, function () {
  describe('connection', function () {
    it('can connect with string for DB name', function () {
      var db = sworm.db('test')
      return db.query('select * from people')
    })

    it('can connect with URL', function () {
      var db = sworm.db('websql:///test')
      return db.query('select * from people')
    })

    it('can connect with openDatabase function', function () {
      var called = false

      var db = sworm.db({
        driver: 'websql',
        config: {
          openDatabase: function() {
            called = true
            return window.openDatabase.apply(window, arguments)
          },
          name: 'test'
        }
      })

      return db.query('select * from people').then(function () {
        expect(called).to.be.true
      })
    })
  })
})
