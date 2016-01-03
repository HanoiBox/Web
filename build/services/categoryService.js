"use strict";

var categoryRepository = require("../repositories/categoryRepository");

var categoryService = (function () {
	var validateCategoryData = function validateCategoryData(categoryData) {
		if (categoryData == null) {
			return "No category object could be constructed";
		}
		if (categoryData.description === undefined || categoryData.description === "") {
			return "No English category description was given";
		}
		if (categoryData.vietDescription === undefined || categoryData.vietDescription === "") {
			return "No Vietnamese category description was given";
		}
		if (categoryData.level === undefined || categoryData.level === null) {
			return "No navigation level was given";
		}
		return "";
	};

	var saveCategory = function saveCategory(categoryData, callback) {
		var validationResult = validateCategoryData(categoryData);
		if (validationResult !== "") {
			return callback({ status: 400, message: validationResult });
		}

		var findAllCategoryPromise = new Promise(function (resolve, reject) {
			categoryRepository.findCategories(function (result) {
				if (result.error !== undefined && result.error !== "") {
					reject({ status: result.status, message: "Handler rejected because : " + result.error });
				} else {
					resolve(result.categories);
				}
			});
		});

		findAllCategoryPromise.then(function (categories) {
			categories.forEach(function (category) {
				if (category.description === categoryData.description) {
					return callback({ status: 400, message: "Duplicate description" });
				}
			});

			saveCategoryToDb(categoryData, function (result) {
				return callback(result);
			});
		}).catch(function (reason) {
			return callback(reason);
		});
	};

	var saveCategoryToDb = function saveCategoryToDb(category, callback) {
		categoryRepository.saveCategory(category, function (result) {
			if (result.error !== null) {
				return callback({ status: 500, message: result.error });
			} else {
				return callback({ status: 200, message: "OK", category: result.category });
			}
		});
	};

	var getcategory = function getcategory(id, callback) {
		categoryRepository.getCategory(id, function (result) {
			if (result.message !== undefined && result.message !== "") {
				return callback(result);
			} else {
				return callback({ status: 200, message: result.message, category: result.category });
			}
		});
	};

	var findCategories = function findCategories(callback) {
		categoryRepository.findCategories(function (result) {
			if (result.message !== undefined && result.error !== "") {
				return callback(result);
			} else {
				return callback({ status: 200, message: "OK", categories: result.categories });
			}
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

	var updatecategory = function updatecategory(id, categoryData, callback) {
		var validationResult = validateCategoryData(categoryData);
		if (validationResult !== "") {
			return callback({ status: 400, message: validationResult });
		}

		var getcategoryPromise = new Promise(function (resolve, reject) {
			categoryRepository.getCategory(id, function (result) {
				if (result === null || result.category === null) {
					reject("category could not be found");
				}
				resolve(result.category);
			});
		});

		getcategoryPromise.then(function (category) {
			categoryRepository.updateCategory(category, categoryData, function (error) {
				if (error != "") {
					return callback({ status: 500, message: error });
				}
				return callback({ status: 200, message: "OK" });
			});
		}).catch(function (reason) {
			var errorMsg = 'getcategoryPromise handle rejected promise (' + reason + ') here.';
			console.error(errorMsg);
			return callback({ status: 404, message: errorMsg });
		});
	};

	return {
		saveCategory: saveCategory,
		findCategories: findCategories,
		getCategory: getcategory,
		deleteCategory: deleteCategory,
		updateCategory: updatecategory
	};
})();

module.exports = categoryService;