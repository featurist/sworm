var sworm = require("..");
var chai = require("chai");
var expect = chai.expect;

describe("sworm", function() {
  it("throws exception if no driver is specified or found", function() {
    expect(function() {
      sworm.db({ driver: "blah" }).connect();
    }).to.throw("no such driver: `blah'");
  });

  it("can close connection without opening", function() {
    var db = sworm.db();
    db.close();
  });

  it('throws error when querying and not connected', function() {
    var db = sworm.db();
    expect(function () {
      db.query('select * from people');
    }).to.throw('sworm has not been configured to a database');
  });

  it('throws error when saving and not connected', function() {
    var db = sworm.db();
    var person = db.model({
      table: 'people'
    });

    var bob = person({
      name: 'bob'
    });

    expect(function () {
      bob.save();
    }).to.throw('sworm has not been configured to a database');
  });
});
