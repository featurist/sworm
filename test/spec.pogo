chai = require 'chai'
expect = chai.expect
chaiAsPromised = require 'chai-as-promised'
chai.use(chaiAsPromised)
util = require 'util'
_ = require 'underscore'
fs = require 'fs'

sworm = require '..'

describeDatabase(name, config, helpers) =
  describe (name)
    describe 'missing modules'
      moduleName = __dirname + "/../node_modules/#(helpers.driverModuleName)"
      beforeEach
        fs.rename(moduleName, moduleName + '.missing', ^)!

      afterEach
        fs.rename(moduleName + '.missing', moduleName, ^)!

      it 'throws an exception if the driver module is not present'
        try
          sworm.db(config)!
          throw (new (Error 'expected module not found error'))
        catch(e)
          expect(e.message).to.contain "npm install #(helpers.driverModuleName)"

    context 'when connected'
      db = nil
      tables = []
      person = nil
      address = nil
      personAddress = nil
      statements = nil

      before
        schema = sworm.db(config)!

        helpers.createTables(schema, tables)!

      clearTables() =
        for each @(table) in (tables)
          db.query "delete from #(table)"!

      beforeEach
        db := sworm.db(config)!
        statements := []

        db.log(sql, params) =
          // console.log(sql, JSON.stringify(params, nil, 2))
          match = r/^(insert|update|delete|select)/.exec(sql)
          statements.push(match.1)

        clearTables()!

        statements := []

        person := db.model (table = 'people')
        address := db.model {
          table = 'addresses'

          addPerson(person) =
            self.people = self.people @or []
            person.address = self
            self.people.push(person)
        }
        personAddress := db.model(table = 'people_addresses', id = ['address_id', 'person_id'])

      afterEach
        db.close()

      it 'can insert'
        p = person {
          name = 'bob'
        }

        p.save()!
        expect(p.id).to.exist

        people = db.query 'select * from people'!
        expect(helpers.clean(people)).to.eql [
          {
            id = p.id
            name = 'bob'
            address_id = null
          }
        ]

      describe 'strings'
        it 'can insert with escapes'
          p = person {
            name = "bob's name is 'matilda'"
          }

          p.save()!
          expect(p.id).to.exist

          people = db.query 'select * from people'!
          expect(helpers.clean(people)).to.eql [
            {
              id = p.id
              name = "bob's name is 'matilda'"
              address_id = null
            }
          ]

      describe 'only saving when modified'
        bob = nil

        beforeEach
          bob := person {
            name = 'bob'
          }

        it "doesn't save unmodified entity again after insert"
          bob.save()!
          expect(statements).to.eql ['insert']
          bob.save()!
          expect(statements).to.eql ['insert']

        it "doesn't save unmodified entity again after update"
          bob.save()!
          expect(statements).to.eql ['insert']

          bob.name = 'jane'
          bob.save()!
          expect(statements).to.eql ['insert', 'update']

          bob.save()!
          expect(statements).to.eql ['insert', 'update']

        it "can force an update"
          bob.save()!
          expect(statements).to.eql ['insert']

          bob.name = 'jane'
          bob.save()!
          expect(statements).to.eql ['insert', 'update']

          bob.save(force = true)!
          expect(statements).to.eql ['insert', 'update', 'update']

        it "doesn't update after entity taken from model query"
          bob.save()!
          expect(statements).to.eql ['insert']

          savedBob = person.query 'select * from people'!.0
          savedBob.save()!
          expect(statements).to.eql ['insert', 'select']

          savedBob.name = 'jane'
          savedBob.save()!
          expect(statements).to.eql ['insert', 'select', 'update']

      it 'can save and update'
        p = person {
          name = 'bob'
        }

        p.save()!

        p.name = 'jane'
        p.save()!

        people = db.query 'select * from people'!
        expect(helpers.clean(people)).to.eql [
          {
            id = p.id
            name = 'jane'
            address_id = null
          }
        ]

      describe 'custom id columns'
        it 'can insert with weird_id'
          personWeirdId = db.model (table = 'people_weird_id', id = 'weird_id')

          p = personWeirdId {
            name = 'bob'
          }

          p.save()!
          expect(p.weird_id).to.exist

          people = db.query 'select * from people_weird_id'!
          expect(helpers.clean(people)).to.eql [
            {
              weird_id = p.weird_id
              name = 'bob'
              address_weird_id = null
            }
          ]

      describe 'explicitly setting id'
        it 'can insert with id'
          personExplicitId = db.model (table = 'people_explicit_id')

          p = personExplicitId {
            id = 1
            name = 'bob'
          }

          p.save()!

          people = db.query 'select * from people_explicit_id'!
          expect(helpers.clean(people)).to.eql [
            {
              id = 1
              name = 'bob'
            }
          ]

      describe 'saved and modified'
        it 'inserts when created for the first time'
          person {
            name = 'bob'
          }.save()!

          expect(statements).to.eql ['insert']

        it "doesn't save created with saved = true"
          bob = person (saved = true) {
            name = 'bob'
          }
          bob.save()!

          expect(statements).to.eql []

          bob.name = 'jane'
          bob.id = 1
          bob.save()!

          expect(statements).to.eql ['update']

        it 'updates when created with saved = true and force = true'
          person (saved = true) {
            id = 1
            name = 'bob'
          }.save(force = true)!

          expect(statements).to.eql ['update']

        it 'updates when created with saved = true and modified = true'
          person (saved = true, modified = true) {
            id = 1
            name = 'bob'
          }.save()!

          expect(statements).to.eql ['update']

        it 'throws if no id on update'
          expect(person (saved = true, modified = true) {
            name = 'bob'
          }.save()).to.eventually.be.rejectedWith ('entity must have id to be updated')!

      describe 'compound keys'
        it 'can save an entity with compound keys'
          pa = personAddress {
            person_id = 12
            address_id = 34
          }

          pa.save()!

          peopleAddresses = db.query 'select * from people_addresses'!
          expect(helpers.clean(peopleAddresses)).to.eql [
            {
              person_id = 12
              address_id = 34
              rating = null
            }
          ]

        it 'can update an entity with compound keys'
          pa = personAddress {
            person_id = 12
            address_id = 34
            rating = 1
          }

          pa.save()!

          expect(helpers.clean (db.query 'select * from people_addresses'!)).to.eql [
            {
              person_id = 12
              address_id = 34
              rating = 1
            }
          ]

          pa.rating = 10
          pa.save()!

          expect(helpers.clean (db.query 'select * from people_addresses'!)).to.eql [
            {
              person_id = 12
              address_id = 34
              rating = 10
            }
          ]

        describe 'saving only when modified'
          pa = nil

          beforeEach
            pa := personAddress {
              person_id = 12
              address_id = 34
            }

          it 'can save an entity with compound keys'
            pa.save()!
            expect(statements).to.eql ['insert']
            pa.save()!
            expect(statements).to.eql ['insert']

          it 'can update an entity with compound keys'
            pa.save()!
            expect(statements).to.eql ['insert']

            pa.rating = 10
            pa.save()!
            expect(statements).to.eql ['insert', 'update']

            pa.save()!
            expect(statements).to.eql ['insert', 'update']

      describe 'queries'
        describe 'parameterised queries'
          it 'can pass parameters to a query'
            person {
              name = 'bob'
            }.save()!

            person {
              name = 'jane'
            }.save()!

            records = db.query! 'select name from people where name = @name' { name 'jane' }
            expect(helpers.clean (records)).to.eql [
              { name = 'jane' }
            ]

        describe 'model queries'
          it 'can pass parameters to a query'
            person {
              name = 'bob'
            }.save()!

            person {
              name = 'jane'
            }.save()!

            records = person.query! 'select name from people where name = @name' { name 'jane' }
            expect [p <- records, {name = p.name}].to.eql [
              { name = 'jane' }
            ]

          it 'entites are returned from query and can be modified and saved'
            bob = person {
              name = 'bob'
            }
            bob.save()!

            jane = person {
              name = 'jane'
            }
            jane.save()!

            people = person.query 'select * from people'!

            expect([p <- people, p.name]).to.eql [
              'bob'
              'jane'
            ]

            people.0.save()!
            people.1.name = 'jenifer'
            people.1.save()!

            expect([p <- db.query 'select * from people'!, p.name]).to.eql [
              'bob'
              'jenifer'
            ]

      describe 'foreign keys'
        it 'can save a many to one relationship'
          bob = person {
            name = 'bob'
            address = address {
              address = "15, Rue d'Essert"
            }
          }
          bob.save()!

          expect(statements).to.eql [
            'insert'
            'insert'
          ]

          addresses = db.query 'select * from addresses'!

          expect(helpers.clean (addresses)).to.eql [
            {id = bob.address_id, address  "15, Rue d'Essert"}
          ]

        describe 'custom foreign keys'
          it 'can save a many to one relationship with a custom foreign key'
            personWeirdId = db.model (table = 'people_weird_id', id = 'weird_id', foreignKeyFor (x) = x + '_weird_id')

            bob = personWeirdId {
              name = 'bob'
              address = address {
                address = "15, Rue d'Essert"
              }
            }
            bob.save()!

            addresses = db.query 'select * from addresses'!

            expect(helpers.clean (addresses)).to.eql [
              {id = bob.address_weird_id, address  "15, Rue d'Essert"}
            ]

        it 'can save a one to many relationship'
          rueDEssert = address {
            address = "15, Rue d'Essert"
          }

          bob = person {
            name = 'bob'
          }
          rueDEssert.addPerson(bob)

          jane = person {
            name = 'jane'
          }
          rueDEssert.addPerson(jane)

          bob.save()!

          expect(statements).to.eql [
            'insert'
            'insert'
            'insert'
          ]

          addresses = db.query 'select * from addresses'!
          expect(helpers.clean (addresses)).to.eql [
            {id = bob.address_id, address  "15, Rue d'Essert"}
          ]

          expect([p <- db.query 'select * from people order by name'!, {name = p.name, address_id = p.address_id}]).to.eql [
            { name = 'bob', address_id = rueDEssert.id }
            { name = 'jane', address_id = rueDEssert.id }
          ]

        it 'can save a one to many relationship with function'
          bob = nil
          jane = nil

          rueDEssert = address {
            address = "15, Rue d'Essert"

            people () = [
              bob := person {
                name = 'bob'
                address = self
              }
              jane := person {
                name = 'jane'
                address = self
              }
            ]
          }

          rueDEssert.save()!

          expect(statements).to.eql [
            'insert'
            'insert'
            'insert'
          ]

          addresses = db.query 'select * from addresses'!
          expect(helpers.clean (addresses)).to.eql [
            {id = bob.address_id, address  "15, Rue d'Essert"}
          ]

          expect([p <- db.query 'select * from people order by name'!, {name = p.name, address_id = p.address_id}]).to.eql [
            { name = 'bob', address_id = rueDEssert.id }
            { name = 'jane', address_id = rueDEssert.id }
          ]

        it 'can have a many to many relationship'
          (person) livesIn (address) =
            pa = personAddress {person = person, address = address}

            person.addresses = person.addresses @or []
            person.addresses.push(pa)

            address.people = address.people @or []
            address.people.push(pa)

          bob = person {name = 'bob'}
          jane = person {name = 'jane'}

          fremantle = address {
            address = "Fremantle"
          }
          essert = address {
            address = "15 Rue d'Essert"
          }

          bob @livesIn fremantle
          jane @livesIn fremantle
          jane @livesIn essert

          essert.save()!
          fremantle.save()!

          expect(statements).to.eql [
            'insert'
            'insert'
            'insert'
            'insert'
            'insert'
            'insert'
            'insert'
          ]

          expect [p <- db.query 'select * from people'!, { id = p.id, name = p.name }].to.eql [
            { id = jane.id, name = 'jane' }
            { id = bob.id, name = 'bob' }
          ]

          expect(helpers.clean (db.query 'select * from people_addresses order by address_id, person_id'!)).to.eql [
            { address_id = essert.id, person_id = jane.id, rating = null }
            { address_id = fremantle.id, person_id = jane.id, rating = null }
            { address_id = fremantle.id, person_id = bob.id, rating = null }
          ]

          expect(helpers.clean (db.query 'select * from addresses'!)).to.eql [
            { id = essert.id, address = "15 Rue d'Essert" }
            { id = fremantle.id, address = "Fremantle" }
          ]

    describe 'connection'
      it 'can define models before connecting to database'
        schema = sworm.db()
        personModel = schema.model (table = 'people')

        bob = personModel {
          name = 'bob'
        }

        schema.connect (config)!

        bob.save()!
        expect([p <- schema.query 'select * from people'!, p.name]).to.eql ['bob']

