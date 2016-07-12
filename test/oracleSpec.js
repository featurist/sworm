if (!process.env.TRAVIS) {
  var dockerHostname = require('./dockerHostname');
  var describeDatabase = require('./describeDatabase');
  var sworm = require('..');
  var oracledb = require('oracledb');
  var driver = require('../oracleDriver');
  var expect = require('chai').expect;
  var _ = require('underscore');
  var addUrlParams = require('./addUrlParams');

  var database = {
    createTables: function(db, tables) {
      function createTable(name, id, sql, noAutoId) {
        tables.push(name);
        return db.query(
          "BEGIN " +
          "  EXECUTE IMMEDIATE 'DROP TABLE " + name + "'; " +
          "EXCEPTION WHEN OTHERS THEN " +
          "  IF SQLCODE != -942 THEN " +
          "    RAISE; " +
          "  END IF; " +
          "END;"
        ).then(function() {
          return db.query(
            "BEGIN " +
            "  EXECUTE IMMEDIATE 'DROP SEQUENCE " + name + "_seq'; " +
            "EXCEPTION WHEN OTHERS THEN " +
            "  IF SQLCODE != -2289 THEN " +
            "    RAISE; " +
            "  END IF; " +
            "END;"
          ).then(function() {
            if (!noAutoId) {
              return db.query('CREATE SEQUENCE ' + name + '_seq');
            }
          }).then(function() {
            return db.query(sql).then(function() {
              if (!noAutoId) {
                return db.query(
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
        'create table people (id number primary key, name varchar2(50) NOT NULL, address_id number NULL)'
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
        return createTable("people_weird_id", "weird_id",
          'create table people_weird_id(weird_id number primary key, name varchar2(50) NULL, address_weird_id int NULL)'
        );
      }).then(function() {
        return createTable("people_explicit_id", "id",
          'create table people_explicit_id(id int NOT NULL, name varchar2(50) NOT NULL)'
        );
      });
    },

    "true": 1,
    "false": 0,

    clean: function(records) {
      return records;
    },

    driverModuleName: "oracledb"
  };

  function urlConfig(options) {
    return {
      driver: 'oracle',
      url: addUrlParams('oracle://system:oracle@' + dockerHostname + ':1521/XE', options)
    };
  }

  function config(options) {
    return {
      driver: "oracle",
      config: _.extend({
        user: "system",
        password: "oracle",
        connectString: dockerHostname + ':1521/XE'
      }, options)
    };
  }

  describeDatabase("oracle", config(), database, function () {
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
      it('can pass options to query', function () {
        var db = sworm.db(config());
        var person = db.model({table: 'people'});

        var bob = person({
          name: 'bob'
        });

        return bob.save().then(function () {
          return db.query('select * from people', {}, {formatRows: false, outFormat: oracledb.OBJECT}).then(function (rows) {
            expect(rows.metaData).to.eql([
              {name: 'ID'},
              {name: 'NAME'},
              {name: 'ADDRESS_ID'}
            ]);
          });
        });
      });
    });
  });
}
