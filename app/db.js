var mongoose = require('mongoose');
var autoIncrement = require('mongoose-auto-increment');

module.exports = {
	connect: function () {
		// Mongo db setup
		var connection = mongoose.connect('mongodb://hbsa:vc41u0j@ds048368.mongolab.com:48368/hanoibox'); //connection string
		autoIncrement.initialize(connection);
	}
};