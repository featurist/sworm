module.exports = function(name) {
  try {
    return require(name);
  } catch (e) {
    if (e.code === "MODULE_NOT_FOUND") {
      throw new Error(name + " driver not found, please install it with: npm install " + name);
    } else {
      throw e;
    }
  }
};
