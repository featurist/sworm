var describeDatabase = require('./describeDatabase')
var sworm = require('..')
var expect = require('chai').expect

var database = {
  createDatabase: function() {
    var db = sworm.db(config());
    function close () {
      return db.close()
    }
    return db.query(
      "If(db_id(N'sworm') IS NULL)\n" +
      "begin\n" +
      "create database sworm\n" +
      "end"
    ).then(close, close);
  },

  createTables: function(db, tables) {
    function createTable(name, sql) {
      tables.push(name);
      return db.query("if object_id('dbo." + name + "', 'U') is not null drop table [dbo].[" + name + "]").then(function() {
        return db.query(sql);
      });
    }

    return createTable("people",
      'CREATE TABLE [dbo].[people]([id] [int] IDENTITY(1,1) NOT NULL, [name] [nvarchar](50) NOT NULL, [address_id] [int] NULL, photo varbinary(10) null)'
    ).then(function() {
      return createTable("pets",
        'CREATE TABLE [dbo].[pets]([id] [int] IDENTITY(1,1) NOT NULL, [name] [nvarchar](50) NOT NULL, [owner_id] [int] NULL)'
      );
    }).then(function() {
      return createTable("people_addresses",
        'CREATE TABLE [dbo].[people_addresses]([address_id] [int] NOT NULL, [person_id] [int] NOT NULL, [rating] [int] NULL)'
      );
    }).then(function () {
      return createTable("addresses",
        'CREATE TABLE [dbo].[addresses]([id] [int] IDENTITY(1,1) NOT NULL, [address] [nvarchar](50) NOT NULL)'
      );
    }).then(function () {
      return createTable("people_weird_id",
        'CREATE TABLE [dbo].[people_weird_id]([weird_id] [int] IDENTITY(1,1) NOT NULL, [name] [nvarchar](50) NULL, [address_weird_id] [int] NULL)'
      );
    }).then(function () {
      return createTable("people_explicit_id",
        'CREATE TABLE [dbo].[people_explicit_id]([id] [int] NOT NULL, [name] [nvarchar](50) NOT NULL)'
      );
    }).then(function () {
      return createTable("other_people",
        'CREATE TABLE [dbo].[other_people]([id] [int] IDENTITY(1,1) NOT NULL, [name] [nvarchar](50) NOT NULL)'
      );
    }).then(function () {
      return createTable("people_uuid",
        'CREATE TABLE [dbo].[people_uuid](id UNIQUEIDENTIFIER DEFAULT NEWID() PRIMARY KEY, [name] [nvarchar](50) NULL)'
      );
    }).then(function () {
      return db.query(
        "CREATE TRIGGER people_trigger " +
        "  ON people " +
        "  FOR INSERT AS " +
        "BEGIN " +
        "  INSERT other_people VALUES ('person') " +
        "END;"
      );
    });
  },

  "true": true,
  "false": false,

  clean: function(records) {
    return records;
  },

  driverModuleName: "mssql"
};

function config (database) {
  return {
    driver: "mssql",
    config: { user: "sa", password: "PassWord123", server: "localhost", database: database }
  }
}

var swormConfig = config('sworm')

if (!process.env.TRAVIS) {
  describeDatabase("mssql", swormConfig, database, function () {
    describe('connection', function () {
      var db

      afterEach(function () {
        return db.close()
      })

      it('can connect with URL', function () {
        var c = swormConfig.config
        var url = 'mssql://' + c.user + ':' + c.password + '@' + c.server + '/' + c.database
        db = sworm.db(url);
        return db.query('select * from people').then(function (rows) {
          expect(rows).to.eql([]);
        });
      })
    })

    describe('generatedId', function () {
      var db

      afterEach(function () {
        return db.close()
      })

      it('can insert row with uniqueidentifier and get id correctly', function () {
        db = sworm.db(swormConfig)
        var person = db.model({table: 'people_uuid', generatedId: 'output'});

        var bob = person({name: 'bob'})
        return bob.save().then(function () {
          return person.query('select * from people_uuid where id = @id', {id: bob.identity()})
        }).then(function (savedBob) {
          expect(savedBob[0].id).to.eql(bob.id)
        })
      })

      it('can insert empty row with uniqueidentifier and get id correctly', function () {
        db = sworm.db(swormConfig)
        var person = db.model({table: 'people_uuid', generatedId: 'output'});

        var bob = person({})
        return bob.save().then(function () {
          return person.query('select * from people_uuid where id = @id', {id: bob.identity()})
        }).then(function (savedBob) {
          expect(savedBob[0].id).to.eql(bob.id)
        })
      })
    })
  });
}
