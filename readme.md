# SWORM

A very lightweight **write only** Node.js ORM, with support for:

* Microsoft SQL Server (MSSQL)
* PostgreSQL
* MySQL

## NPM

    npm install sworm

Then install a database driver, one of:

    npm install mssql
    npm install pg
    npm install mysql

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

```JavaScript
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

```JavaScript
var sworm = require('sworm');

sworm.db({
  driver: 'mssql',
  config: {
    user: 'user',
    password: 'password',
    server: 'localhost',
    database: 'databasename'
  }
}).then(function (db) {

  var person = db.model({table: 'people'});
  ...

});
```

Or define models then connect:

```JavaScript
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

  * `driver`, one of `'mssql'`, `'mysql'` or `'pg'`.
  * `config` connection options passed to the database driver of choice. See configuration options for: [SQL Server](https://github.com/patriksimek/node-mssql#configuration-1), [MySQL](https://github.com/felixge/node-mysql#connection-options), [PostgreSQL](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback).
  * `url` a connection URL passed to the postgres driver. See the [`pg` url format](https://github.com/brianc/node-postgres/wiki/pg#connectstring-connectionstring-function-callback).
  * `log`: either `true` to log SQL statements with `console.log()`

    Can also be a function for custom logging:

    ```JavaScript
    function (sql, params) {
      // sql == 'select * from people where name = @name'
      // params == {name: 'bob'}
    }
    ```

    Defaults to `false`, no logging.

### Close

Close the connection after use:

```JavaScript
db.close()
```

## Models

```JavaScript
var createEntity = db.model(options);
```

`options` can contain the following:

  * `table` (`undefined`) the name of the table to save entities to
  * `id` (`'id'`) the name of the identity column. This can be an array of id columns for compound keys.
  * `foreignKeyFor` a function that returns a foreign key field name for a member (see [Relationships](#relationships)), defaults to:

    ```JavaScript
    function foreignKeyFor(fieldName) {
      return fieldName + '_id';
    }
    ```

`createEntity` is a function that can be used to create entities from the model.

### Model Methods

Any other properties or functions on the `options` object are accessible by entities.

```JavaScript
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

```JavaScript
var person = db.model({...});

var bob = person({
  name: 'bob'
}, [options]);
```

Where options can have:
  * `saved`: if `true` will `update` the entity (if modified) on the next `save()`, if `false` will `insert` the entity on the next `save()`. Default `false`.
  * `modified`: if `true` (and if `saved` is true), will `update` the entity on the next `save()` regardless if it has been modified.

### Save

```JavaScript
var promise = entity.save([options]);
```

Inserts or updates the entity into the table. If the entity already has a value for its identity column, then it is updated, if not, it is inserted.

Objects know when they've been modified since their last insert or update, so they won't update unless a field is modified. You can force an update by passing `{force: true}`.

`save()` returns a promise.

### Identity

```JavaScript
entity.identity()
```

Returns the ID of the entity, based on the identity column specified in the model.

### Changed

```JavaScript
entity.changed()
```

Returns true if the object has been modified since the last `save()`.

## Relationships

Entities can contain fields that are other entities. This way you can build up graphs of entities and save them all in one go.

### Many to One

When entity A contains a field that is entity B, then B will be saved first and B's ID will be set and saved with A.

The foreign key of the member will be saved on the field name `member_id`. So `address` will have a foreign key of `address_id`. See the `foreignKeyFor` option in [Models](#models).

```JavaScript
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

```JavaScript
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

Alternatively, we can return the people in the address using a function. When the address is saved, the `people` function will be called with the owner address as `this`, then we can set the foreign key for the people.

```JavaScript
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

```JavaScript
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

```JavaScript
var records = db.query(sql, [parameters]);
```

Where:

  * `sql` is the SQL query, can be a query (i.e. select), or a command (update, insert, stored proc)
  * `parameters`. If `sql` contains parameters in the form of `@paramName` the corresponding property on the `parameters` object will be substituted into the SQL, doing any escaping necessary.

For select queries, returns an array of objects, containing the fields of each record.

## Model Queries

```JavaScript
var entities = model.query(sql, [parameters]);
```

Same as `db.query()` but records returned are turned into entities of the model that can subsequently be modified and saved.
