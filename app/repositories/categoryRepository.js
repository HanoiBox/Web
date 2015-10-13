'use strict';
var Category = require("../models/advert").category;

var categoryRepository = function() {
	
	var saveCategory = function(categoryData, callback) {
		if (categoryData == null || categoryData.description == "")
		{
			callback("No category object was constructed - was it empty?");
		}
		
		var category = {
			description : categoryData.description
		}
		
		try
		{
			//var duplicateCategory = Category.findOne(cat => cat.description == category.description);
			// gross
			Category.find(function(err, categories) {
				categories.forEach(function(category) {
					if (category.description == categoryData.description)
						callback("Duplicate description");
				}, this);
				
				var newCategory = new Category();
				newCategory._id = 1;
				newCategory.description = category.description;
				newCategory.save();
				callback();
			});
		}
		catch (err)
		{
			callback("Problem saving advert to mongo db: " + err);	
		}
	}
	
	var findCategories = function(callback)
	{
		Category.find(function(err, categories) {
			if (err)
				callback(err);
			
			callback(categories);
		});
	};
	
	return {
		saveCategory: saveCategory,
		findCategories: findCategories
	};
}();

module.exports = categoryRepository;