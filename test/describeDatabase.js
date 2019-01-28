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
    if (!database.noModule) {
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
    }

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
        var pet;
        var personWeirdId
        var address;
        var personAddress;
        var statements;

        before(function() {
          var schema = sworm.db(config);
          function close () {
            return schema.close()
          }
          return database.createTables(schema, tables).then(close, close)
        });

        function clearTables() {
          return Promise.all(tables.map(function (table) {
            return db.statement('delete from ' + table);
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

            var match = /^\s*(insert|update|delete|select|begin|commit|rollback)/.exec(sql);
            statements.push(match[1]);

            this.logResults.apply(this, arguments);
            this.log = originalLog;
          };

          return clearTables().then(function() {
            statements = [];

            person = db.model({
              table: "people"
            });

            pet = db.model({
              table: "pets"
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

            personWeirdId = db.model({
              table: "people_weird_id",
              id: "weird_id",
              foreignKeyFor: function(x) {
                return x + "_weird_id";
              }
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
            var photo = new Buffer.from('♥︎');

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

        context('without connecting', function () {
          var db

          beforeEach(function () {
            db = sworm.db(config);
          })

          afterEach(function () {
            return db.close()
          })

          it("can insert", function() {
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
        })

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

        if (!database.hasOwnProperty('transactions') || database.transactions != false) {
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
        } else {
          describe('no transactions', function () {
            it('throws when asked to create a new transaction', function () {
              expect(function () {
                db.begin()
              }).to.throw('transactions are not supported')
            })
          })
        }

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

          it("can call save twice on the same object", function() {
            var p = person({ name: 'Person' });
            p.save()
            return p.save().then(function () {
              return p;
            }).then(function (people) {
              expect(people.saved()).to.equal(true)
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

        it('throws when inner entity cannot be saved', function () {
          var a = address({
            address: 'asdf',
            persion: function (a) {
              return [
                person({
                  name: 'bob',
                  address: a,
                  non_extant_field: 'haha'
                })
              ]
            }
          })

          return expect(a.save()).to.eventually.be.rejectedWith(/non_extant_field/i);
        })

        describe("custom id columns", function() {
          it("can insert with weird_id", function() {
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
            var miffy

            var p = personExplicitId({
              id: 4,
              name: "bob",
              pet: function (person) {
                return [
                  miffy = pet({name: 'miffy', owner: person})
                ]
              }
            });

            return p.save().then(function() {
              return db.query("select * from people_explicit_id").then(function(people) {
                expect(database.clean(people)).to.eql([{
                  id: 4,
                  name: "bob"
                }]);
              });
            }).then(function () {
              return db.query("select * from pets").then(function(pets) {
                expect(database.clean(pets)).to.eql([{
                  id: miffy.id,
                  name: 'miffy',
                  owner_id: 4
                }]);
              });
            })
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
          var existing

          beforeEach(function () {
            existing = person({name: 'somebody'})
            return existing.save().then(function () {
              statements = []
            })
          });

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
              bob.id = existing.id;

              return bob.save().then(function() {
                expect(statements).to.eql([ "update" ]);
              });
            });
          });

          it("updates when created with saved = true and force = true", function() {
            return person({
              id: existing.id,
              name: "bob"
            }, { saved: true }).save({ force: true }).then(function() {
              expect(statements).to.eql([ "update" ]);
            });
          });

          it("updates when created with saved = true and modified = true", function() {
            return person({
              id: existing.id,
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

        describe("foreign keys", function() {
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

          it('throw if a non-array is returned from a function', function() {
            var rueDEssert = address({
              address: "15, Rue d'Essert",
              people: function(address) {
                return person({
                  name: "bob",
                  address: address
                })
              }
            });

            return expect(rueDEssert.save()).to.eventually.be.rejectedWith('must return arrays')
          });

          it("can save a one to many relationship with function that returns an array", function() {
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

                    return db.query('select * from addresses order by address').then(function(addresses) {
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

          it('can save outer with an inner with a foreign key', function () {
            var bob
            var bobsPlace = address({
              address: "bob's place",
              person: bob = person(
                {
                  name: 'bob'
                },
                {
                  foreignKeyField: 'address'
                }
              )
            })

            return bobsPlace.save().then(function () {
              return db.query('select * from addresses').then(function (addresses) {
                expect(addresses).to.eql([{
                  address: "bob's place",
                  id: bobsPlace.id
                }])
              })
            }).then(function () {
              return db.query('select * from people').then(function (people) {
                expect(people).to.eql([{
                  id: bob.id,
                  name: 'bob',
                  address_id: bobsPlace.id,
                  photo: null
                }])
              })
            })
          })

          it("can save outer and inner but with no foreign key", function () {
            var bob
            var bobsPlace = address({
              address: "bob's place",
              person: bob = person(
                {
                  name: 'bob'
                },
                {
                  foreignKeyField: false
                }
              )
            })

            return bobsPlace.save().then(function () {
              return db.query('select * from addresses').then(function (addresses) {
                expect(addresses).to.eql([{
                  address: "bob's place",
                  id: bobsPlace.id
                }])
              })
            }).then(function () {
              return db.query('select * from people').then(function (people) {
                expect(people).to.eql([{
                  id: bob.id,
                  name: 'bob',
                  address_id: null,
                  photo: null
                }])
              })
            })
          })
        });

        describe('unescape', function () {
          it('can unescape parameters', function () {
            return Promise.all([
              person({name: 'jack'}).save(),
              person({name: 'jane'}).save(),
              person({name: 'jen'}).save()
            ]).then(function () {
              return db.query('select * from people where name in (@name) order by name', {name: sworm.unescape(['jane', 'jen'].map(sworm.escape).join(','))})
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'jane',
                'jen'
              ])
            });
          });
        });

        describe('insert', function () {
          var personExplicitId

          beforeEach(function () {
            personExplicitId = db.model({
              table: "people_explicit_id"
            });
          })

          it('can insert with id set', function () {
            var bob = personExplicitId({name: 'bob', id: 4})

            return bob.insert().then(function () {
              return db.query('select * from people_explicit_id where id = 4')
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'bob'
              ])
            })
          });

          it('can insert without id set', function () {
            var bob = person({name: 'bob'})

            return bob.insert().then(function () {
              return db.query('select * from people where id = @id', {id: bob.id})
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'bob'
              ])
            })
          });

          it('saves one to manies first', function () {
            var bob = person({name: 'bob', address: address({address: 'lolo st'})})

            return bob.insert().then(function () {
              return db.query('select * from addresses')
            }).then(function (rows) {
              expect(rows).to.eql([
                {
                  address: 'lolo st',
                  id: bob.address_id
                }
              ])
            })
          });
        });

        describe('update', function () {
          it('can update with id set', function () {
            var bob = person({name: 'bob'})

            return bob.save().then(function () {
              var bob2 = person({name: 'bob2', id: bob.id})

              return bob2.update()
            }).then(function () {
              return db.query('select * from people')
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'bob2'
              ])
            })
          });

          it('saves one to manies first', function () {
            var bob = person({name: 'bob'})

            return bob.save().then(function () {
              var bob2 = person({name: 'bob2', id: bob.id, address: address({address: 'lolo st'})})

              return bob2.update().then(function () {
                return db.query('select * from addresses')
              }).then(function (rows) {
                expect(rows).to.eql([
                  {
                    address: 'lolo st',
                    id: bob2.address_id
                  }
                ])
              })
            })
          });

          it('cannot update without id set', function () {
            var bob = person({name: 'bob'})

            return bob.save().then(function () {
              var bob2 = person({name: 'bob2'})

              return expect(bob2.update()).to.eventually.be.rejectedWith('entity must have id to be updated')
            })
          });

          it('throws if no entity is found to update', function () {
            var bob = person({name: 'bob'})

            return bob.save().then(function () {
              var bob2Id = bob.id + 1
              var bob2 = person({name: 'bob2', id: bob2Id})

              return expect(bob2.update()).to.eventually.be.rejectedWith('people entity with id = ' + bob2Id + ' not found to update')
            })
          });
        });

        describe('upsert', function () {
          var bob

          beforeEach(function () {
            bob = person({name: 'bob'})
            return bob.save()
          })

          it('inserts when there is no id', function () {
            var bob2 = person({name: 'bob2'})

            return bob2.upsert().then(function () {
              return db.query('select * from people order by name')
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'bob',
                'bob2'
              ])
            })
          });

          it('updates when there is an id', function () {
            var bob2 = person({name: 'bob2', id: bob.id})

            return bob2.upsert().then(function () {
              return db.query('select * from people')
            }).then(function (rows) {
              expect(rows.map(function (r) { return r.name })).to.eql([
                'bob2'
              ])
            })
          });
        });

        describe('identity', function () {
          describe('non-compound keys', function () {
            context('with ids', function () {
              it('returns identity', function () {
                var bob = personWeirdId({name: 'bob', weird_id: 5})
                expect(bob.identity()).to.eql(5)
              })

              it('has identity', function () {
                var bob = personWeirdId({name: 'bob', weird_id: 5})
                expect(bob.hasIdentity()).to.be.true
              })
            })

            context('without ids', function () {
              it('returns undefined', function () {
                var bob = personWeirdId({name: 'bob'})
                expect(bob.identity()).to.eql(undefined)
              })

              it('does not have identity', function () {
                var bob = personWeirdId({name: 'bob'})
                expect(bob.hasIdentity()).to.be.false
              })
            })
          })

          describe('compound keys', function () {
            context('with ids', function () {
              it('returns identity', function () {
                var bobAddress = personAddress({address_id: 1, person_id: 2})
                expect(bobAddress.identity()).to.eql([1, 2])
              })

              it('has identity', function () {
                var bobAddress = personAddress({address_id: 1, person_id: 2})
                expect(bobAddress.hasIdentity()).to.be.true
              })
            })

            context('without ids', function () {
              it('returns undefined', function () {
                var bobAddress = personAddress({})
                expect(bobAddress.identity()).to.eql(undefined)
              })

              it('does not have identity', function () {
                var bobAddress = personAddress({})
                expect(bobAddress.hasIdentity()).to.be.false
              })
            })

            context('with half ids', function () {
              it('returns undefined', function () {
                var bobAddress = personAddress({address_id: 1})
                expect(bobAddress.identity()).to.eql(undefined)
              })

              it('does not have identity', function () {
                var bobAddress = personAddress({})
                expect(bobAddress.hasIdentity()).to.be.false
              })
            })
          })
        })

        it('can access the underlying connection', function () {
          expect(db.driver.connection).to.not.be.undefined
        })

        describe('graph queries', function () {
          function clone(x) {
            return JSON.parse(JSON.stringify(x))
          }

          it('can rebuild a graph with one to many relationships', function () {
            var bob
            var jane
            var jack
            var jessy
            var smokey
            var miffy

            var somethingPlace = address({
              address: '1 something place',
              people: function (address) {
                return [
                  bob = person({
                    name: 'bob',
                    address: address,
                    pets: function (owner) {
                      return [
                        jessy = pet({name: 'jessy', owner: owner}),
                        smokey = pet({name: 'smokey', owner: owner})
                      ]
                    }
                  }),
                  jane = person({name: 'jane', address: address})
                ]
              }
            })

            var anotherPlace = address({
              address: '2 another place',
              people: function (address) {
                return [
                  jack = person({
                    name: 'jack',
                    address: address,
                    pets: function (owner) {
                      return [
                        miffy = pet({name: 'miffy', owner: owner})
                      ]
                    }
                  })
                ]
              }
            })

            return Promise.all([
              somethingPlace.insert(),
              anotherPlace.insert()
            ]).then(function () {
              var def = address({
                id: 'address_id',
                address: 'address',
                people: [
                  person({
                    id: 'person_id',
                    name: 'name',
                    pets: [
                      pet({
                        id: 'pet_id',
                        name: 'pet_name'
                      })
                    ]
                  })
                ]
              })

              var sql = 
                'select ' +
                'people.id as person_id, people.name as name, addresses.id as address_id, address, pets.id as pet_id, pets.name as pet_name ' +
                'from addresses left join people on people.address_id = addresses.id ' +
                'left join pets on pets.owner_id = people.id ' +
                'order by addresses.address, people.name, pets.name'

              return db.queryGraph(def, sql).then(function (results) {
                expect(clone(results)).to.eql([
                  {
                    id: somethingPlace.id,
                    address: '1 something place',
                    people: [
                      {
                        id: bob.id,
                        name: 'bob',
                        pets: [
                          {
                            id: jessy.id,
                            name: 'jessy'
                          },
                          {
                            id: smokey.id,
                            name: 'smokey'
                          }
                        ]
                      },
                      {
                        id: jane.id,
                        name: 'jane',
                        pets: []
                      }
                    ]
                  },
                  {
                    id: anotherPlace.id,
                    address: '2 another place',
                    people: [
                      {
                        id: jack.id,
                        name: 'jack',
                        pets: [
                          {
                            id: miffy.id,
                            name: 'miffy'
                          }
                        ]
                      }
                    ]
                  }
                ]);
              })
            })
          });

          it('can rebuild a graph with one to one relationships', function () {
            var bob

            var somethingPlace = address({
              address: '1 something place',
              people: function (address) {
                return [
                  bob = person({
                    name: 'bob',
                    address: address
                  })
                ]
              }
            })

            var anotherPlace = address({
              address: '2 another place'
            })

            return Promise.all([
              somethingPlace.save(),
              anotherPlace.save()
            ]).then(function () {
              var def = address({
                id: 'address_id',
                address: 'address',
                people: person({
                  id: 'person_id',
                  name: 'name'
                })
              })
                
              return db.queryGraph(def,
                'select ' +
                'people.id as person_id, name, addresses.id as address_id, address ' +
                'from addresses left join people on people.address_id = addresses.id ' +
                'order by addresses.address, people.name'
              ).then(function (results) {
                expect(clone(results)).to.eql([
                  {
                    id: somethingPlace.id,
                    address: '1 something place',
                    people: {
                      id: bob.id,
                      name: 'bob'
                    },
                  },
                  {
                    id: anotherPlace.id,
                    address: '2 another place'
                  }
                ]);
              })
            })
          });

          context('with a person and their pet', function () {
            var bob
            var jessy

            beforeEach(function () {
              bob = person({
                name: 'bob',
                pet: function (owner) {
                  return [
                    jessy = pet({name: 'jessy', owner: owner})
                  ]
                }
              })

              return bob.save()
            })

            it('throws if identity column not mapped', function () {
              var def = person({
                id: 'id',
                name: 'name',
                pet: pet({
                  name: 'pet_name'
                })
              })

              var sql = 'select people.id, people.name, pets.name as pet_name from people join pets on people.id = pets.owner_id'

              return expect(db.queryGraph(def, sql)).to.eventually.be.rejectedWith('expected definition for pets to have id')
            })

            it('throws if identity column not in sql', function () {
              var def = person({
                id: 'id',
                name: 'name',
                pet: pet({
                  id: 'pet_id',
                  name: 'pet_name'
                })
              })

              var sql = 'select people.id, people.name, pets.name as pet_name from people join pets on people.id = pets.owner_id'

              return expect(db.queryGraph(def, sql)).to.eventually.be.rejectedWith('expected pets.id to be present in results as pet_id')
            })

            it('can update the pet', function () {
              var def = person({
                id: 'id',
                name: 'name',
                pet: pet({
                  id: 'pet_id',
                  name: 'pet_name'
                })
              })

              var sql = 'select people.id, people.name, pets.name as pet_name, pets.id as pet_id from people join pets on people.id = pets.owner_id'

              return db.queryGraph(def, sql).then(function (results) {
                var loadedBob = results[0]
                loadedBob.pet.name = 'minibob'
                statements = [];
                return loadedBob.save().then(function () {
                  expect(statements).to.eql(['update'])

                  return db.query('select * from pets').then(function (pets) {
                    expect(pets).to.eql([
                      {
                        id: jessy.id,
                        name: 'minibob',
                        owner_id: bob.id
                      }
                    ])
                  })
                })
              })
            })

            it('can update the person', function () {
              var def = person({
                id: 'id',
                name: 'name',
                pet: pet({
                  id: 'pet_id',
                  name: 'pet_name'
                })
              })

              var sql = 'select people.id, people.name, pets.name as pet_name, pets.id as pet_id from people join pets on people.id = pets.owner_id'

              return db.queryGraph(def, sql).then(function (results) {
                var loadedBob = results[0]
                loadedBob.name = 'bob2'
                statements = [];
                return loadedBob.save().then(function () {
                  expect(statements).to.eql(['update'])

                  return db.query('select * from people').then(function (people) {
                    expect(people).to.eql([
                      {
                        address_id: null,
                        id: bob.id,
                        name: 'bob2',
                        photo: null
                      }
                    ])
                  })
                })
              })
            })
          })
        })
      });

      describe("connection", function() {
        function clear(db) {
          return db.statement('delete from people');
        }

        var db

        afterEach(function () {
          return db.close()
        })

        it("can define models before connecting to database", function() {
          db = sworm.db();

          var personModel = db.model({
            table: "people"
          });

          var bob = personModel({
            name: "bob"
          });

          return db.connect(config).then(function() {
            return clear(db)
          }).then(function () {
            return bob.save().then(function() {
              return db.query("select * from people").then(function(people) {
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
          db = sworm.db(_.extend(config, {setupSession: function (db) {
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
