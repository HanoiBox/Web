'use strict';

var categoryRepository = require("../../repositories/categoryRepository");
var categoryValidation = require("./validateCategory");
var httpStatus = require('../../httpStatus');
var dataCleaner = require('./dataCleaner');

var categoryCommand = (function () {

    var saveCategory = function saveCategory(categoryData, callback) {
        var validationResult = categoryValidation.validate(categoryData);
        if (validationResult !== null) {
            return callback(validationResult);
        }
        categoryData = dataCleaner.cleanseCategory(categoryData);

        var findAllCategoryPromise = new Promise(function (resolve, reject) {
            categoryRepository.findCategories(function (result) {
                if (result.error !== undefined && result.error !== "") {
                    reject("Handler rejected because : " + result.error);
                } else {
                    resolve(result.categories);
                }
            });
        });

        findAllCategoryPromise.then(function (categories) {
            var parentCategoryId = null,
                categoryExists = false;

            if (categoryData.parentCategoryId !== undefined && categoryData.parentCategoryId !== null) {
                parentCategoryId = parseInt(categoryData.parentCategoryId, 10);
            }

            categories.forEach(function (category) {
                if (parentCategoryId !== NaN && category._id === parentCategoryId) {
                    categoryExists = true;
                    categoryData.parentCategoryId = parentCategoryId;
                }
                if (category.description === categoryData.description) {
                    return callback({ status: 400, message: "Duplicate description" });
                }
            });

            if (parentCategoryId !== null && !categoryExists) {
                return callback({ status: 500, message: "The parent category does not exist" });
            }

            categoryRepository.saveCategory(categoryData, function (result) {
                return callback(result);
            });
        }).catch(function (error) {
            return callback({ status: 404, message: error });
        });
    };

    return {
        saveCategory: saveCategory
    };
})();

module.exports = categoryCommand;