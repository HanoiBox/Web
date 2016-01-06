'use strict';
var categoryRepository = require("../../repositories/categoryRepository");

var categoryQuery = function () {    
    let getCategory = (id, callback) => {
        
        categoryRepository.getCategory(id, (result) => {
            console.log("get here", result);
            if (result.category !== null && result.category.parentCategoryId !== undefined && result.category.parentCategoryId !== null) {
                categoryRepository.getCategory(result.category.parentCategoryId, (parentRes) => {
                    result.category.parentCategory = parentRes.category;
                    return callback(result);
                });
            }
            return callback(result);
        });
    };
        
    return { 
        getCategory: getCategory
    }
    
}();

module.exports = categoryQuery;