var describeDatabase = require('./describeDatabase');

var database = {
  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query(sql);
    }

    return createTable("people",
      `create table if not exists people (
         id integer primary key,
         name varchar(50) NOT NULL,
         address_id integer NULL
       )`
    ).then(function() {
      return createTable("people_addresses",
        `create table if not exists people_addresses(
           address_id integer NOT NULL,
           person_id integer NOT NULL,
           rating integer NULL
         )`);
    }).then(function() {
      return createTable("addresses",
        `create table if not exists addresses(
           id integer primary key,
           address varchar(50) NOT NULL
         )`
      );
    }).then(function() {
      return createTable("people_weird_id",
        `create table if not exists people_weird_id(
           weird_id integer primary key,
           name varchar(50) NULL,
           address_weird_id integer NULL
         )`
      );
    }).then(function() {
      return createTable("people_explicit_id",
        `create table if not exists people_explicit_id(
           id integer NOT NULL,
           name varchar(50) NOT NULL
         )`
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

describeDatabase("sqlite", {
  driver: "sqlite",
  config: { filename: __dirname + "/test.db" }
}, database);
