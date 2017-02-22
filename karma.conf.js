module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['browserify', 'mocha'],
    files: [
      'test/websqlSpec.js'
    ],
    preprocessors: {
      'test/websqlSpec.js': ['browserify']
    },
    browserify: {
      debug: true
    },
    exclude: [],
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ['Chrome'],
    singleRun: false,
    concurrency: Infinity
  })
}
