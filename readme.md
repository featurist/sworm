# MSSQL ORM

A very lightweight **write only** Node.js ORM for Microsoft SQL Server.

## Write Only?

The features in this module are mostly for **writing graphs of related entities**. Querying, on the other hand, is done with raw SQL so you can do it fast. See the [query API](#queries) for details.

Why ORMs shouldn't support querying:

* query performance is too easy to get wrong, e.g. N+1
* configuring eager and lazy loading
* one-to-many, many-to-one, many-to-many relationships are notoriously difficult to get right
* managing sessions and identity maps
* debugging massive SQL queries

Just write SQL, you know how.

## Example

    var mssql = require('mssql-orm');

    mssql.db({
      user: 'user',
      password: 'password',
      server: 'localhost',
      database: 'databasename'
    }).then(function (db) {
      var person = db.model({table: 'people'});

      var bob = person({
        name: 'bob'
      });

      return bob.save().then(function () {
        return db.query('select * from people').then(function (people) {
          console.log('people', people);
        });
      });
    });

## Connection

Connect:

    var mssql = require('mssql-orm');

    mssql.db({
      user: 'user',
      password: 'password',
      server: 'localhost',
      database: 'databasename'
    }).then(function (db) {

      var person = db.model({table: 'people'});
      ...

    });

Or define models then connect:

    var mssql = require('mssql-orm');

    var db = mssql.db();

    var person = db.model({table: 'people'});

    db.connect({
      user: 'user',
      password: 'password',
      server: 'localhost',
      database: 'databasename'
    }).then(function () {

      ...

    });

For connection options, see [node-mssql Configuration](https://github.com/patriksimek/node-mssql#configuration-1).

## Models

    var createEntity = db.model(options);

`options` can contain the following:

  * `table` (`undefined`) the name of the table to save entities to
  * `id` (`'id'`) the name of the identity column. This can be an array of id columns for compound keys.
  * `log` (`false`) whether to log SQL statements, for debugging
  * `foreignKeyFor` a function that returns a foreign key field name for a member, defaults to:

        function foreignKeyFor(fieldName) {
          return fieldName + 'Id';
        }

`createEntity` is a function that can be used to create entities from the model.

### Model Methods

Any other properties or functions on the `options` object are accessible by entities.

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

## Entities

The entity constructor takes an object with fields to be saved to the database.

    var person = db.model({...});

    var bob = person({
      name: 'bob'
    });

### Save

    var promise = entity.save([options]);

Inserts or updates the entity into the table. If the entity already has a value for its identity column, then it is updated, if not, it is inserted.

Objects know when they've been modified since their last insert or update, so they won't update unless a field is modified. You can force an update by passing `{force: true}`.

`save()` returns a promise.

### Identity

    entity.identity()

Returns the ID of the entity, based on the identity column specified in the model.

### Changed

    entity.changed()

Returns true if the object has been modified since the last `save()`.

## Relationships

Entities can contain fields that are other entities. This way you can build up graphs of entities and save them all in one go.

### Many to One

When entity A contains a field that is entity B, then B will be saved first and B's ID will be set and saved with A.

The foreign key of the member will be saved on the field name `memberId`. So `address` will have a foreign key of `addressId`.

    var person = db.model({table: 'people'});
    var address = db.model({table: 'addresses'});

    var bob = person({
      name: 'bob',
      address: address({
        address: "15 Rue d'Essert"
      })
    });

    bob.save().then(function () {
      assert(bob.addressId == address.id);
    });

In SQL:

    -------- people ---------
    | id | name | addressId |
    -------------------------
    | 11 | bob  | 22        |
    -------------------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | 15 Rue d'Essert |
    ------------------------

### One to Many

When entity A contains a field that is an array that contains entities B and C. Then entity A will be saved first, followed by all entities B and C.

This allows entities B and C to refer to entity A, as they would in their tables.

    var person = db.model({ table: 'people' });
    var address = db.model({ table: 'addresses' });

    var bob = person({name: 'bob'});
    var jane = person({name: 'jane'});

    var essert = address({
      address: "15 Rue d'Essert"
      people: [bob, jane]
    });

    essert.save().then(function () {
      // all objects saved.
    });

In SQL:

    -------- people ---------
    | id | name | addressId |
    -------------------------
    | 11 | bob  | 22        |
    | 12 | jane | 22        |
    -------------------------

    ------- addresses ------
    | id | address         |
    ------------------------
    | 22 | 15 Rue d'Essert |
    ------------------------

### Many to Many

Many-to-many is just a combination of one-to-many and many-to-one:

    var person = db.model({ table: 'people' });
    var personAddress = db.model({ table: 'people_addresses', id: ['addressId', 'personId'] });
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

    --- people_addresses ---
    | addressId | personId |
    ------------------------
    | 22        | 12       |
    | 23        | 12       |
    | 23        | 11       |
    ------------------------

# Queries

    var records = db.query(sql, [parameters]);

Where:

  * `sql` is the SQL query, can be a query (i.e. select), or a command (update, insert, stored proc)
  * `parameters`. If `sql` contains parameters in the form of `@paramName` the corresponding property on the `parameters` object will be substituted into the SQL, doing any escaping necessary.

For select queries, returns an array of objects, containing the fields of each record.

## Model Queries

    var entities = model.query(sql, [parameters]);

Same as `db.query()` but records returned are turned into entities of the model that can subsequently be modified and saved.
