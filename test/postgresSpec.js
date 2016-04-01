var dockerHostname = require('./dockerHostname');
var describeDatabase = require('./describeDatabase');
var sworm = require('..');

function config(name) {
  name = name || '';
  var url = process.env.TRAVIS? `postgres://postgres@localhost/${name}`: `postgres://postgres:password@${dockerHostname}/${name}`;

  return {
    driver: "pg",
    url: url
  };
}

var database = {
  createDatabase: function() {
    var db = sworm.db(config('postgres'));
    return db.query('select * from pg_database where datname = @name', {name: 'sworm'}).then(function (rows) {
      if (rows.length) {
        return db.query('drop database sworm').then(() => {
          return db.query('create database sworm');
        });
      } else {
        return db.query('create database sworm');
      }
    });
  },

  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query(sql);
    }

    return createTable("people",
      `create table if not exists people (
         id serial NOT NULL,
         name varchar(50) NOT NULL,
         address_id int NULL
       )`
    ).then(function () {
      return createTable("people_addresses",
        `create table if not exists people_addresses(
           address_id int NOT NULL,
           person_id int NOT NULL,
           rating int NULL
         )`
      );
    }).then(function() {
      return createTable("addresses",
        `create table if not exists addresses(
           id serial NOT NULL,
           address varchar(50) NOT NULL
         )`
      );
    }).then(function() {
      return createTable("people_weird_id",
        `create table if not exists people_weird_id(
           weird_id serial NOT NULL,
           name varchar(50) NULL,
           address_weird_id int NULL
         )`
      );
    }).then(function() {
      return createTable("people_explicit_id",
        `create table if not exists people_explicit_id(
           id int NOT NULL,
           name varchar(50) NOT NULL
         )`
      );
    });
  },

  "true": true,
  "false": false,

  clean: function(records) {
    return records;
  },

  driverModuleName: "pg"
};

describeDatabase("postgres", config('sworm'), database);
