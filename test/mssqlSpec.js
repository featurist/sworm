var describeDatabase = require('./describeDatabase');

var database = {
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

if (!process.env.TRAVIS) {
  describeDatabase("mssql", {
    driver: "mssql",
    config: { user: "user", password: "password", server: "windows", database: "sworm" }
  }, database);
}
