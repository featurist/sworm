expect = require 'chai'.expect
mssqlOrm = require '..'

describe 'mssql-orm'
  db = nil
  tables = []
  person = nil
  address = nil
  personAddress = nil
  statements = nil

  config = {
    user = 'user'
    password = 'password'
    server = 'windows'
    database ='mssqlOrm'
  }

  before
    schema = mssqlOrm.db(config)!

    (schema) createTable! 'people' "CREATE TABLE [dbo].[people](
                                      [id] [int] IDENTITY(1,1) NOT NULL,
                                      [name] [nvarchar](50) NOT NULL,
                                      [dob] [datetime] NULL,
                                      [likesNoodles] [bit] NULL,
                                      [addressId] [int] NULL
                                    )"

    (schema) createTable! 'people_addresses' "CREATE TABLE [dbo].[people_addresses](
                                                [addressId] [int] NOT NULL,
                                                [personId] [int] NOT NULL,
                                                [happyHere] [bit] NULL
                                              )"

    (schema) createTable! 'addresses' "CREATE TABLE [dbo].[addresses](
                                        [id] [int] IDENTITY(1,1) NOT NULL,
                                        [address] [nvarchar](50) NOT NULL
                                      )"

    (schema) createTable! 'people_weird_id' "CREATE TABLE [dbo].[people_weird_id](
                                               [weird_id] [int] IDENTITY(1,1) NOT NULL,
                                               [name] [nvarchar](50) NOT NULL,
                                               [addressWeirdId] [int] NULL
                                             )"

    (schema) createTable! 'people_explicit_id' "CREATE TABLE [dbo].[people_explicit_id](
                                                 [id] [int] NOT NULL,
                                                 [name] [nvarchar](50) NOT NULL,
                                               )"

  createTable (db, name, sql) =
    tables.push(name)

    db.query! "if object_id('dbo.#(name)', 'U') is not null drop table [dbo].[#(name)]"
    db.query! (sql)

  clearTables() =
    for each @(table) in (tables)
      db.query "delete from #(table)"!

  beforeEach
    db := mssqlOrm.db(config)!
    statements := []
    db.log(sql) = statements.push(r/^(insert|update)/.exec(sql).1)

    clearTables()!

    person := db.model (table = 'people')
    address := db.model {
      table = 'addresses'

      addPerson(person) =
        self.people = self.people @or []
        person.address = self
        self.people.push(person)
    }
    personAddress := db.model(table = 'people_addresses', id = ['addressId', 'personId'])

  afterEach
    db.close()

  it 'can insert'
    p = person {
      name = 'bob'
    }

    p.save()!
    expect(p.id).to.exist

    people = db.query 'select * from people'!
    expect(people).to.eql [{id = p.id, name = 'bob', dob = null, likesNoodles = null, addressId = null}]

  describe 'booleans'
    canInsertBooleansOfValue (b) =
      it "can insert and query booleans when #(b)"
        p = person {
          name = 'bob'
          likesNoodles = b
        }

        p.save()!
        expect(p.id).to.exist

        people = db.query 'select * from people'!
        expect(people).to.eql [{id = p.id, name = 'bob', likesNoodles = b, dob = null, addressId = null}]

    canInsertBooleansOfValue (true)
    canInsertBooleansOfValue (false)

  describe 'dates'
    canInsertDatesOfValue (d) =
      it "can insert and query dates when #(d)"
        p = person {
          name = 'bob'
          dob = d
        }

        p.save()!
        expect(p.id).to.exist

        people = db.query 'select * from people'!
        expect(people).to.eql [{id = p.id, name = 'bob', dob = d, likesNoodles = null, addressId = null}]

    canInsertDatesOfValue (@new Date(1999, 2, 13, 7, 59, 38))
    canInsertDatesOfValue (@new Date(2013, 3, 14, 12, 54, 36))

  describe 'strings'
    it 'can insert with escapes'
      p = person {
        name = "bob's name is 'matilda'"
      }

      p.save()!
      expect(p.id).to.exist

      people = db.query 'select * from people'!
      expect(people).to.eql [{id = p.id, name = "bob's name is 'matilda'", dob = null, likesNoodles = null, addressId = null}]

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
      expect(statements).to.eql ['insert']

      savedBob.name = 'jane'
      savedBob.save()!
      expect(statements).to.eql ['insert', 'update']

  it 'can save and update'
    p = person {
      name = 'bob'
    }

    p.save()!

    p.name = 'jane'
    p.save()!

    people = db.query 'select * from people'!
    expect(people).to.eql [{id = p.id, name = 'jane', dob = null, likesNoodles = null, addressId = null}]

  describe 'custom id columns'
    it 'can insert with weird_id'
      personWeirdId = db.model (table = 'people_weird_id', id = 'weird_id')

      p = personWeirdId {
        name = 'bob'
      }

      p.save()!
      expect(p.weird_id).to.exist

      people = db.query 'select * from people_weird_id'!
      expect(people).to.eql [{weird_id = p.weird_id, name = 'bob', addressWeirdId = null}]

  describe 'explicitly setting id'
    it 'can insert with id'
      personExplicitId = db.model (table = 'people_explicit_id')

      p = personExplicitId {
        id = 1
        name = 'bob'
      }

      p.save()!

      people = db.query 'select * from people_explicit_id'!
      expect(people).to.eql [{id = 1, name = 'bob'}]

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
      bob.save()!

      expect(statements).to.eql ['update']

    it 'updates when created with saved = true and force = true'
      person (saved = true) {
        name = 'bob'
      }.save(force = true)!

      expect(statements).to.eql ['update']

    it 'updates when created with saved = true and modified = true'
      person (saved = true, modified = true) {
        name = 'bob'
      }.save()!

      expect(statements).to.eql ['update']

  describe 'compound keys'
    it 'can save an entity with compound keys'
      pa = personAddress {
        personId = 12
        addressId = 34
      }

      pa.save()!

      expect(db.query 'select * from people_addresses'!).to.eql [
        {
          personId = 12
          addressId = 34
          happyHere = null
        }
      ]

    it 'can update an entity with compound keys'
      pa = personAddress {
        personId = 12
        addressId = 34
        happyHere = false
      }

      pa.save()!

      expect(db.query 'select * from people_addresses'!).to.eql [
        {
          personId = 12
          addressId = 34
          happyHere = false
        }
      ]

      pa.happyHere = true
      pa.save()!

      expect(db.query 'select * from people_addresses'!).to.eql [
        {
          personId = 12
          addressId = 34
          happyHere = true
        }
      ]

    describe 'saving only when modified'
      pa = nil

      beforeEach
        pa := personAddress {
          personId = 12
          addressId = 34
        }

      it 'can save an entity with compound keys'
        pa.save()!
        expect(statements).to.eql ['insert']
        pa.save()!
        expect(statements).to.eql ['insert']

      it 'can update an entity with compound keys'
        pa.save()!
        expect(statements).to.eql ['insert']

        pa.happyHere = true
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
        expect(records).to.eql [
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
      
      addresses = db.query 'select * from addresses'!

      expect(addresses).to.eql [
        {id = bob.addressId, address  "15, Rue d'Essert"}
      ]

    describe 'custom foreign keys'
      it 'can save a many to one relationship with a custom foreign key'
        personWeirdId = db.model (table = 'people_weird_id', id = 'weird_id', foreignKeyFor (x) = x + 'WeirdId')

        bob = personWeirdId {
          name = 'bob'
          address = address {
            address = "15, Rue d'Essert"
          }
        }
        bob.save()!
        
        addresses = db.query 'select * from addresses'!

        expect(addresses).to.eql [
          {id = bob.addressWeirdId, address  "15, Rue d'Essert"}
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
      
      addresses = db.query 'select * from addresses'!
      expect(addresses).to.eql [
        {id = bob.addressId, address  "15, Rue d'Essert"}
      ]

      expect([p <- db.query 'select * from people'!, {name = p.name, addressId = p.addressId}]).to.eql [
        { name = 'bob', addressId = rueDEssert.id }
        { name = 'jane', addressId = rueDEssert.id }
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

      expect [p <- db.query 'select * from people'!, { id = p.id, name = p.name }].to.eql [
        { id = jane.id, name = 'jane' }
        { id = bob.id, name = 'bob' }
      ]

      expect(db.query 'select * from people_addresses'!).to.eql [
        { addressId = essert.id, personId = jane.id, happyHere = null }
        { addressId = fremantle.id, personId = jane.id, happyHere = null }
        { addressId = fremantle.id, personId = bob.id, happyHere = null }
      ]

      expect(db.query 'select * from addresses'!).to.eql [
        { id = essert.id, address = "15 Rue d'Essert" }
        { id = fremantle.id, address = "Fremantle" }
      ]

  describe 'connection'
    it 'can define models before connecting to database'
      schema = mssqlOrm.db()
      personModel = schema.model (table = 'people')

      bob = personModel {
        name = 'bob'
      }

      schema.connect (config)!

      bob.save()!
      expect([p <- db.query 'select * from people'!, p.name]).to.eql ['bob']
