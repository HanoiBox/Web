'use strict';

var Advert = require("../models/advert").advert;
var Category = require("../models/advert").category;

var advertRepository = (function () {

	var saveAdvert = function (advert) {
		try {
			var newAdvert = new Advert();
			newAdvert.categories = advert.categories;
			newAdvert.information = advert.information;
			newAdvert.save();
			return true;
		} catch (error) {
			console.error(error.toString());
			return false;
		}
	};

	var findAdverts = function (callback) {
		Advert.find(function (err, adverts) {
			if (err) {
				return callback(err);
			}
			return callback(adverts);
		});
	};

	var getAdvert = function (id, callback) {
		Advert.findById(id, (err, advert) => {
			if (err !== null) {
				return callback({ status: 500, message: "DB Error: " + err });
			}
			if (advert == null || advert._id !== id) {
				return callback({ status: 404, message: "Unable to find advert: " + id });
			}
			return callback({ advert: advert, message: "" });
		});
	};

	var deleteAdvert = function (id, callback) {
		Advert.remove({ _id: id }, error => {
			if (error) {
				return callback({ status: 500, message: "DB Error: " + error });
			}
			return callback({ status: 200, message: "" });
		});
	};

	var updateAdvert = (currentAdvert, newAdvertData, callback) => {
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