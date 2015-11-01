var categoryRepository = require("../repositories/categoryRepository");

var categoryService = function() {
	var validateCategoryData = (categoryData, callback) => {
		if (categoryData == null || categoryData.description === undefined || categoryData.description === "")
		{
			return callback("No category object was constructed - was it empty?");
		}
	}
		
	var savecategory = (categoryData, callback) => {
		validateCategoryData(categoryData, callback);
		
		var category = {
			description : categoryData.description
		}
		
		categoryRepository.saveCategory(category, (error) => {
			if (error == "")
				return callback({ status: 500, "message" : error });
			return callback({ status : 200, message: "OK" });
		});
	}
	
	var getcategory = (id, callback) => {
		categoryRepository.getCategory(id, (result) => {
			if (result.message)
				return callback({ status: 500, "message" : result.message });
			return callback({ status: 200, message : result.message, category : result.category });
		});
	}
	
	var findcategories = (callback) => {
		categoryRepository.findCategories((result) => {
			if (result.message)
			{
				return callback({ status: result.status, "message" : result.message });
			}
			return callback({ status: 200, message : "OK", categories : result.categories });
		});
	}
	
	var deletecategory = (id, callback) => {
		categoryRepository.deleteCategory(id, function(error) {
			if (error)
			{
				return callback({ status : 500, message: error });	
			}
			return callback({ status : 200, message : "OK" });
		});
	}
	
	var updatecategory = (id, categoryData, callback) => {
		validateCategoryData(categoryData, callback);
		
		var getcategoryPromise = new Promise((resolve, reject) => {
			categoryRepository.getCategory(id, (result) => {
				if (result === null || result.category === null)
					reject("category could not be found");
				resolve(result.category);
			});
		});
		
		getcategoryPromise.then((category) => {
			categoryRepository.updateCategory(category, categoryData, (error) => {
				if (error != "")
					return callback({ status: 500, message: error});
				return callback({ status: 200, message: "OK"});
			});
		}).catch((reason) => {
			var errorMsg = 'getcategoryPromise handle rejected promise ('+reason+') here.';
			console.error(errorMsg);
			return callback({ status: 404, message: errorMsg });
		});
	}
	
	return {
		saveCategory: savecategory,
		findCategories: findcategories,
		getCategory: getcategory,
		deleteCategory : deletecategory,
		updateCategory: updatecategory
	};
	
}();

module.exports = categoryService;