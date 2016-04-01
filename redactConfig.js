var redactUrl = require('./redactUrl');

module.exports = function(config) {
  var copy = JSON.parse(JSON.stringify(config));
  if (copy.url) {
    copy.url = redactUrl(copy.url, '********');
  }

  if (copy.config && copy.config.password) {
    copy.config.password = '********';
  }

  return copy;
};
