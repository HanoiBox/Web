"use strict";

var categoryRepository = require("../repositories/categoryRepository");

var categoryService = (function () {

	var findCategories = function findCategories(callback) {
		categoryRepository.findCategories(function (result) {
			return callback(result);
		});
	};

	var deleteCategory = function deleteCategory(id, callback) {
		categoryRepository.deleteCategory(id, function (result) {
			if (result != "" && result.message !== "") {
				return callback(result);
			} else {
				return callback({ status: 200, message: "OK" });
			}
		});
	};

	return {
		findCategories: findCategories,
		deleteCategory: deleteCategory
	};
})();

module.exports = categoryService;