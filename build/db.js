'use strict';

var mongoose = require('mongoose');
var autoIncrement = require('mongoose-auto-increment');

module.exports = {
    connect: function connect(devEnvironment, envVariables) {
        if (devEnvironment) {
            var testConnection = mongoose.connect("mongodb://hbsa:3cyWCfIr@ds054118.mongolab.com:54118/hanoiboxtest"); // test db
            autoIncrement.initialize(testConnection);
        } else {
            var connectionString = "mongodb://" + envVariables.hanoiboxuser + ":" + envVariables.hanoiboxpassword + "@ds0" + envVariables.hanoiboxport + ".mongolab.com:" + envVariables.hanoiboxport + "/" + envVariables.hanoiboxdbname;
            var liveConnection = mongoose.connect(connectionString); // live db
            autoIncrement.initialize(liveConnection);
        }
    }
};