'use strict';

var categoryRepository = require("../../repositories/categoryRepository");

var categoryQuery = function () {

    var getCategory = function getCategory(id, callback) {
        categoryRepository.getCategory(id, function (result) {

            if (result.category !== null && result.category.parentCategoryId !== undefined && result.category.parentCategoryId !== null) {
                categoryRepository.getCategory(result.category.parentCategoryId, function (parentRes) {
                    result.category.parentCategory = parentRes.category;
                    return callback(result);
                });
            }

            return callback(result);
        });
    };

    return {
        getCategory: getCategory
    };
}();

module.exports = categoryQuery;