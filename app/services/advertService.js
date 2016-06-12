"use strict";
var categoryRepository = require("../repositories/categoryRepository");
var advertRepository = require("../repositories/advertRepository");
var uploadImageCommand = require("../commands/listing/uploadImageToCloudinaryCommand");
require('babel-polyfill');

var advertService = (function () {

	var saveAdvert = function saveAdvert(advertData, callback) {
		validateAdvertData(advertData, function (advertResult) {
			if (advertResult.message !== "") {
				return callback(advertResult.message);
			}
			var advert = advertResult.advert;

			if (advertRepository.saveAdvert(advert)) {
				return callback("");
			} else {
				return callback("Unable to save the advert");
			}
		});
	};

	var findAdverts = function findAdverts(callback) {
		advertRepository.findAdverts(function (result) {
			callback(result);
		});
	};

	var getAdvert = function getAdvert(id, callback) {
		advertRepository.getAdvert(id, function (result) {
			if (result.message !== "") {
				return callback({ status: result.status, message: result.message });
			}
			callback({ status: 200, message: "OK", advert: result.advert });
		});
	};

	var deleteAdvert = function deleteAdvert(id, callback) {
		advertRepository.deleteAdvert(id, function (result) {
			if (result.message !== "") {
				return callback({ status: result.status, message: result.message });
			}
			return callback({ status: 200, message: "OK" });
		});
	};

	var updateAdvert = function updateAdvert(id, advertData, callback) {
		var getAdvertPromise = new Promise(function (resolve, reject) {
			advertRepository.getAdvert(id, function (result) {
				if (result.message !== "") reject(result.message);
				resolve(result.advert);
			});
		});

		getAdvertPromise.then(function (advert) {
			advertRepository.updateAdvert(advert, advertData, function (error) {
				if (error) return callback({ "status": 500, "message": error });
				return callback({ "status": 200, "message": "OK" });
			});
		}).catch(function (reason) {
			var errorMsg = 'getAdvertPromise handle rejected promise (' + reason + ') here.';
			return callback({ "status": 500, "message": errorMsg });
		});
	};

	let uploadAdvert = (fileData) => {
		return uploadImageCommand.upload(fileData);
	};

	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert,
		deleteAdvert: deleteAdvert,
		updateAdvert: updateAdvert,
		uploadAdvert: uploadAdvert
	};

	function isEmpty(obj) {
		for (var prop in obj) {
			if (obj.hasOwnProperty(prop)) return false;
		}
		return true;
	}

	function validateAdvertData(advertData, callback) {
		if (isEmpty(advertData)) {
			return callback({ message: "This advert was completely empty" });
		}
		if (advertData.information === undefined || advertData.information === "") {
			return callback({ message: "This advert did not have any information to save" });
		}
		if (advertData.category === undefined || advertData.category === "" || advertData.category === null || advertData.category === "null") {
			return callback({ message: "This advert did not have any categories, there must be at least one category given" });
		}
		advertData.categories = [
			advertData.category
		];
		if (!Array.isArray(advertData.categories) || advertData.categories.length === 0) {
			return callback({ message: "This advert did not have any categories, there must be at least one category given" });
		}

		categoriesAreValid(advertData, function (result) {
			if (result.valid) {
				return callback({ message: "", advert: advertData });
			} else {
				if (result.message !== undefined && result.message !== "") {
					return callback({ message: result.message });
				}
				return callback({ message: "This advert had some invalid categories, please check and try again" });
			}
		});
	}

	function categoriesAreValid(advertData, callback) {
		// get the categories
		var getAllCategoriesPromise = new Promise(function (resolve, reject) {
			categoryRepository.findCategories(function (result) {
				if (result.error) reject("Error occured when retrieving categories" + result.error);
				if (result.categories !== null) resolve(result.categories);
				reject("There are no pre-existing categories");
			});
		});

		// check category numbers are ok
		getAllCategoriesPromise.then(function (categories) {
			var existingCategoryIds = categories.map((category) => {
				return { id: category._id };
			}),
			isOk = true;

			// for(var category of advertData.categories) {
			// 	if (existingCategoryIds.filter(id => id === category._id).length === 0)
			// 	{
			// 		isOk = false;
			// 	}
			// };
				
			if (isOk)
			{
				return callback({ "valid": true });
			} else {
				return callback({ "valid": false });
			}
		}).catch(function (reason) {
			var errorMsg = 'getAllCategoriesPromise handle rejected promise (' + reason + ') here.';
			console.error(errorMsg);
			return callback({ "valid": false, "message": errorMsg });
		});
	}
})();

module.exports = advertService;