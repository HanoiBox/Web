// Karma configuration
// Generated on Sat Nov 21 2015 15:07:02 GMT+0000 (GMT Standard Time)

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',


    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jspm', 'jasmine', 'requirejs'],

    //list of files / patterns to load in the browser
    files: [
      // 'sysadmin/app/routes/index/indexControllerSpec.js',
      // 'sysadmin/app/routes/index/indexController.js'
      
      // {pattern: '*Spec.js', included: false}
      // {pattern: 'sysadmin/*Spec.js', included: false},
      // {pattern: 'sysadmin/**/*Spec.js', included: false},
      // {pattern: '**/*Spec.js', included: false}
    ],
    
    jspm: {
        // NB. tests or controllers which exist in both areas with the same name
        // causes serious confusion and grief for me and my Karma GF 16/01/2016 
      loadFiles: ['sysadmin/app/**/*.js', 'public/app/**/*.js']
    },


    // list of files to exclude
    exclude: [
    ],


    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress'],


    // web server port
    port: 9876,


    // enable / disable colors in the output (reporters and logs)
    colors: true,


    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,


    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,


    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['Chrome'],


    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,

    // Concurrency level
    // how many browser should be started simultanous
    concurrency: Infinity
  })
}
