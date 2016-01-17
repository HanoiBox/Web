'use strict';
let categoryRepository = require("../../repositories/categoryRepository");

var categoriesQuery = function () {
    
    let parentCategories = [];
    
    let getParentCategory = (childCategoryId, parentCategoryId, allCategories, callback) => {
        if (parentCategoryId !== undefined && parentCategoryId !== null)
        {
            let parentCategory = parentCategories.find(pCat => pCat._id === parentCategoryId);
            if (parentCategory !== undefined) {
                return callback(parentCategory);
            } else {
                parentCategory = allCategories.find(cat => cat._id === parentCategoryId);
                return callback(parentCategory);
            } 
        } else {
            return callback(null);
        }
    }
    
    return { 
        getCategories: (callback) => {
            parentCategories = [];
            
            categoryRepository.findCategories((result) => {
                let categoriesWithParentPopulated = [];
                
                result.categories.forEach((category) => {
                    let currentCategory = category;
                    getParentCategory(category._id, category.parentCategoryId, result.categories, (parentResult) => {
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
    }
}();

module.exports = categoriesQuery;