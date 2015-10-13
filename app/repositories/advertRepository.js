'use strict';
var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = function() {
	
	function validateAdvertData(advertData, callback) {
		if (advertData == null)
		{
			callback("This advert was completely empty");
		}
		if (advertData.information === "")
		{
			callback("This advert did not have any information to save");
		}
	}
	
	var saveAdvert = function(advertData, callback) {
		var advert = validateAdvertData(advertData, callback);	
		
		try
		{
			var newAdvert = new Advert();
			
			if (advert.categories != null)
			{
				// check category numbers are ok
				// Need babel or harmony for this - too hard to think of alternative
				// var allOk = advert.categories.all(adCat => Category.findOne(cat => cat._id == adCat._id) != null);
				// if (!allOk) {
				// 	callback("Unable to save the advert because the categories given are invalid" + advertData);
				// }
				newAdvert.categories = advert.categories;
			}
			
			//newAdvert._id = 1;
			newAdvert.information = advert.information;
			newAdvert.save();
			console.log("saved advert");
			callback();
		}
		catch (err)
		{
			callback("Problem saving advert to mongo db: " + err);	
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