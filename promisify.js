module.exports = function(fn) {
  return new Promise(function(fulfill, reject) {
    try {
      fn(function(error, result) {
        if (error) {
          reject(error);
        } else {
          fulfill(result);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
};
