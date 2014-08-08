expect = require 'chai'.expect
orb = require '..'

describe 'mssql-orm'
  db = nil
  tables = []
  person = nil
  address = nil

  config = {
    user = 'user'
    password = 'password'
    server = 'windows'
    database ='orb'
  }

  before
    schema = orb.db(config)!

    (schema) createTable! 'people' "CREATE TABLE [dbo].[people](
                                      [id] [int] IDENTITY(1,1) NOT NULL,
                                      [name] [nvarchar](50) NOT NULL,
                                      [dob] [datetime] NULL,
                                      [likesNoodles] [bit] NULL,
                                      [addressId] [int] NULL
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

  createTable (db, name, sql) =
    tables.push(name)

    db.query! "if object_id('dbo.#(name)', 'U') is not null drop table [dbo].[#(name)]"
    db.query! (sql)

  clearTables() =
    for each @(table) in (tables)
      db.query "delete from #(table)"!

  beforeEach
    db := orb.db(config)!
    clearTables()!

    person := db.row (table = 'people')
    address := db.row {
      table = 'addresses'

      addPerson(person) =
        self.people = self.people @or []
        person.address = self
        self.people.push(person)
    }

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

  it 'only saves once'
    p = person {
      name = 'bob'
    }

    p.save()!
    p.save()!

    people = db.query 'select * from people'!
    expect(people).to.eql [{id = p.id, name = 'bob', dob = null, likesNoodles = null, addressId = null}]

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
      personWeirdId = db.row (table = 'people_weird_id', id = 'weird_id')

      p = personWeirdId {
        name = 'bob'
      }

      p.save()!
      expect(p.weird_id).to.exist

      people = db.query 'select * from people_weird_id'!
      expect(people).to.eql [{weird_id = p.weird_id, name = 'bob', addressWeirdId = null}]

  it 'can attach to objects from query'
    bob = person {
      name = 'bob'
    }
    bob.save()!

    jane = person {
      name = 'jane'
    }
    jane.save()!

    people = [p <- db.query 'select * from people'!, person (p)]

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
        personWeirdId = db.row (table = 'people_weird_id', id = 'weird_id', foreignKeyFor (x) = x + 'WeirdId')

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
