'use strict';

var categoryRepository = require("../../repositories/categoryRepository");

var categoriesQuery = (function () {

    var parentCategories = [];

    var getParentCategory = function getParentCategory(childCategoryId, parentCategoryId, allCategories, callback) {
        if (parentCategoryId !== undefined && parentCategoryId !== null) {
            var parentCategory = parentCategories.find(function (pCat) {
                return pCat._id === parentCategoryId;
            });
            if (parentCategory !== undefined) {
                return callback(parentCategory);
            } else {
                parentCategory = allCategories.find(function (cat) {
                    return cat._id === parentCategoryId;
                });
                return callback(parentCategory);
            }
        } else {
            return callback(null);
        }
    };

    return {
        getCategories: function getCategories(callback) {
            parentCategories = [];

            categoryRepository.findCategories(function (result) {
                var categoriesWithParentPopulated = [];

                result.categories.forEach(function (category) {
                    var currentCategory = category;
                    getParentCategory(category._id, category.parentCategoryId, result.categories, function (parentResult) {
                        if (parentResult !== null) {
                            currentCategory.parentCategory = parentResult;
                            categoriesWithParentPopulated.push(currentCategory);
                        } else {
                            categoriesWithParentPopulated.push(currentCategory);
                        }
                    });
                });

                return callback({ status: result.status, categories: categoriesWithParentPopulated });
            });
        }
    };
})();

module.exports = categoriesQuery;