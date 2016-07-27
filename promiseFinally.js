module.exports = function(value, cb) {
  return value.then(
    value => Promise.resolve(cb()).then(() => value),
    reason => Promise.resolve(cb()).then(() => Promise.reject(reason))
  )
}
