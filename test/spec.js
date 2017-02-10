var sworm = require("..");
var chai = require("chai");
var expect = chai.expect;
var unescape = require('../unescape')

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

  describe('escape', function() {
    it('escapes any number of single quotes', function () {
      expect(sworm.escape("this is bob's and katie's address")).to.equal("'this is bob''s and katie''s address'")
    });
  })

  describe('interpolate', function() {
    it('interpolates unescaped parameters', function () {
      expect(unescape.interpolate('select * from people where name = @name', {name: unescape("'bob'")})).to.eql(
        {
          query: "select * from people where name = 'bob'",
          params: {}
        }
      )
    });

    it("doesn't return unescaped parameters, even if not in the sql", function () {
      expect(unescape.interpolate('select * from people', {name: unescape("'bob'")})).to.eql(
        {
          query: "select * from people",
          params: {}
        }
      )
    });

    it("doesn't interpolate non-unescaped parameters", function () {
      expect(unescape.interpolate('select * from people where name = @name', {name: "'bob'"})).to.eql(
        {
          query: "select * from people where name = @name",
          params: {name: "'bob'"}
        }
      )
    });

    it("doesn't interpolate non-specified parameters", function () {
      expect(unescape.interpolate('select * from people where name = @name', {})).to.eql(
        {
          query: "select * from people where name = @name",
          params: {}
        }
      )
    });
  })
});