describeDatabase 'mssql' {
  driver = 'mssql'
  config = {
    user = 'user'
    password = 'password'
    server = 'windows'
    database ='mssqlOrm'
  }
} {
  createTables(db, tables) =
    createTable (name, sql) =
      tables.push(name)

      db.query! "if object_id('dbo.#(name)', 'U') is not null drop table [dbo].[#(name)]"
      db.query! (sql)

    createTable! 'people' "CREATE TABLE [dbo].[people](
                                      [id] [int] IDENTITY(1,1) NOT NULL,
                                      [name] [nvarchar](50) NOT NULL,
                                      [address_id] [int] NULL
                                    )"

    createTable! 'people_addresses' "CREATE TABLE [dbo].[people_addresses](
                                                [address_id] [int] NOT NULL,
                                                [person_id] [int] NOT NULL,
                                                [rating] [int] NULL
                                              )"

    createTable! 'addresses' "CREATE TABLE [dbo].[addresses](
                                        [id] [int] IDENTITY(1,1) NOT NULL,
                                        [address] [nvarchar](50) NOT NULL
                                       )"

    createTable! 'people_weird_id' "CREATE TABLE [dbo].[people_weird_id](
                                               [weird_id] [int] IDENTITY(1,1) NOT NULL,
                                               [name] [nvarchar](50) NOT NULL,
                                               [address_weird_id] [int] NULL
                                             )"

    createTable! 'people_explicit_id' "CREATE TABLE [dbo].[people_explicit_id](
                                                 [id] [int] NOT NULL,
                                                 [name] [nvarchar](50) NOT NULL
                                                )"

  true = true
  false = false

  clean(records) = records

  driverModuleName = 'mssql'
}

