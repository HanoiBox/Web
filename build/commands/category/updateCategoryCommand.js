'use strict';

var categoryRepository = require("../../repositories/categoryRepository");
var categoryValidation = require("./validateCategory");
var httpStatus = require('../../httpStatus');
var dataCleaner = require('./dataCleaner');

var categoryCommand = (function () {
    var updateCategoryRepository = function updateCategoryRepository(existingCategory, categoryData, callback) {
        categoryRepository.updateCategory(existingCategory, categoryData, function (result) {
            return callback(result);
        });
    };

    var updateCategory = function updateCategory(id, categoryData, callback) {
        var validationResult = categoryValidation.validate(categoryData);
        if (validationResult !== null) {
            return callback(validationResult);
        }
        categoryData = dataCleaner.cleanseCategory(categoryData);

        var getCategoryPromise = new Promise(function (resolve, reject) {
            categoryRepository.getCategory(id, function (result) {
                if (result.status !== httpStatus.OK) {
                    reject(result);
                }
                resolve(result.category);
            });
        });

        getCategoryPromise.then(function (category) {
            if (categoryData.parentCategoryId !== undefined && categoryData.parentCategoryId !== null) {

                var getParentCategoryPromise = new Promise(function (resolve, reject) {
                    categoryRepository.getCategory(categoryData.parentCategoryId, function (result) {
                        if (result.status !== httpStatus.OK) {
                            reject(result);
                        }
                        resolve(result.category);
                    });
                });

                getParentCategoryPromise.then(function (parentCategory) {
                    var thisParentCategory = parentCategory;
                    updateCategoryRepository(category, categoryData, function (result) {
                        result.category.parentCategory = thisParentCategory;
                        return callback(result);
                    });
                }).catch(function (failureReasonObject) {
                    return callback(failureReasonObject);
                });
            } else {
                updateCategoryRepository(category, categoryData, function (result) {
                    return callback(result);
                });
            }
        }).catch(function (failureReasonObject) {
            return callback(failureReasonObject);
        });
    };

    return {
        updateCategory: updateCategory
    };
})();

module.exports = categoryCommand;