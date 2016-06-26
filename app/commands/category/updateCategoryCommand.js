'use strict';
let categoryRepository = require("../../repositories/categoryRepository");
let categoryValidation = require("./validateCategory");
var httpStatus = require('../../httpStatus');
var dataCleaner = require('./dataCleaner');

let categoryCommand = function () {
    let updateCategoryRepository = (existingCategory, categoryData, callback) => {
        categoryRepository.updateCategory(existingCategory, categoryData, (result) => {
            return callback(result);
        });
    }
    
    let updateCategory = (id, categoryData, callback) => {
        let validationResult = categoryValidation.validate(categoryData);
        
		if (validationResult !== null) {
			return callback(validationResult);
		}
        categoryData = dataCleaner.cleanseCategory(categoryData);
        
		let getCategoryPromise = new Promise((resolve, reject) => {
			categoryRepository.getCategory(id, (result) => {
				if (result.status !== httpStatus.OK) {
                    reject(result);
                }
				resolve(result.category);
			});
		});

		getCategoryPromise.then((category) => {
            
            if (categoryData.parentCategoryId !== undefined && categoryData.parentCategoryId !== null) {
                console.log("doing parent cat stuff ");
                let getParentCategoryPromise = new Promise((resolve, reject) => {
                    categoryRepository.getCategory(categoryData.parentCategoryId, (result) => {
                        if (result.status !== httpStatus.OK) {
                            reject(result);
                        }
                        resolve(result.category);
                    });
                });
                
                getParentCategoryPromise.then((parentCategory) => {
                    var thisParentCategory = parentCategory;
                    updateCategoryRepository(category, categoryData, (result) => {
                        result.category.parentCategory = thisParentCategory;
                        return callback(result);
                    });
                }).catch((failureReasonObject) => {
                    return callback(failureReasonObject);
                });
                
            } else {
                updateCategoryRepository(category, categoryData, (result) => {
                    return callback(result);
                });
            }
		}).catch((failureReasonObject) => {
            console.debug("soemthing went wrong" + failureReasonObject);
			return callback(failureReasonObject);
		});
    }
    
    return { 
        updateCategory: updateCategory
    }
    
}();

module.exports = categoryCommand;