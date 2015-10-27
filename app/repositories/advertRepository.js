'use strict';
var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = function() {
	
	var saveAdvert = function(advert) {
		try {
			var newAdvert = new Advert();
			newAdvert.categories = advert.categories;
			
			//newAdvert._id = 1;
			newAdvert.information = advert.information;
			newAdvert.save();
			console.log("saved advert");
			return true;
		} catch(error) {
			console.error(error);
			return false;
		}
	};
	
	var findAdverts = function(callback)
	{
		Advert.find(function(err, adverts) {
			
			if (err)
				callback(err);
			
			console.log("got some adverts", adverts);
			callback(adverts);
		});
	};
	
	var getAdvert = function(id, callback)
	{
		Advert.findOne(function(ad) {
			if (ad._id == id)
			{
				callback({ Success : false, Message : "Unable to find advert: " + id });
			}
			callback(ad);
		});
	}
	
	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert
	};
	
}();

module.exports = advertRepository;