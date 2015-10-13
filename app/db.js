var mongoose = require('mongoose');

module.exports = {
	connect: function () {
		// Mongo db setup
		mongoose.connect('mongodb://hbsa:vc41u0j@ds048368.mongolab.com:48368/hanoibox'); //connection string
	}
};