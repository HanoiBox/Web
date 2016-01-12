'use strict';
let categoryRepository = require("../../repositories/categoryRepository");

let categoryQuery = function() {    
    
    let getCategory = (id, callback) => { 
        categoryRepository.getCategory(id, (result) => {
            
            if (result.category !== null && result.category.parentCategoryId !== undefined && result.category.parentCategoryId !== null) {
                categoryRepository.getCategory(result.category.parentCategoryId, (parentRes) => {
                    result.category.parentCategory = parentRes.category;
                    return callback(result);
                });
            }
            
            return callback(result);
        });
    }
        
    return { 
        getCategory: getCategory
    }
    
}();

module.exports = categoryQuery;