# SWORM [![npm version](https://img.shields.io/npm/v/sworm.svg)](https://www.npmjs.com/package/sworm) [![npm](https://img.shields.io/npm/dm/sworm.svg)](https://www.npmjs.com/package/sworm) [![Build Status](https://travis-ci.org/featurist/sworm.svg?branch=master)](https://travis-ci.org/featurist/sworm)

A very lightweight **write only** Node.js ORM, with support for:

* Microsoft SQL Server (MSSQL)
* PostgreSQL
* MySQL
* Oracle DB
* Sqlite 3

## NPM

    npm install sworm

Then install a database driver, one of:

    npm install mssql
    npm install pg
    npm install mysql
    npm install oracledb
    npm install sqlite3

See [sworm](https://www.npmjs.org/package/sworm) in NPM.

## Write Only?

The features in this module are mostly for **writing graphs of related entities**. Querying, on the other hand, is done with raw SQL so you can do it fast. See the [query API](#queries) for details.

This ORM avoids some of the largest issues experienced in other ORMs:

* query performance is too opaque
* N+1 queries are frequently the default
* configuring eager and lazy loading is tricky
* one-to-many, many-to-one, many-to-many relationships are notoriously difficult to get right
* lifecycle management of sessions and identity maps is rarely pleasant
* check out the massive generated SQL statements!

Just write SQL, you know how.

## Example

```js
var person = db.model({table: 'people'});
var address = db.model({table: 'addresses'});

var bob = person({
  name: 'bob',
  address: address({
    address: 'Fremantle'
  })
});

bob.save()
```

Produces:

    -------- people ----------
    | id | name | address_id |
    --------------------------
    | 11 | bob  | 22         |
    --------------------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | Fremantle       |
    ------------------------

## Connection

Connect:

```js
var sworm = require('sworm');

var db = sworm.db({
  driver: 'pg',
  config: {
    user: 'user',
    password: 'password',
    host: 'localhost',
    database: 'databasename'
  }
});

var person = db.model({table: 'people'});

var bob = person({name: 'Bob'});

// sworm connects at the first database interaction
bob.save();
```

Or define models then connect:

```js
var sworm = require('sworm');

var db = sworm.db();

var person = db.model({table: 'people'});

db.connect({
  driver: 'mssql',
  config: {
    user: 'user',
    password: 'password',
    server: 'localhost',
    database: 'databasename'
  }
}).then(function () {

  ...

});
```

Connection options:

  * `driver`, one of `'mssql'`, `'mysql'`, `'pg'`, `'oracle'` or `'sqlite'`.
  * `config` configuration passed to the selected driver:

    * **mysql**

      See: [https://github.com/felixge/node-mysql#connection-options](https://github.com/felixge/node-mysql#connection-options)

      ```js
      {
        user: 'username',
        password: 'password',
        host: 'localhost',
        database: 'database name'
      }
      ```

    * **mssql**

      See: [https://github.com/patriksimek/node-mssql#configuration-1](https://github.com/patriksimek/node-mssql#configuration-1)

      ```js
      {
        user: 'username',
        password: 'password',
        server: 'localhost',
        database: 'databaseName'
      }
      ```

    * **pg**

      See also the `url` option below.

      See: [https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback)

      ```js
      {
        user: 'username',
        password: 'password',
        host: 'localhost',
        database: 'database name'
      }
      ```

    * **oracle**

      See: [getConnection()](https://github.com/oracle/node-oracledb/blob/master/doc/api.md#-332-getconnection)
      For `options` see [Oracledb Properties](https://github.com/oracle/node-oracledb/blob/master/doc/api.md#oracledbproperties)

      ```js
      {
        user: 'username',
        password: 'password',
        connectString: 'localhost/XE',

        options: {
          // options to set on `oracledb`
          maxRows: 1000
        }
      }
      ```

      The driver also supports oracledb connection pooling, pass the pool in the config:

      ```js
      {
        pool: pool // from oracledb.createPool(config, cb),

        options: {
          // options to set on `oracledb`
          maxRows: 1000
        }
      }
      ```

    * **sqlite**

      See: [https://github.com/mapbox/node-sqlite3/wiki/API#new-sqlite3databasefilename-mode-callback](https://github.com/mapbox/node-sqlite3/wiki/API#new-sqlite3databasefilename-mode-callback)

      ```js
      {
        filename: 'filename or :memory:'
      }
      ```

  * `url` a connection URL passed to the postgres driver. See the [`pg` url format](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback).
  * `setupSession` a function that is passed the `db` to setup the session before any queries are run.

    ```js
    setupSession: function (db) {
      return db.query("alter session set time_zone = 'UTC'");
    }
    ```

  * `log`: either `true` to log SQL statements with `console.log()`

    Can also be a function for custom logging:

    ```js
    function (sql, params) {
      // sql == 'select * from people where name = @name'
      // params == {name: 'bob'}
    }
    ```

    Defaults to `false`, no logging.

### Close

Close the connection after use:

```js
db.close()
```

### Debug

This module uses [debug](https://www.npmjs.com/package/debug), so you can easily see what's happening under the hood by setting a `DEBUG` environment variable.

```js
DEBUG=sworm node myapp.js
```

There are various schemes you can use:

* `sworm` all queries
* `sworm:results` all results
* `sworm:mssql` exact query passed to mssql
* `sworm:mysql` exact query passed to mysql
* `sworm:pg` exact query passed to postgres
* `sworm:oracle` exact query passed to oracle
* `sworm:sqlite` exact query passed to sqlite3

## Models

```js
var createEntity = db.model(options);
```

`options` can contain the following:

  * `table` (`undefined`) the name of the table to save entities to
  * `id` (`'id'`) the name of the identity column. This can be an array of id columns for compound keys, or `false` if there is no id column.
  * `foreignKeyFor` a function that returns a foreign key field name for a member (see [Relationships](#relationships)), defaults to:

    ```js
    function foreignKeyFor(fieldName) {
      return fieldName + '_id';
    }
    ```

`createEntity` is a function that can be used to create entities from the model.

### Model Methods

Any other properties or functions on the `options` object are accessible by entities.

```js
var address = db.model({
  table: 'addresses',

  function: addPerson(person) {
    this.people = this.people || [];
    person.address = this;
    this.people.push(person);
  }
});

var fremantle = address({address: 'Fremantle'});
fremantle.addPerson(person({name: 'bob'}));
```

## Entities

The entity constructor takes an object with fields to be saved to the database.

```js
var person = db.model({...});

var bob = person({
  name: 'bob'
}, [options]);
```

Where options can have:
  * `saved`: if `true` will `update` the entity (if modified) on the next `save()`, if `false` will `insert` the entity on the next `save()`. Default `false`.
  * `modified`: if `true` (and if `saved` is true), will `update` the entity on the next `save()` regardless if it has been modified.

### Save

```js
var promise = entity.save([options]);
```

Inserts or updates the entity into the table. If the entity already has a value for its identity column, then it is updated, if not, it is inserted.

Objects know when they've been modified since their last insert or update, so they won't update unless a field is modified. You can force an update by passing `{force: true}`.

`save()` returns a promise.

### Identity

```js
entity.identity()
```

Returns the ID of the entity, based on the identity column specified in the model.

### Changed

```js
entity.changed()
```

Returns true if the object has been modified since the last `save()`.

## Relationships

Entities can contain fields that are other entities. This way you can build up graphs of entities and save them all in one go.

### Many to One

When entity A contains a field that is entity B, then B will be saved first and B's ID will be set and saved with A.

The foreign key of the member will be saved on the field name `member_id`. So `address` will have a foreign key of `address_id`. See the `foreignKeyFor` option in [Models](#models).

```js
var person = db.model({table: 'people'});
var address = db.model({table: 'addresses'});

var bob = person({
  name: 'bob',
  address: address({
    address: "15 Rue d'Essert"
  })
});

bob.save().then(function () {
  assert(bob.address_id == address.id);
});
```

In SQL:

    -------- people ----------
    | id | name | address_id |
    --------------------------
    | 11 | bob  | 22         |
    --------------------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | 15 Rue d'Essert |
    ------------------------

### One to Many

When entity A contains a field that is an array that contains entities B and C. Then entity A will be saved first, followed by all entities B and C.

This allows entities B and C to refer to entity A, as they would in their tables.

```js
var person = db.model({ table: 'people' });
var address = db.model({ table: 'addresses' });

var bob = person({name: 'bob'});
var jane = person({name: 'jane'});

var essert = address({
  address: "15 Rue d'Essert",
  people: [bob, jane]
});

bob.address = essert;
jane.address = essert;

essert.save().then(function () {
  // all objects saved.
});
```

Alternatively, we can return the people in the address using a function. When the address is saved, the `people` function will be called with the owner address as `this`, then we can set the foreign key for the people. Following the `save()` the results of the function will be saved as an array on the object.

```js
var person = db.model({ table: 'people' });
var address = db.model({ table: 'addresses' });

var essert = address({
  address: "15 Rue d'Essert",
  people: function() {
    return [
      person({ name: 'bob', address: this }),
      person({ name: 'jane', address: this })
    ];
  }
});

essert.save().then(function () {
  // all objects saved.
  // essert.people == [{name: 'bob', ...}, {name: 'jane', ...}]
});
```

Notice that whether we use an array or a function, the field itself is never saved to the database, only the entities inside the array.

In SQL:

    -------- people ----------
    | id | name | address_id |
    --------------------------
    | 11 | bob  | 22         |
    | 12 | jane | 22         |
    --------------------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | 15 Rue d'Essert |
    ------------------------

### Many to Many

Many-to-many is just a combination of one-to-many and many-to-one:

```js
var person = db.model({ table: 'people' });
var personAddress = db.model({ table: 'people_addresses', id: ['address_id', 'person_id'] });
var address = db.model({ table: 'addresses' });

function personLivesInAddress(person, address) {
  pa = personAddress({person: person, address: address});

  person.addresses = person.addresses || [];
  person.addresses.push(pa);

  address.people = address.people || [];
  address.people.push(pa);
}

var bob = person({name: 'bob'});
var jane = person({name: 'jane'});

var fremantle = address({
  address: "Fremantle"
});
var essert = address({
  address: "15 Rue d'Essert"
});

personLivesInAddress(bob, fremantle);
personLivesInAddress(jane, fremantle);
personLivesInAddress(jane, essert);

Promise.all([essert.save(), fremantle.save()]);
```

In SQL:

    -- people ---
    | id | name |
    -------------
    | 11 | bob  |
    | 12 | jane |
    -------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | 15 Rue d'Essert |
    | 23 | Fremantle       |
    ------------------------

    ---- people_addresses ----
    | address_id | person_id |
    --------------------------
    | 22         | 12        |
    | 23         | 12        |
    | 23         | 11        |
    --------------------------

# Queries

```js
db.query(sql, [parameters]).then(function (records) {
});
```

Where:

  * `sql` is the SQL query, can be a query (i.e. select), or a command (update, insert, stored proc)
  * `parameters`. If `sql` contains parameters in the form of `@paramName` the corresponding property on the `parameters` object will be substituted into the SQL, doing any escaping necessary.

For select queries, returns an array of objects, containing the fields of each record.

```js
db.query('select * from people where name = @name', {name: 'Bob'}).then(function (results) {
  console.log(results);

  /*
     [
       {id: 2, name: 'Bob'}
     ]
   */
}); 
```

## Stored Procedure Example

```js
db.query('myProcName @param1, @param2', {param1: 'a', param2: 'b'});
```

## Model Queries

```js
model.query(sql, [parameters]).then(function (entities) {
});
```

Same as `db.query()` but records returned are turned into entities of the model that can subsequently be modified and saved.

```js
person.query('select * from people where id = @id', {id: 1}, function (people) {
  var bob = people[0];
  bob.name = 'Jack';
  return bob.save();
});
```

## Options

You can pass options to the database driver when executing a query

```js
db.query(sql, parameters, [options])
```

* SQLite3
  * `multiline` or `exec` runs the `exec()` method on the connection which executes multiple lines, see [exec](https://github.com/mapbox/node-sqlite3/wiki/API#databaseexecsql-callback). Note that this method ignores any query `parameters` passed in.

# Development

## Tests

The only thing slightly awkward about this project are the test environments for each database. I've tried to make this as easy as possible however:

* sqlite3 works out of the box on most if not all platforms
* mysql, postgres and oracle instances can be found in the `docker-compose.yml` file. Install docker, make it run somehow, then run `docker-compose up -d`. This will download and start each of the databases necessary to run the tests. The tests look for the `$DOCKER_HOST` environment variable to see where the docker host is, if it's in a VM or somewhere else, otherwise the databases are expected to be on localhost, running on their default ports.
* mssql is less friendly, and all I ask is that it's running on a machine called `windows` (hack your `/etc/hosts` file if necessary), with a fresh database called `sworm`, with user `user` and password `password`.

Each database can be tested individually by running `mocha test/{mssql,mysql,postgres,oracle,sqlite}Spec.js`. All of them with simply `npm test`.

Nevertheless, this project is almost entirely covered with tests and I expect any pull request to have tests that demonstrate any new feature or bugfix.
