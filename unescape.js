var paramRegex = require('./paramRegex')
var _ = require('underscore')

function Unescape(value) {
  this.value = value
}

module.exports = unescape

function unescape(value) {
  return new Unescape(value)
}

unescape.isUnescape = function (value) {
  return value instanceof Unescape
}

unescape.interpolate = function(query, params) {
  var driverParams = _.omit(params, function (value) {
    return unescape.isUnescape(value)
  })

  var interpolatedQuery = query.replace(paramRegex, function(_, name) {
    if (params.hasOwnProperty(name)) {
      var value = params[name]
      if (unescape.isUnescape(value)) {
        delete driverParams[name]
        return value.value
      } else {
        return _
      }
    } else {
      return _
    }
  })

  return {
    query: interpolatedQuery,
    params: driverParams
  }
}
