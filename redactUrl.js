var urlUtils = require('url');

module.exports = function(url, replacement) {
  var urlComponents = urlUtils.parse(url);
  if (urlComponents.auth) {
    urlComponents.auth = urlComponents.auth.replace(/:.*/, ':' + replacement);

    return urlUtils.format(urlComponents);
  } else {
    return url;
  }
};
