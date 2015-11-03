'use strict';
var Category = require("../models/advert").category;

var categoryRepository = function() {
	
	var saveCategory = (categoryData, callback) => {
		try {
			var newCategory = new Category();
			newCategory.description = categoryData.description;
			newCategory.save();
			return callback("");	
		} catch (error)
		{
			return callback("Unable to save " + error);
		}
	}
	
	var getCategory = (id, callback) =>
	{
		Category.findById(id, (err, category) => {
			if (err !== null || err !== "")
			{
				console.error("Mongo error: " + err);
				return callback({ status: 400, message : "Mongo error: " + err });
			}
			if (category == null || category._id !== id)
			{
				return callback({ status: 404, message : "Unable to find category: " + id});
			}
			return callback({ category : category });
		});
	}
	
	var findCategories = (callback) =>
	{
		Category.find((err, categories) => {
			if (err)
				return callback({ status: 404, error: err });
			
			return callback({ categories: categories });
		});
	}
	
	var deleteCategory = (id, callback) =>
	{
		getCategory(id, (result) => {
			if (result.message !== undefined && result.message !== "")
			{
				return callback(result);
			}
			
			try {
				var category = result.category;
				category.remove();
				return callback("");	
			} catch (error) {
				return callback({ status: 500, message: error });
			}
		});
	}
	
	var updatecategory = (currentcategory, newcategoryData, callback) => {
		try {
			if (newcategoryData.description !== null)
			{
				currentcategory.description = newcategoryData.description;	
			}
			currentcategory.save();	
			return callback("");
		} catch(error) {
			return callback(error.toString());
		}
	}
	
	return {
		saveCategory: saveCategory,
		findCategories: findCategories,
		getCategory: getCategory,
		deleteCategory: deleteCategory,
		updateCategory: updatecategory
	};
}();

module.exports = categoryRepository;