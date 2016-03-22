'use strict';

var mongoose = require('mongoose');
var autoIncrement = require('mongoose-auto-increment');

module.exports = {
    connect: function connect(devEnvironment, envVariables) {
        var connection = "";
        if (devEnvironment) {
            connection = mongoose.connect("mongodb://hbsa:3cyWCfIr@ds054118.mongolab.com:54118/hanoiboxtest"); // test db
            autoIncrement.initialize(connection);
        } else {
            var connectionString = "mongodb://" + envVariables.hanoiboxuser + ":" + envVariables.hanoiboxpassword + "@ds" + envVariables.hanoiboxport + ".mongolab.com:" + envVariables.hanoiboxport + "/hanoibox";
            connection = mongoose.connect(connectionString); // live db
            autoIncrement.initialize(connection);
        }
    }
};