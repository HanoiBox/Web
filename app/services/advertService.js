var categoryRepository = require("../repositories/categoryRepository");
var advertRepository = require("../repositories/advertRepository");

var advertService = function() {
	
	var saveAdvert = (advertData, callback) => {
		validateAdvertData(advertData, function(advertResult) {
			if (advertResult.message !== "")
			{
				return callback(advertResult.message);
			}
			var advert = advertResult.advert;
			
			if (advertRepository.saveAdvert(advert))
			{
				return callback("");
			} else {
				return callback("Unable to save the advert");
			}
		});
	};
	
	function validateAdvertData(advertData, callback) {
		if (advertData === null)
		{
			return callback({ message : "This advert was completely empty" });
		}
		if (advertData.information === "")
		{
			return callback({ message : "This advert did not have any information to save" });
		}
		if (advertData.categories === null || !Array.isArray(advertData.categories) || advertData.categories.length === 0)
		{
			return callback({ message : "This advert did not have any categories, there must be at least one category given" });
		}
		
		categoriesAreValid(advertData, (result) => {
			if (result)
			{
				return callback({ message : "", advert : advertData });	
			} else {
				return callback({ message : "This advert had some invalid categories, please check and try again" });	
			}
		});
	}
	
	function categoriesAreValid(advertData, callback)
	{
		// get the categories
		 var allCategoriesPromise = new Promise((resolve, reject) => {
			categoryRepository.find((err, categories) => {
					if (err)
						reject("Error occured when retrieving categories" + err);
					if (categories !== null)
						resolve(categories)	
					reject("There are no pre-existing categories")
				});
		});
		
		// check category numbers are ok
		allCategoriesPromise.then((categories) => {
			var existingCategories = categories.map(category => { return category._id });
			function isValid(advertCategoryId, index, array) {
				function exists(existingCategoryId, index, array) {
					return existingCategoryId === advertCategoryId;
				}
				return existingCategories.some(exists);
			}
			
			if (advertData.categories.every(isValid))
			{
				return callback(true);
			}
			return callback(false);
			
		}).catch(function(reason) {
			console.log('Handle rejected promise ('+reason+') here.');
			return callback(false);
		});	
	}
	
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