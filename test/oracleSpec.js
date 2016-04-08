var dockerHostname = require('./dockerHostname');
var describeDatabase = require('./describeDatabase');
var sworm = require('..');
var oracledb = require('oracledb');
var expect = require('chai').expect;

var database = {
  createTables: function(db, tables) {
    function createTable(name, id, sql, noAutoId) {
      tables.push(name);
      return db.query(
        `BEGIN
           EXECUTE IMMEDIATE 'DROP TABLE ${name}';
         EXCEPTION WHEN OTHERS THEN
           IF SQLCODE != -942 THEN
             RAISE;
           END IF;
         END;`
      ).then(function() {
        return db.query(
          `BEGIN
             EXECUTE IMMEDIATE 'DROP SEQUENCE ${name}_seq';
           EXCEPTION WHEN OTHERS THEN
             IF SQLCODE != -2289 THEN
               RAISE;
             END IF;
           END;`
        ).then(function() {
          if (!noAutoId) {
            return db.query(`CREATE SEQUENCE ${name}_seq`);
          }
        }).then(function() {
          return db.query(sql).then(function() {
            if (!noAutoId) {
              return db.query(
                `create or replace trigger ${name}_id
                   before insert on ${name}
                   for each row
                 begin
                   select ${name}_seq.nextval into :new.${id} from dual;
                 end;`
              );
            }
          });
        });
      });
    }

    return createTable("people", "id",
      `create table people (
         id number primary key,
         name varchar2(50) NOT NULL,
         address_id number NULL
       )`
    ).then(function() {
      return createTable("people_addresses", "address_id",
        `create table people_addresses(
           address_id int NOT NULL,
           person_id int NOT NULL,
           rating int NULL
         )`,
         true
      );
    }).then(function() {
      return createTable("addresses", "id",
        `create table addresses(
           id number primary key,
           address varchar2(50) NOT NULL
         )`
      );
    }).then(function() {
      return createTable("people_weird_id", "weird_id",
        `create table people_weird_id(
           weird_id number primary key,
           name varchar2(50) NULL,
           address_weird_id int NULL
        )`
      );
    }).then(function() {
      return createTable("people_explicit_id", "id",
        `create table people_explicit_id(
           id int NOT NULL,
           name varchar2(50) NOT NULL
         )`
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

var config = {
  driver: "oracle",
  config: { user: "system", password: "oracle", connectString: `${dockerHostname}/XE` }
};

if (!process.env.TRAVIS) {
  describeDatabase("oracle", config, database, function () {
    describe('options', function () {
      it.only('can pass options to query', function () {
        var db = sworm.db(config);
        var person = db.model({table: 'people'});

        var bob = person({
          name: 'bob'
        });

        return bob.save().then(() => {
          return db.query('select * from people', {}, {formatRows: false, outFormat: oracledb.OBJECT}).then(rows => {
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
