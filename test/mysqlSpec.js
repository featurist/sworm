var describeDatabase = require('./describeDatabase');
var sworm = require('..');

function config(name) {
  return {
    driver: "mysql",
    config: process.env.TRAVIS
      ? { user: "travis", password: "", database: name }
      : { host: 'localhost', user: "root", password: "password", database: name }
  };
}

var database = {
  createDatabase: function() {
    var db = sworm.db(config());
    function close () {
      return db.close()
    }
    return db.query('create database if not exists sworm').then(close, close)
  },

  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query(sql);
    }

    return createTable("people",
      'create table if not exists people (id serial NOT NULL, name varchar(50) NOT NULL, address_id int NULL, photo varbinary(10) null)'
    ).then(function() {
      return createTable("pets",
        'create table if not exists pets (id serial NOT NULL, name varchar(50) NOT NULL, owner_id int NULL)'
      );
    }).then(function() {
      return createTable("people_addresses",
        'create table if not exists people_addresses(address_id int NOT NULL, person_id int NOT NULL, rating int NULL)'
      );
    }).then(function() {
      return createTable("addresses",
        'create table if not exists addresses(id serial NOT NULL, address varchar(50) NOT NULL)'
      );
    }).then(function() {
      return createTable("people_weird_id",
        'create table if not exists people_weird_id(weird_id serial NOT NULL, name varchar(50) NULL, address_weird_id int NULL)'
      );
    }).then(function() {
      return createTable("people_explicit_id",
        'create table if not exists people_explicit_id(id int NOT NULL, name varchar(50) NOT NULL)'
      );
    });
  },

  "true": 1,
  "false": 0,

  clean: function(records) {
    return JSON.parse(JSON.stringify(records));
  },

  driverModuleName: "mysql"
};

describeDatabase("mysql", config('sworm'), database);
