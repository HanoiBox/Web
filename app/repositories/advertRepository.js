'use strict';

var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = (function () {

	var saveAdvert = function saveAdvert(advert) {
		try {
			var newAdvert = new Advert();
			newAdvert.categories = advert.categories;
			newAdvert.information = advert.information;
            newAdvert.parentCategoryId = advert.parentCategoryId;
			newAdvert.save();
			return true;
		} catch (error) {
			console.error(error.toString());
			return false;
		}
	};

	var findAdverts = function findAdverts(callback) {
		Advert.find(function (err, adverts) {
			if (err) {
				return callback(err);
			}
			return callback(adverts);
		});
	};

	var getAdvert = function getAdvert(id, callback) {
		Advert.findById(id, function (err, advert) {
			if (err !== null) {
				return callback({ status: 500, message: "DB Error: " + err });
			}
			if (advert == null || advert._id !== id) {
				return callback({ status: 404, message: "Unable to find advert: " + id });
			}
			return callback({ advert: advert, message: "" });
		});
	};

	var deleteAdvert = function deleteAdvert(id, callback) {
		Advert.remove({ _id: id }, function (error) {
			if (error) {
				return callback({ status: 500, message: "DB Error: " + error });
			}
			return callback({ status: 200, message: "" });
		});
	};

	var updateAdvert = function updateAdvert(currentAdvert, newAdvertData, callback) {
		try {
			if (newAdvertData.information !== undefined && newAdvertData.information !== null) {
				currentAdvert.information = newAdvertData.information;
			}
			if (newAdvertData.categories !== undefined && newAdvertData.categories !== null) {
				currentAdvert.categories = newAdvertData.categories;
			}
			currentAdvert.save();
			return callback("");
		} catch (error) {
			return callback(error.toString());
		}
	};

	return {
		saveAdvert: saveAdvert,
		findAdverts: findAdverts,
		getAdvert: getAdvert,
		deleteAdvert: deleteAdvert,
		updateAdvert: updateAdvert
	};
})();

module.exports = advertRepository;