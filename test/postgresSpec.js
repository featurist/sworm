var dockerHostname = require('./dockerHostname');
var describeDatabase = require('./describeDatabase');
var sworm = require('..');
var _ = require('underscore');
var expect = require('chai').expect;
var urlUtils = require('url');
var pg = require('pg');

function addExtras(url, extras) {
  var parsedUrl = urlUtils.parse(url, true);
  _.extend(parsedUrl.query, extras);
  return urlUtils.format(parsedUrl);
}

function urlConfig(name, extras) {
  name = name || '';
  var url = process.env.TRAVIS? `postgres://postgres@localhost/${name}`: `postgres://postgres:password@${dockerHostname}/${name}`;

  if (extras) {
    url = addExtras(url, extras);
  }

  return {
    driver: "pg",
    url: url
  };
}

function config(name, extras) {
  name = name || '';
  var config = process.env.TRAVIS
    ? {
      host: 'localhost',
      user: 'postgres',
      database: name
    }
    : {
      host: dockerHostname,
      user: 'postgres',
      password: 'password',
      database: name
    };

  return {
    driver: "pg",
    config: _.extend(config, extras)
  };
}

var database = {
  createDatabase: function() {
    var db = sworm.db(urlConfig('postgres'));
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

describeDatabase("postgres", urlConfig('sworm'), database, function () {
  var db;

  afterEach(function () {
    return db.close();
  });

  describe('connection pooling', function () {
    it("doesn't pool connections normally", function () {
      var poolsBefore = Object.keys(pg.pools.all).length;
      db = sworm.db(urlConfig('sworm'));
      return db.query('select * from people').then((rows) => {
        expect(rows).to.eql([]);
        expect(Object.keys(pg.pools.all).length).to.equal(poolsBefore);
      });
    });

    it("pools connections when pool: true", function () {
      var poolsBefore = Object.keys(pg.pools.all).length;
      db = sworm.db(config('sworm', {pool: true}));
      return db.query('select * from people').then((rows) => {
        expect(rows).to.eql([]);
        expect(Object.keys(pg.pools.all).length).to.equal(poolsBefore + 1);
      });
    });

    it("pools connections when &pool=true", function () {
      var poolsBefore = Object.keys(pg.pools.all).length;
      db = sworm.db(urlConfig('sworm', {pool: true}));
      return db.query('select * from people').then((rows) => {
        expect(rows).to.eql([]);
        expect(Object.keys(pg.pools.all).length).to.equal(poolsBefore + 1);
      });
    });
  });

  it('can connect using config object', function () {
    db = sworm.db(config('sworm'));
    return db.query('select * from people').then((rows) => {
      expect(rows).to.eql([]);
    });
  });
});
