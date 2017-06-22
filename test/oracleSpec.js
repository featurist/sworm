if (!process.env.TRAVIS) {
  var describeDatabase = require('./describeDatabase');
  var sworm = require('..');
  var oracledb = require('oracledb');
  var driver = require('../oracleDriver');
  var expect = require('chai').expect;
  var _ = require('underscore');
  var addUrlParams = require('./addUrlParams');

  function wait(n) {
    return new Promise(function (resolve) { setTimeout(resolve, n); });
  }

  var database = {
    createTables: function(db, tables) {
      function createTable(name, id, sql, noAutoId) {
        tables.push(name);
        return db.statement(
          "BEGIN " +
          "  EXECUTE IMMEDIATE 'DROP TABLE " + name + "'; " +
          "EXCEPTION WHEN OTHERS THEN " +
          "  IF SQLCODE != -942 THEN " +
          "    RAISE; " +
          "  END IF; " +
          "END;"
        ).then(function() {
          return db.statement(
            "BEGIN " +
            "  EXECUTE IMMEDIATE 'DROP SEQUENCE " + name + "_seq'; " +
            "EXCEPTION WHEN OTHERS THEN " +
            "  IF SQLCODE != -2289 THEN " +
            "    RAISE; " +
            "  END IF; " +
            "END;"
          ).then(function() {
            if (!noAutoId) {
              return db.statement('CREATE SEQUENCE ' + name + '_seq');
            }
          }).then(function() {
            return db.statement(sql).then(function() {
              if (!noAutoId) {
                return db.statement(
                  "create or replace trigger " + name + "_id " +
                  "  before insert on " + name + " " +
                  "  for each row " +
                  "begin " +
                  "  select " + name + "_seq.nextval into :new." + id + " from dual; " +
                  "end;"
                );
              }
            });
          });
        });
      }

      return createTable("people", "id",
        'create table people (id number primary key, name varchar2(50) NOT NULL, address_id number NULL, photo raw(10) null)'
      ).then(function() {
        return createTable("people_addresses", "address_id",
          'create table people_addresses(address_id int NOT NULL, person_id int NOT NULL, rating int NULL)',
           true
        );
      }).then(function() {
        return createTable("addresses", "id",
          'create table addresses(id number primary key, address varchar2(50) NOT NULL)'
        );
      }).then(function() {
        return createTable("pets", "id",
          'create table pets (id number primary key, name varchar2(50) NOT NULL, owner_id number NULL)'
        );
      }).then(function() {
        return createTable("people_weird_id", "weird_id",
          'create table people_weird_id(weird_id number primary key, name varchar2(50) NULL, address_weird_id int NULL)'
        );
      }).then(function() {
        return createTable("people_explicit_id", "id",
          'create table people_explicit_id(id int NOT NULL, name varchar2(50) NOT NULL)',
          true
        );
      }).then(function() {
        return createTable("with_string_id", "id",
          'create table with_string_id(id varchar(10) primary key, name varchar2(50) NOT NULL)',
          true
        );
      }).then(function() {
        return createTable("names", "id",
          'create table names(id number primary key, name varchar2(50) NOT NULL)',
          true
        );
      });
    },

    "true": 1,
    "false": 0,

    clean: function(records) {
      return records;
    },

    setAutoCommit: function(value) {
      oracledb.autoCommit = value;
    },

    driverModuleName: "oracledb"
  };

  function urlConfig(options) {
    return {
      driver: 'oracle',
      url: addUrlParams('oracle://system:oracle@localhost:1521/XE', options)
    };
  }

  function config(options) {
    return {
      driver: "oracle",
      config: _.extend({
        user: "system",
        password: "oracle",
        connectString: 'localhost:1521/XE'
      }, options)
    };
  }

  describeDatabase("oracle", config(), database, function () {
    describe('only close after all queries have finished', function () {
      it("doesn't throw NJS-032: Connection cannot be released because a database call is in progress when closing", function () {
        var db = sworm.db(config({pool: true, asdf: true}));

        return Promise.all([
          wait(0).then(function () { return db.query("insert into people (name) values ('Bob')"); }),
          db.query('select name as asldkfjasdlfkjasldfkjasldfkjasldfkjasldfkj from people'),
        ]).then(function () {
          return db.close();
        }, function () {
          return db.close();
        });
      });
    });

    describe('passing statements to query()', function () {
      var db

      beforeEach(function () {
        db = sworm.db(config());
      })

      afterEach(function () {
        if (db) {
          return db.close()
        }
      });

      it('throws error when passing a statement to query()', function () {
        return expect(db.query('insert into people (name) values (@name)', {name: 'bob'})).to.be.rejectedWith('use db.statement()')
      })
    })

    describe('connection pooling', function () {
      var db;
      var db1;
      var db2;

      afterEach(function () {
        return Promise.all([
          db? db.close(): undefined,
          db1? db1.close(): undefined
        ]).then(function () {
          db = undefined;
          db1 = undefined;
        });
      });

      function numberOfPools() {
        return Object.keys(driver.connectionPoolCache).length;
      }

      it("doesn't pool connections normally", function () {
        db = sworm.db(urlConfig());
        var poolsBefore = numberOfPools();
        return db.query('select * from people').then(function (rows) {
          expect(rows).to.eql([]);
          expect(numberOfPools()).to.equal(poolsBefore);
        });
      });

      function testConnectionPooling(config) {
        var db1 = sworm.db(config);
        var poolsBefore = numberOfPools();
        return db1.query('select * from people').then(function (rows) {
          expect(rows).to.eql([]);
          expect(numberOfPools()).to.equal(poolsBefore + 1);
        }).then(function () {
          db2 = sworm.db(config);

          return db2.query('select * from people').then(function (rows) {
            expect(rows).to.eql([]);
            expect(numberOfPools()).to.equal(poolsBefore + 1);
          }).then(function () {
            return db2.close();
          });
        }).then(function () {
          return db1.query('select * from people').then(function (rows) {
            expect(rows).to.eql([]);
            expect(numberOfPools()).to.equal(poolsBefore + 1);
          });
        });
      }

      it("pools connections when pool: true", function () {
        return testConnectionPooling(config({pool: true}));
      });

      it("pools connections when &pool=true", function () {
        return testConnectionPooling(urlConfig({pool: true}));
      });
    });

    describe('connection options', function () {
      var db;

      it('can pass connection options', function () {
        oracledb.maxRows = 100;
        db = sworm.db(urlConfig({maxRows: 100000}));
        return db.connect().then(function () {
          expect(oracledb.maxRows).to.equal(100000);
        });
      });

      afterEach(function () {
        return db.close();
      });
    });

    describe('options', function () {
      var db;

      beforeEach(function () {
        db = sworm.db(config());
      });

      it('can add a row with a varchar id', function () {
        var blah = db.model({table: 'with_string_id', idType: oracledb.STRING});

        var b = blah({name: 'asdf', id: 'string'});
        return b.save();
      });

      describe('options', function () {
        it('can pass options to query', function () {
          var db = sworm.db(config());
          var person = db.model({table: 'people'});

          var bob = person({
            name: 'bob'
          });

          return bob.save().then(function () {
            return db.query('select * from people', {}, {formatRows: false, outFormat: oracledb.OBJECT}).then(function (rows) {
              expect(rows).to.eql([
                {
                  ID: bob.id,
                  NAME: 'bob',
                  PHOTO: null,
                  ADDRESS_ID: null
                },
              ]);
            });
          });
        });
      });

      describe('referring to sequence in insert', function () {
        it('can insert with sequence', function () {
          var name = db.model({table: 'names'});

          var bob = name({
            id: sworm.unescape('people_seq.nextVal'),
            name: 'bob'
          })

          return bob.save().then(function () {
            return db.query('select people_seq.nextVal as id from dual')
          }).then(function (rows) {
            expect(rows[0].id).to.equal(bob.id + 1)
          });
        })
      })

      afterEach(function () {
        return db.close();
      });
    });
  });
}
