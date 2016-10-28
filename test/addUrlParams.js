var modifyUrl = require('./modifyUrl');
var _ = require('underscore');

module.exports = function(url, extras) {
  return modifyUrl(url, function (parsedUrl) {
    _.extend(parsedUrl.query, extras);
  });
};
