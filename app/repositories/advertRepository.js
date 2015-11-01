'use strict';
var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = function() {
	
	var saveAdvert = function(advert) {
		try {
			var newAdvert = new Advert();
			newAdvert.categories = advert.categories;
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
		Advert.findOne({ '_id': id },(advert) => {
			if (advert == null || advert._id !== id)
			{
				callback({ Success : false, Message : "Unable to find advert: " + id });
			}
			callback(advert);
		});
	}
	
	var deleteAdvert = function(id, callback)
	{
		Advert.remove({ _id : id }, (error) => {
			if (error)
				console.error(error);
				return false;
			return true;
		});
	}
	
	var updateAdvert = (currentAdvert, newAdvertData, callback) => {
		try {
			if (newAdvertData.information !== null)
			{
				currentAdvert.information = newAdvertData.information;	
			}
			if (newAdvertData.categories !== null)
			{
				currentAdvert.categories = newAdvertData.categories;
			}
			currentAdvert.Save();	
			return callback("")
		} catch(error) {
			return callback(error);
		}
	}
	
	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert,
		deleteAdvert: deleteAdvert,
		updateAdvert: updateAdvert
	};
	
}();

module.exports = advertRepository;