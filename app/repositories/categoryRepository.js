'use strict';

var Category = require("../models/advert").category;
var httpStatus = require("../httpStatus");

var categoryRepository = (function () {
    
    var getCategory = (id, callback) => {
		Category.findById(id, (err, category) => {
            if (err) {
				console.error("Mongo error: " + err);
				return callback({ status: httpStatus.INTERNAL_SERVER_ERROR, message: "Mongo error: " + err });
			}
			if (category === null || category._id !== id) {
				return callback({ status: httpStatus.NOT_FOUND, message: "Unable to find category: " + id });
			}
            return callback({ status: httpStatus.OK, category: category });
		});
	};
    
	var saveCategory = (categoryData, callback) => {
        var newCategory = new Category();
        newCategory.description = categoryData.description;
        newCategory.vietDescription = categoryData.vietDescription;
        newCategory.level = categoryData.level;
        if (categoryData.parentCategoryId !== undefined && categoryData.parentCategoryId !== null) {
            newCategory.parentCategoryId = categoryData.parentCategoryId; 
        }
        newCategory.save((error) => {
            if (error) {
                return callback({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error });
            }
            
            if (newCategory.parentCategoryId !== undefined && categoryData.parentCategoryId !== null) { 
                getCategory(newCategory.parentCategoryId, (result) => {
                    newCategory.parentCategory = result.category;
                    return callback({ status: httpStatus.CREATED, category: newCategory }); 
                });
            } else {
                 return callback({ status: httpStatus.CREATED, category: newCategory })
            }
        });
	};

	var findCategories = (callback) => {
		Category.find((error, categories) => {
			if (error) {
                callback({ status: httpStatus.NOT_FOUND, message: error });
            }
			return callback({ status: httpStatus.OK, categories: categories });
		});
	};

	var deleteCategory = function deleteCategory(id, callback) {
		getCategory(id, function (result) {
			if (result.message !== undefined && result.message !== "") {
				return callback(result);
			}

			try {
				var category = result.category;
				category.remove((error) => {
                    if (error) {
                        return callback({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error });
                    }
                    return callback("");
                });
			} catch (error) {
				return callback({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error });
			}
		});
	};

	var updatecategory = (currentcategory, newcategoryData, callback) => {
        currentcategory.description = newcategoryData.description;
        currentcategory.vietDescription = newcategoryData.vietDescription;
        currentcategory.level = newcategoryData.level;
        currentcategory.parentCategoryId = newcategoryData.parentCategoryId;
        currentcategory.save((error) => {
            if (error) {
                return callback({ status: httpStatus.INTERNAL_SERVER_ERROR, message: error });
            }
            return callback({ status: httpStatus.OK, category: currentcategory });
        });
	};

	return {
		saveCategory: saveCategory,
		findCategories: findCategories,
		getCategory: getCategory,
		deleteCategory: deleteCategory,
		updateCategory: updatecategory
	};
})();

module.exports = categoryRepository;