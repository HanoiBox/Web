'use strict';

var mongoose = require('mongoose');
var autoIncrement = require('mongoose-auto-increment');

module.exports = {
    connect: function connect(devEnvironment) {
        var connection = "";
        if (devEnvironment) {
            connection = mongoose.connect("mongodb://hbsa:3cyWCfIr@ds048368.mongolab.com:48368/hanoiboxtest"); // test db
            autoIncrement.initialize(connection);
        } else {
            connection = mongoose.connect("mongodb://hbsa:vc41u0j@ds048368.mongolab.com:48368/hanoibox"); // live db
            autoIncrement.initialize(connection);
        }
    }
};