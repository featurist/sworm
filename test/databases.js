module.exports = {
  mssql: {
    createTables: function(db, tables) {
      function createTable(name, sql) {
        tables.push(name);
        return db.query("if object_id('dbo." + name + "', 'U') is not null drop table [dbo].[" + name + "]").then(function() {
          return db.query(sql);
        });
      }

      return createTable("people",
        `CREATE TABLE [dbo].[people](
           [id] [int] IDENTITY(1,1) NOT NULL,
           [name] [nvarchar](50) NOT NULL,
           [address_id] [int] NULL
         )`
      ).then(function() {
        return createTable("people_addresses",
          `CREATE TABLE [dbo].[people_addresses](
             [address_id] [int] NOT NULL,
             [person_id] [int] NOT NULL,
             [rating] [int] NULL
           )`
        );
      }).then(function () {
        return createTable("addresses",
          `CREATE TABLE [dbo].[addresses](
             [id] [int] IDENTITY(1,1) NOT NULL,
             [address] [nvarchar](50) NOT NULL
           )`
        );
      }).then(function () {
        return createTable("people_weird_id",
          `CREATE TABLE [dbo].[people_weird_id](
             [weird_id] [int] IDENTITY(1,1) NOT NULL,
             [name] [nvarchar](50) NULL,
             [address_weird_id] [int] NULL
           )`
        );
      }).then(function () {
        return createTable("people_explicit_id",
          `CREATE TABLE [dbo].[people_explicit_id](
             [id] [int] NOT NULL,
             [name] [nvarchar](50) NOT NULL
           )`
        );
      }).then(function () {
        return createTable("other_people",
          `CREATE TABLE [dbo].[other_people](
             [id] [int] IDENTITY(1,1) NOT NULL,
             [name] [nvarchar](50) NOT NULL
           )`
        );
      }).then(function () {
        return db.query(
          `CREATE TRIGGER people_trigger
             ON people
             FOR INSERT AS 
           BEGIN
             INSERT other_people VALUES ('person')
           END;`
        );
      });
    },

    "true": true,
    "false": false,

    clean: function(records) {
      return records;
    },

    driverModuleName: "mssql"
  },

  mysql: {
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
      ).then(function() {
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

    "true": 1,
    "false": 0,

    clean: function(records) {
      return JSON.parse(JSON.stringify(records));
    },

    driverModuleName: "mysql"
  },

  postgres: {
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
  },

  oracle: {
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
  },

  sqlite: {
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
  }
};
