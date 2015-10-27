var Category = require("../models/advert").category;
var advertRepository = require("../repositories/advertRepository");

var advertService = function() {
	
	function validateAdvertData(advertData) {
		if (advertData == null)
		{
			return "This advert was completely empty";
		}
		if (advertData.information === "")
		{
			return "This advert did not have any information to save";
		}
		return advertData;
	}
	
	var saveAdvert = (advertData, callback) => {
		var advert = validateAdvertData(advertData);
		
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
			
			if (advertRepository.saveAdvert(advert))
			{
				callback();
			} else {
				callback("Unable to save the advert");
			}
			
		}).catch(function(reason) {
			console.log('Handle rejected promise ('+reason+') here.');
		});	
	};
	
	var findAdverts = function(callback)
	{
		advertRepository.findAdverts(function(result) {
			callback(result);
		});
	}
	
	var getAdvert = function (id, callback)
	{
		advertRepository.getAdvert(id, function(advert) {
			callback(advert);	
		});
	}
	
	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert
	};
	
}();

module.exports = advertService;