describeDatabase 'postgres' {
  url = "postgres://localhost/gloworm"
  driver = 'pg'
} {
  createTables(db, tables) =
    createTable (name, sql) =
      tables.push(name)
      db.query! (sql)

    createTable! 'people' "create table if not exists people (
                             id serial NOT NULL,
                             name varchar(50) NOT NULL,
                             address_id int NULL
                           )"

    createTable! 'people_addresses' "create table if not exists people_addresses(
                                       address_id int NOT NULL,
                                       person_id int NOT NULL,
                                       rating int NULL
                                     )"

    createTable! 'addresses' "create table if not exists addresses(
                                id serial NOT NULL,
                                address varchar(50) NOT NULL
                              )"

    createTable! 'people_weird_id' "create table if not exists people_weird_id(
                                      weird_id serial NOT NULL,
                                      name varchar(50) NOT NULL,
                                      address_weird_id int NULL
                                    )"

    createTable! 'people_explicit_id' "create table if not exists people_explicit_id(
                                         id int NOT NULL,
                                         name varchar(50) NOT NULL
                                       )"

  true = true
  false = false

  clean(records) = records

  driverModuleName = 'pg'
}

describeDatabase 'mysql' {
  config = {
    user = 'user'
    password = 'password'
    database = 'gloworm'
  }
  driver = 'mysql'
} {
  createTables(db, tables) =
    createTable (name, sql) =
      tables.push(name)
      db.query! (sql)

    createTable! 'people' "create table if not exists people (
                             id serial NOT NULL,
                             name varchar(50) NOT NULL,
                             address_id int NULL
                           )"

    createTable! 'people_addresses' "create table if not exists people_addresses(
                                       address_id int NOT NULL,
                                       person_id int NOT NULL,
                                       rating int NULL
                                     )"

    createTable! 'addresses' "create table if not exists addresses(
                                id serial NOT NULL,
                                address varchar(50) NOT NULL
                              )"

    createTable! 'people_weird_id' "create table if not exists people_weird_id(
                                      weird_id serial NOT NULL,
                                      name varchar(50) NOT NULL,
                                      address_weird_id int NULL
                                    )"

    createTable! 'people_explicit_id' "create table if not exists people_explicit_id(
                                         id int NOT NULL,
                                         name varchar(50) NOT NULL
                                       )"

  true = 1
  false = 0

  clean(records) = JSON.parse(JSON.stringify(records))

  driverModuleName = 'mysql'
}
