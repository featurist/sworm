var urlUtils = require('url');
var os = require('os');

if (process.env.DOCKER_HOST) {
  var url = urlUtils.parse(process.env.DOCKER_HOST);
  module.exports = url.hostname;
} else {
  if (/darwin/i.test(os.type())) {
    module.exports = '192.168.64.2';
  } else {
    module.exports = 'localhost';
  }
}
