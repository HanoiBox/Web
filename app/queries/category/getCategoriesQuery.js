'use strict';
let categoryRepository = require("../../repositories/categoryRepository");
let categoryQuery = require("./getCategoryQuery");

var categoriesQuery = function () {
    
    let categoriesWithParentPopulated = [];
    let parentCategories = [];
    
    let populateParentCategories = (category) => {
        if (category.parentCategoryId !== undefined && category.parentCategoryId !== null)
        {
            let parentCategory = parentCategories.find(pCat => pCat._id === category.parentCategoryId);
            if (parentCategory !== undefined) {
                category.parentCategory = parentCategory;
                categoriesWithParentPopulated.push(category);
            } else {
                categoryQuery.getCategory(category.parentCategoryId, (result) => {
                    category.parentCategory = result.category;
                    parentCategories.push(result.category);
                    categoriesWithParentPopulated.push(category);
                });
            }
        }
    }
    
    return { 
        getBackendCategories: (callback) => {
            categoryRepository.findCategories((result) => {
                
                if (result.status === 200) {
                    result.categories.forEach((category) => {
                        populateParentCategories(category);
                    });
                    result.categories = categoriesWithParentPopulated;
                    categoriesWithParentPopulated = [];
                    parentCategories = [];
                    return callback(result);
                } else {
                    return callback(result);
                }
            });
        }
    }
}();

module.exports = categoriesQuery;