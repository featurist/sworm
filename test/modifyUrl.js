var urlUtils = require('url');

module.exports = function(url, fn) {
  var components = urlUtils.parse(url, true);
  fn(components);
  return urlUtils.format(components);
};
