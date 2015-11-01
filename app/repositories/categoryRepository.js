'use strict';
var Category = require("../models/advert").category;

var categoryRepository = function() {
	
	var saveCategory = (categoryData, callback) => {
		Category.find((err, categories) => {
			categories.forEach((category) => {
				if (category.description === categoryData.description)
					return callback("Duplicate description");
			});
			
			try {
				var newCategory = new Category();
				newCategory.description = categoryData.description;
				newCategory.save();
				return callback("");	
			} catch (error)
			{
				return callback("Unable to save " + error);
			}
		});
	}
	
	var getCategory = (id, callback) =>
	{
		Category.findById(id, (err, category) => {
			if (category == null || category._id !== id || err !== null)
			{
				return callback({ status: 404, message : "Unable to find category: " + id + ". Mongo Error: " + err });
			}
			return callback({ category : category });
		});
	}
	
	var findCategories = (callback) =>
	{
		Category.find((err, categories) => {
			if (err)
				return callback(err);
			
			return callback({ categories: categories });
		});
	}
	
	var deleteCategory = (id, callback) =>
	{
		getCategory(id, (result) => {
			if (result.message !== undefined && result.message !== "")
			{
				return callback(result.message);
			}
			
			try {
				var category = result.category;
				category.remove();
				return callback("");	
			} catch (error) {
				return callback(error);
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
			return callback(error);
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