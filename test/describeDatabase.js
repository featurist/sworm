var fs = require("fs-promise");
var sworm = require("..");
var chai = require("chai");
var expect = chai.expect;
var chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
var _ = require("underscore");

require('es6-promise').polyfill();

module.exports = function(name, config, database, otherTests) {
  describe(name, function() {
    describe("missing modules", function() {
      var moduleName = __dirname + "/../node_modules/" + database.driverModuleName;

      beforeEach(function() {
        return fs.rename(moduleName, moduleName + ".missing");
      });

      afterEach(function() {
        return fs.rename(moduleName + ".missing", moduleName);
      });

      it("throws an exception if the driver module is not present", function() {
        return expect(function() {
          sworm.db(config).connect();
        }).to.throw("npm install " + database.driverModuleName);
      });
    });

    context('with a database', function () {
      before(function () {
        if (database.createDatabase) {
          return database.createDatabase();
        }
      });

      context("when connected", function() {
        var db;
        var tables = [];
        var person;
        var address;
        var personAddress;
        var statements;

        before(function() {
          var schema = sworm.db(config);
          return database.createTables(schema, tables);
        });

        function clearTables() {
          return Promise.all(tables.map(function (table) {
            return db.query('delete from ' + table);
          }));
        }

        if (otherTests) {
          otherTests();
        }

        beforeEach(function() {
          db = sworm.db(config);
          statements = [];

          db.log = function(sql) {
            var originalLog = this.log;
            this.log = undefined;

            var match = /^(insert|update|delete|select|begin|commit|rollback)/.exec(sql);
            statements.push(match[1]);

            this.logResults.apply(this, arguments);
            this.log = originalLog;
          };

          return clearTables().then(function() {
            statements = [];

            person = db.model({
              table: "people"
            });

            address = db.model({
              table: "addresses",

              addPerson: function(person) {
                this.people = this.people || [];
                person.address = this;
                this.people.push(person);
              }
            });

            personAddress = db.model({
              table: "people_addresses",
              id: [ "address_id", "person_id" ]
            });
          });
        });

        afterEach(function() {
          return db.close();
        });

        it("can insert", function() {
          var p = person({
              name: "bob"
          });
          return p.save().then(function() {
            expect(p.id).to.exist;

            return db.query("select * from people").then(function(people) {
              return expect(database.clean(people)).to.eql([{
                id: p.id,
                name: "bob",
                address_id: null,
                photo: null
              }]);
            });
          });
        });

        describe('binary', function () {
          it('can store binary', function () {
            var photo = new Buffer('♥︎');

            var bob = person({
              name: 'bob',
              photo: photo
            });

            return bob.save().then(function () {
              return db.query('select * from people').then(function (people) {
                expect(people[0].photo.toString()).to.equal(photo.toString());
              });
            });
          });
        });

        it("can insert without connecting", function() {
          var db = sworm.db(config);
          var person = db.model({
            table: 'people'
          });
          var p = person({
              name: "bob"
          });
          return p.save().then(function() {
            expect(p.id).to.exist;

            return db.query("select * from people").then(function(people) {
              return expect(database.clean(people)).to.eql([{
                id: p.id,
                name: "bob",
                address_id: null,
                photo: null
              }]);
            });
          });
        });

        it('can run a function then disconnect', function () {
          var db = sworm.db(config);

          expect(db.connected).to.be.false;

          return db.connect(function () {
            expect(db.connected).to.be.true;

            return db.query('select * from people').then(function (people) {
              expect(people).to.eql([]);
            });
          }).then(function () {
            expect(db.connected).to.be.false;
          });
        });

        it("can insert emtpy rows", function() {
          var personWeirdId = db.model({
            table: "people_weird_id",
            id: "weird_id"
          });
          var p = personWeirdId({});
          return p.save().then(function() {
            expect(p.weird_id).to.exist;

            return db.query("select * from people_weird_id").then(function(people) {
              return expect(database.clean(people)).to.eql([{
                weird_id: p.weird_id,
                name: null,
                address_weird_id: null
              }]);
            });
          });
        });

        describe('transactions', function () {
          beforeEach(function () {
            if (database.setAutoCommit) {
              database.setAutoCommit(false);
            }
          });

          afterEach(function () {
            if (database.setAutoCommit) {
              database.setAutoCommit(true);
            }
          });

          describe('rollback', function () {
            describe('explicit', function () {
              it('rolls back when rollback is called', function () {
                return db.begin().then(function () {
                  var bob = person({ name: 'bob' });
                  return bob.save().then(function () {
                    return db.query('select * from people');
                  }).then(function (people) {
                    expect(people).to.eql([
                      {
                        id: bob.id,
                        name: 'bob',
                        address_id: null,
                        photo: null
                      }
                    ]);
                  }).then(function() {
                    return db.rollback();
                  }).then(function() {
                    return db.query('select * from people');
                  }).then(function(people) {
                    expect(people).to.eql([
                    ]);
                  });
                });
              });
            });

            describe('scoped', function () {
              it('rolls back if the transaction scope throws an exception', function () {
                return expect(db.transaction(function () {
                  var bob = person({ name: 'bob' });
                  return bob.save().then(function() {
                    return db.query('select * from people');
                  }).then(function(people) {
                    expect(people).to.eql([
                      {
                        id: bob.id,
                        name: 'bob',
                        address_id: null,
                        photo: null
                      }
                    ]);

                    throw new Error('uh oh');
                  });
                })).to.be.rejectedWith('uh oh').then(function() {
                  return db.query('select * from people');
                }).then(function(people) {
                  expect(people).to.eql([
                  ]);
                });
              });
            });
          });

          describe('commit', function () {
            describe('explicit', function () {
              it('makes changes after commit is called', function () {
                return db.begin().then(function () {
                  var bob = person({ name: 'bob' });
                  return bob.save().then(function() {
                    return db.query('select * from people');
                  }).then(function(people) {
                    expect(people).to.eql([
                      {
                        id: bob.id,
                        name: 'bob',
                        address_id: null,
                        photo: null
                      }
                    ]);
                  }).then(function() {
                    return db.commit();
                  }).then(function() {
                    return db.query('select * from people');
                  }).then(function(people) {
                    expect(people).to.eql([
                      {
                        id: bob.id,
                        name: 'bob',
                        address_id: null,
                        photo: null
                      }
                    ]);
                  });
                });
              });
            });

            describe('scoped', function () {
              it('makes changes after commit is called', function () {
                var bob;

                return db.transaction(function () {
                  bob = person({ name: 'bob' });
                  return bob.save().then(function() {
                    return db.query('select * from people');
                  }).then(function(people) {
                    expect(people).to.eql([
                      {
                        id: bob.id,
                        name: 'bob',
                        address_id: null,
                        photo: null
                      }
                    ]);
                  });
                }).then(function() {
                  return db.query('select * from people');
                }).then(function(people) {
                  expect(people).to.eql([
                    {
                      id: bob.id,
                      name: 'bob',
                      address_id: null,
                      photo: null
                    }
                  ]);
                });
              });
            });
          });
        });

        describe("concurrency", function() {
          it("can insert multiple rows, maintaining correct IDs", function() {
            return Promise.all(_.range(1, 101).map(function (n) {
              var p = person({ name: 'Person ' + n });
              return p.save().then(function () {
                return p;
              });
            })).then(function (people) {
              return Promise.all(people.map(function (originalPerson) {
                return db.query('select name from people where id = @id', {id: originalPerson.id}).then(function (loadedPerson) {
                  expect(originalPerson.name).to.equal(loadedPerson[0].name);
                });
              }));
            });
          });
        });

        describe("strings", function() {
          it("can insert with escapes", function() {
            var p = person({
              name: "bob's name is 'matilda'"
            });

            return p.save().then(function() {
              expect(p.id).to.exist;

              return db.query("select * from people").then(function(people) {
                expect(database.clean(people)).to.eql([{
                  id: p.id,
                  name: "bob's name is 'matilda'",
                  address_id: null,
                  photo: null
                }]);
              });
            });
          });
        });

        describe("only saving when modified", function() {
          var bob;

          beforeEach(function() {
            bob = person({
              name: "bob"
            });
          });

          it("doesn't save unmodified entity again after insert", function() {
            return bob.save().then(function() {
              expect(statements).to.eql([ "insert" ]);

              return bob.save().then(function() {
                expect(statements).to.eql([ "insert" ]);
              });
            });
          });

          it("doesn't save unmodified entity again after update", function() {
            return bob.save().then(function() {
              expect(statements).to.eql([ "insert" ]);

              bob.name = "jane";

              return bob.save().then(function() {
                expect(statements).to.eql([ "insert", "update" ]);

                return bob.save().then(function() {
                  expect(statements).to.eql([ "insert", "update" ]);
                });
              });
            });
          });

          it("can force an update", function() {
            return bob.save().then(function() {
              expect(statements).to.eql([ "insert" ]);

              bob.name = "jane";

              return bob.save().then(function() {
                expect(statements).to.eql([ "insert", "update" ]);

                return bob.save({force: true}).then(function() {
                  expect(statements).to.eql([ "insert", "update", "update" ]);
                });
              });
            });
          });

          it("doesn't update after entity taken from model query", function() {
            return bob.save().then(function() {
              expect(statements).to.eql([ "insert" ]);

              return person.query("select * from people").then(function(results) {
                var savedBob = results[0];

                return savedBob.save().then(function() {
                  expect(statements).to.eql([ "insert", "select" ]);

                  savedBob.name = "jane";

                  return savedBob.save().then(function() {
                    expect(statements).to.eql([ "insert", "select", "update" ]);
                  });
                });
              });
            });
          });
        });

        it("can save and update", function() {
          var p = person({ name: "bob" });

          return p.save().then(function() {
            p.name = "jane";

            return p.save().then(function() {
              return db.query("select * from people").then(function(people) {
                expect(database.clean(people)).to.eql([{
                    id: p.id,
                    name: "jane",
                    address_id: null,
                    photo: null
                }]);
              });
            });
          });
        });

        describe("custom id columns", function() {
          it("can insert with weird_id", function() {
            var personWeirdId = db.model({
              table: "people_weird_id",
              id: "weird_id"
            });
            var p = personWeirdId({
              name: "bob"
            });
            return p.save().then(function() {
              expect(p.weird_id).to.exist;

              return db.query("select * from people_weird_id").then(function(people) {
                expect(database.clean(people)).to.eql([{
                  weird_id: p.weird_id,
                  name: "bob",
                  address_weird_id: null
                }]);
              });
            });
          });
        });

        describe("explicitly setting id", function() {
          it("can insert with id", function() {
            var personExplicitId = db.model({
              table: "people_explicit_id"
            });

            var p = personExplicitId({
              id: 1,
              name: "bob"
            });

            return p.save().then(function() {
              return db.query("select * from people_explicit_id").then(function(people) {
                expect(database.clean(people)).to.eql([{
                  id: 1,
                  name: "bob"
                }]);
              });
            });
          });
        });

        describe('model with no id', function() {
          it('can insert without assigning id', function() {
            var personAddress = db.model({
              table: "people_addresses",
              id: false
            });

            var p = personAddress({
              person_id: 10,
              address_id: 20
            });

            return p.save().then(function() {
              expect(p.id).to.be.undefined;
              expect(p.hasOwnProperty('id')).to.be.false;
              return db.query("select * from people_addresses").then(function(peopleAddresses) {
                expect(database.clean(peopleAddresses)).to.eql([{
                  person_id: 10,
                  address_id: 20,
                  rating: null
                }]);
              });
            });
          });
        });

        describe("saved and modified", function() {
          it("inserts when created for the first time", function() {
            return person({
              name: "bob"
            }).save().then(function() {
              expect(statements).to.eql([ "insert" ]);
            });
          });

          it("doesn't save created with saved = true", function() {
            var bob = person({ name: "bob" }, { saved: true });

            return bob.save().then(function() {
              expect(statements).to.eql([]);

              bob.name = "jane";
              bob.id = 1;

              return bob.save().then(function() {
                expect(statements).to.eql([ "update" ]);
              });
            });
          });

          it("updates when created with saved = true and force = true", function() {
            return person({
              id: 1,
              name: "bob"
            }, { saved: true }).save({ force: true }).then(function() {
              expect(statements).to.eql([ "update" ]);
            });
          });

          it("updates when created with saved = true and modified = true", function() {
            return person({
              id: 1,
              name: "bob"
            }, {
              saved: true,
              modified: true
            }).save().then(function() {
              expect(statements).to.eql([ "update" ]);
            });
          });

          it("throws if no id on update", function() {
            return expect(person({
              name: "bob"
            }, {
              saved: true,
              modified: true
            }).save()).to.eventually.be.rejectedWith("entity must have id to be updated");
          });
        });

        describe("compound keys", function() {
          it("can save an entity with compound keys", function() {
            var pa = personAddress({
              person_id: 12,
              address_id: 34
            });

            return pa.save().then(function() {
              return db.query("select * from people_addresses").then(function(peopleAddresses) {
                return expect(database.clean(peopleAddresses)).to.eql([{
                  person_id: 12,
                  address_id: 34,
                  rating: null
                }]);
              });
            });
          });

          it("can update an entity with compound keys", function() {
            var pa = personAddress({
                person_id: 12,
                address_id: 34,
                rating: 1
            });

            return pa.save().then(function() {
              return db.query("select * from people_addresses").then(function(peopleAddresses) {
                expect(database.clean(peopleAddresses)).to.eql([{
                  person_id: 12,
                  address_id: 34,
                  rating: 1
                }]);

                pa.rating = 10;
                return pa.save().then(function() {
                  return db.query("select * from people_addresses").then(function(updatedPeopleAddresses) {
                    return expect(database.clean(updatedPeopleAddresses)).to.eql([ {
                      person_id: 12,
                      address_id: 34,
                      rating: 10
                    } ]);
                  });
                });
              });
            });
          });

          return describe("saving only when modified", function() {
            var pa;

            beforeEach(function() {
              pa = personAddress({
                person_id: 12,
                address_id: 34
              });
            });

            it("can save an entity with compound keys", function() {
              return pa.save().then(function() {
                expect(statements).to.eql([ "insert" ]);

                return pa.save().then(function() {
                  expect(statements).to.eql([ "insert" ]);
                });
              });
            });

            it("can update an entity with compound keys", function() {
              return pa.save().then(function() {
                expect(statements).to.eql([ "insert" ]);
                pa.rating = 10;

                return pa.save().then(function() {
                  expect(statements).to.eql([ "insert", "update" ]);

                  return pa.save().then(function() {
                    expect(statements).to.eql([ "insert", "update" ]);
                  });
                });
              });
            });
          });
        });

        describe("queries", function() {
          describe("parameterised queries", function() {
            it("can pass parameters to a query", function() {
              return person({
                name: "bob"
              }).save().then(function() {
                return person({
                  name: "jane"
                }).save().then(function() {
                  return db.query("select name from people where name = @name", {
                    name: "jane"
                  }).then(function(records) {
                    expect(database.clean(records)).to.eql([{
                      name: "jane"
                    }]);
                  });
                });
              });
            });
          });

          return describe("model queries", function() {
            it("can pass parameters to a query", function() {
              return person({
                  name: "bob"
              }).save().then(function() {
                return person({
                    name: "jane"
                }).save().then(function() {
                  return person.query("select name from people where name = @name", {
                    name: "jane"
                  }).then(function(records) {
                    expect(records.map(function (p) {
                      return {name: p.name};
                    })).to.eql([{
                      name: 'jane'
                    }]);
                  });
                });
              });
            });

            it("entites are returned from query and can be modified and saved", function() {
              var bob = person({
                name: "bob"
              });
              return bob.save().then(function() {
                var jane = person({
                  name: "jane"
                });
                return jane.save().then(function() {
                  return person.query("select * from people order by name").then(function(people) {
                    expect(people.map(function(p) {
                      return p.name;
                    })).to.eql([ "bob", "jane" ]);

                    return people[0].save().then(function() {
                      people[1].name = "jenifer";

                      return people[1].save().then(function() {
                        return db.query("select * from people order by name").then(function(people) {
                          expect(people.map(function(p) {
                            return p.name;
                          })).to.eql([ "bob", "jenifer" ]);
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });

        return describe("foreign keys", function() {
          it("can save a many to one relationship", function() {
            var bob = person({
                name: "bob",
                address: address({
                    address: "15, Rue d'Essert"
                })
            });

            return bob.save().then(function() {
              expect(statements).to.eql([ "insert", "insert" ]);

              return db.query("select * from addresses").then(function(addresses) {
                expect(database.clean(addresses)).to.eql([{
                  id: bob.address_id,
                  address: "15, Rue d'Essert"
                }]);
              });
            });
          });

          it("can save a shared foreign object", function() {
            var essert = address({
              address: "15, Rue d'Essert"
            });

            var bob = person({
              name: "bob",
              address: essert
            });

            var jane = person({
              name: "jane",
              address: essert
            });

            return Promise.all([bob.save(), jane.save()]).then(function() {
              expect(bob.address_id).to.equal(essert.id);
              expect(jane.address_id).to.equal(essert.id);
            });
          });

          it("can save a many to one relationship with function", function() {
            var bobsAddress;
            var bob = person({
                name: "bob",
                address: function () {
                  return bobsAddress = address({
                    address: "15, Rue d'Essert"
                  })
                }
            });

            return bob.save().then(function() {
              expect(statements).to.eql([ "insert", "insert" ]);
              expect(bob.address).to.equal(bobsAddress);

              return db.query("select * from addresses").then(function(addresses) {
                expect(database.clean(addresses)).to.eql([{
                  id: bob.address_id,
                  address: "15, Rue d'Essert"
                }]);
              });
            });
          });

          it("can save a many to one relationship with function that returns undefined", function() {
            var bobsAddress;
            var bob = person({
                name: "bob",
                address: function () {
                }
            });

            return bob.save().then(function() {
              expect(statements).to.eql([ "insert" ]);
              expect(bob.address).to.equal(bobsAddress);

              return db.query("select * from addresses").then(function(addresses) {
                expect(database.clean(addresses)).to.eql([]);
              });
            }).then(function () {
              return db.query("select * from people").then(function(people) {
                expect(database.clean(people)).to.eql([{
                  id: bob.id,
                  name: 'bob',
                  address_id: null,
                  photo: null
                }]);
              });
            });
          });

          describe("custom foreign keys", function() {
            it("can save a many to one relationship with a custom foreign key", function() {
              var personWeirdId = db.model({
                table: "people_weird_id",
                id: "weird_id",
                foreignKeyFor: function(x) {
                  return x + "_weird_id";
                }
              });

              var bob = personWeirdId({
                name: "bob",
                address: address({
                  address: "15, Rue d'Essert"
                })
              });

              return bob.save().then(function() {
                return db.query("select * from addresses").then(function(addresses) {
                  expect(database.clean(addresses)).to.eql([{
                    id: bob.address_weird_id,
                    address: "15, Rue d'Essert"
                  }]);
                });
              });
            });
          });

          it("can save a one to many relationship", function() {
            var rueDEssert = address({
              address: "15, Rue d'Essert"
            });

            var bob = person({
              name: "bob"
            });

            rueDEssert.addPerson(bob);

            var jane = person({
              name: "jane"
            });

            rueDEssert.addPerson(jane);

            return bob.save().then(function() {
              expect(statements).to.eql([ "insert", "insert", "insert" ]);

              return db.query("select * from addresses").then(function(addresses) {
                expect(database.clean(addresses)).to.eql([{
                  id: bob.address_id,
                  address: "15, Rue d'Essert"
                }]);

                return db.query("select * from people order by name").then(function(people) {
                  expect(people.map(function (p) {
                    return {
                      name: p.name,
                      address_id: p.address_id
                    };
                  })).to.eql([
                    {
                      name: "bob",
                      address_id: rueDEssert.id
                    },
                    {
                      name: "jane",
                      address_id: rueDEssert.id
                    }
                  ]);
                });
              });
            });
          });

          it("can save a one to many relationship with function", function() {
            var bob;
            var jane;
            var rueDEssert = address({
              address: "15, Rue d'Essert",
              people: function(address) {
                return [
                  bob = person({
                    name: "bob",
                    address: address
                  }),
                  jane = person({
                    name: "jane",
                    address: address
                  })
                ];
              }
            });

            return rueDEssert.save().then(function() {
              expect(statements).to.eql([ "insert", "insert", "insert" ]);
              expect(rueDEssert.people).to.eql([bob, jane]);

              return db.query("select * from addresses").then(function(addresses) {
                expect(database.clean(addresses)).to.eql([ {
                    id: bob.address_id,
                    address: "15, Rue d'Essert"
                } ]);

                return db.query("select * from people order by name").then(function(people) {
                  expect(people.map(function (p) {
                    return {
                      name: p.name,
                      address_id: p.address_id
                    };
                  })).to.eql([
                    {
                      name: "bob",
                      address_id: rueDEssert.id
                    },
                    {
                      name: "jane",
                      address_id: rueDEssert.id
                    }
                  ]);
                });
              });
            });
          });

          it("one to many relationships with functions aren't saved twice", function() {
            var rueDEssert = address({
              address: "15, Rue d'Essert",
              people: function(address) {
                return [
                  person({
                    name: "bob",
                    address: address
                  }),
                  person({
                    name: "jane",
                    address: address
                  })
                ];
              }
            });

            return rueDEssert.save().then(function() {
              return rueDEssert.save().then(function() {
                return db.query("select * from people order by name").then(function(people) {
                  expect(people.map(function (p) {
                    return {
                      name: p.name,
                      address_id: p.address_id
                    };
                  })).to.eql([
                    {
                      name: "bob",
                      address_id: rueDEssert.id
                    },
                    {
                      name: "jane",
                      address_id: rueDEssert.id
                    }
                  ]);
                });
              });
            });
          });

          it("can have a many to many relationship", function() {
            function livesIn(person, address) {
              var pa = personAddress({
                person: person,
                address: address
              });
              person.addresses = person.addresses || [];
              person.addresses.push(pa);
              address.people = address.people || [];
              address.people.push(pa);
            }

            var bob = person({
                name: "bob"
            });
            var jane = person({
                name: "jane"
            });
            var fremantle = address({
                address: "Fremantle"
            });
            var essert = address({
                address: "15 Rue d'Essert"
            });

            livesIn(bob, fremantle);
            livesIn(jane, fremantle);
            livesIn(jane, essert);

            return essert.save().then(function() {
              return fremantle.save().then(function() {
                expect(statements).to.eql([ "insert", "insert", "insert", "insert", "insert", "insert", "insert" ]);

                return db.query("select * from people order by name").then(function(people) {
                  expect(people.map(function (p) {
                    return {
                      name: p.name,
                      id: p.id
                    };
                  })).to.eql([
                    { id: bob.id, name: 'bob' },
                    { id: jane.id, name: 'jane' }
                  ]);

                  return db.query("select * from people_addresses order by address_id, person_id").then(function(peopleAddresses) {
                    expect(database.clean(peopleAddresses)).to.eql([
                      {
                        address_id: essert.id,
                        person_id: jane.id,
                        rating: null
                      },
                      {
                        address_id: fremantle.id,
                        person_id: jane.id,
                        rating: null
                      },
                      {
                        address_id: fremantle.id,
                        person_id: bob.id,
                        rating: null
                      }
                    ]);

                    return db.query("select * from addresses").then(function(addresses) {
                      return expect(database.clean(addresses)).to.eql([
                        {
                          id: essert.id,
                          address: "15 Rue d'Essert"
                        }, {
                          id: fremantle.id,
                          address: "Fremantle"
                        }
                      ]);
                    });
                  });
                });
              });
            });
          });
        });
      });

      describe("connection", function() {
        it("can define models before connecting to database", function() {
          var schema = sworm.db();

          var personModel = schema.model({
            table: "people"
          });

          var bob = personModel({
            name: "bob"
          });

          return schema.connect(config).then(function() {
            return bob.save().then(function() {
              return schema.query("select * from people").then(function(people) {
                expect(people.map(function (p) {
                  return p.name;
                })).to.eql(['bob']);
              });
            });
          });
        });

        it('can setup the session after connection', function () {
          this.timeout(5000);
          var statements = [];
          var db = sworm.db(_.extend(config, {setupSession: function (db) {
            return db.query('select * from people_addresses');
          }}));
          db.log = function (query) {
            statements.push(query);
          };

          return db.query('select * from people').then(function () {
            expect(statements).to.eql(['select * from people_addresses', 'select * from people']);
          });
        });
      });
    });
  });
};
