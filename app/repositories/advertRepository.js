'use strict';
var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = function() {
	
	function validateAdvertData(advertData, callback) {
		if (advertData == null)
		{
			return callback("This advert was completely empty");
		}
		if (advertData.information === "")
		{
			return callback("This advert did not have any information to save");
		}
		return advertData;
	}
	
	var saveAdvert = function(advertData, callback) {
		var advert = validateAdvertData(advertData, callback);	
		console.info("hello");
		
		var newAdvert = new Advert();
		
		if (advert.categories != null)
		{
			// check category numbers are ok
			var allCategoriesPromise = new Promise( function(resolve, reject) {
				Category.find(function(err, categories)
				{
					if (err)
						reject("could not retrieve categories")
					resolve(categories)
				})
			});
			allCategoriesPromise.then(function(categories) {
				console.info(categories);
				var reformattedArray = categories.map(category => { return category._id });
				console.info(reformattedArray) 
				var allOk = advert.categories.includes(reformattedArray);
				if (!allOk) {
					callback("Unable to save the advert because the categories given are invalid" + advert.categories);
				}
				newAdvert.categories = advert.categories;
				
				//newAdvert._id = 1;
				newAdvert.information = advert.information;
				newAdvert.save();
				console.log("saved advert");
				callback("ok");
				
			}).catch(function(reason) {
				console.log('Handle rejected promise ('+reason+') here.');
			});
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