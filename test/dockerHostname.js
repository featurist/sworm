var urlUtils = require('url');

if (process.env.DOCKER_HOST) {
  var url = urlUtils.parse(process.env.DOCKER_HOST);
  module.exports = url.hostname;
} else {
  module.exports = 'localhost';
}
