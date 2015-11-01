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
	
	var findAdverts = function(callback)
	{
		advertRepository.findAdverts(function(result) {
			callback(result);
		});
	}
	
	var getAdvert = function (id, callback)
	{
		advertRepository.getAdvert(id, function(advert) {
			callback({ status : 200, message : "OK", advert: advert });	
		});
	}
	
	var deleteAdvert = (id, callback) => {
		advertRepository.deleteAdvert(id, function(result) {
			if (result.error)
				return callback({ status : 500, message: result.error });
			return callback({ status : 200, message : "OK" });
		});
	}
	
	var updateAdvert = (advertData, callback) => {
		var getAdvertPromise = new Promise((resolve, reject) => {
			advertRepository.getAdvert(advertData.id, (advert) => {
				if (advert === null)
					reject("advert could not be found");
				resolve(advert);
			});
		});
		
		getAdvertPromise.then((advert) => {
			advertRepository.updateAdvert(advert, advertData, (error) => {
				if (error)
					return callback({ "status" : 500, "message": error});
				return callback({ "status" : 200, "message" : "OK"});
			});
		}).catch((reason) => {
			var errorMsg = 'getAdvertPromise handle rejected promise ('+reason+') here.';
			console.error(errorMsg);
			return callback({ "status" : 500, "message": errorMsg});
		});
	}
	
	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert,
		deleteAdvert : deleteAdvert,
		updateAdvert: updateAdvert
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
			if (result.valid)
			{
				return callback({ message : "", advert : advertData });	
			} else {
				if (result.message !== undefined && result.message !== "")
				{
					return callback({ message : result.message });	
				}
				return callback({ message : "This advert had some invalid categories, please check and try again" });	
			}
		});
	}
	
	function categoriesAreValid(advertData, callback)
	{
		// get the categories
		var getAllCategoriesPromise = new Promise((resolve, reject) => {
			categoryRepository.find((err, categories) => {
					if (err)
						reject("Error occured when retrieving categories" + err);
					if (categories !== null)
						resolve(categories)	
					reject("There are no pre-existing categories")
				});
		});
		
		// check category numbers are ok
		getAllCategoriesPromise.then((categories) => {
			var existingCategories = categories.map(category => { return category._id });
			function isValid(advertCategoryId, index, array) {
				function exists(existingCategoryId, index, array) {
					return existingCategoryId === advertCategoryId;
				}
				return existingCategories.some(exists);
			}
			
			if (advertData.categories.every(isValid))
			{
				return callback({ "valid" : true });
			}
			return callback({ "valid" : false });
			
		}).catch((reason) => {
			var errorMsg = 'getAllCategoriesPromise handle rejected promise ('+reason+') here.';
			console.error(errorMsg);
			return callback({ "valid" : false, "message" : errorMsg });
		});	
	}
	
}();

module.exports = advertService;