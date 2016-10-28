module.exports = function(value, cb) {
  return value.then(
    function (value) { return Promise.resolve(cb()).then(function () { return value; }); },
    function (reason) { return Promise.resolve(cb()).then(function() { return Promise.reject(reason); }); }
  )
}
