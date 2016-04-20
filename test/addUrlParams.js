var modifyUrl = require('./modifyUrl');
var _ = require('underscore');

module.exports = function(url, extras) {
  return modifyUrl(url, parsedUrl => {
    _.extend(parsedUrl.query, extras);
  });
};
