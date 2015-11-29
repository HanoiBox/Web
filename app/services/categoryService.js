var categoryRepository = require("../repositories/categoryRepository");

var categoryService = function() {
	var validateCategoryData = (categoryData) => {
		if (categoryData == null)
		{
			return "No category object could be constructed";
		}
		if (categoryData.description === undefined || categoryData.description === "")
		{
			return "No category description was given";
		}
		return "";
	}
		
	var saveCategory = (categoryData, callback) => {
		var validationResult = validateCategoryData(categoryData);
		if (validationResult !== "") {
			return callback({ status : 400, message: validationResult });
		}
		
		var findAllCategoryPromise = new Promise((resolve, reject) => {
			categoryRepository.findCategories((result) => {
				if (result.error !== undefined && result.error !== "")
				{
					reject({ status: result.status, message : "Handler rejected because : " + result.error });
				} else {
					resolve(result.categories);
				}
			});
		});
		
		findAllCategoryPromise.then((categories) => {
			categories.forEach((category) => {
				if (category.description === categoryData.description)
				{
					callback({ status: 400, message :"Duplicate description" });
				}
			});
			
			saveCategoryToDb(categoryData, (result) => {
				return callback(result);
			});
		}).catch((reason) => {
			return callback(reason);
		});
	}
	
	var saveCategoryToDb = function (category, callback) {
		categoryRepository.saveCategory(category, (error) => {
			if (error !== "")
			{
				return callback({ status: 500, message : error });
			} else {
				return callback({ status : 200, message: "OK" });	
			}
		});	
	}
	
	var getcategory = (id, callback) => {
		categoryRepository.getCategory(id, (result) => {
			if (result.message !== undefined && result.message !== "")
			{
				return callback(result);
			} else {
				return callback({ status: 200, message : result.message, category : result.category });	
			}
		});
	}
	
	var findCategories = (callback) => {
		categoryRepository.findCategories((result) => {
			if (result.message !== undefined && result.error !== "")
			{
				return callback(result);
			} else {
				return callback({ status: 200, message : "OK", categories : result.categories });	
			}
		});
	}
	
	var deleteCategory = (id, callback) => {
		categoryRepository.deleteCategory(id, function(result) {
			if (result != "" && result.message !== "")
			{
				return callback(result);	
			} else {
				return callback({ status : 200, message : "OK" });	
			}
		});
	}
	
	var updatecategory = (id, categoryData, callback) => {
		var validationResult = validateCategoryData(categoryData);
		if (validationResult !== "") {
			return callback({ status : 400, message: validationResult });
		}
		
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
		saveCategory: saveCategory,
		findCategories: findCategories,
		getCategory: getcategory,
		deleteCategory : deleteCategory,
		updateCategory: updatecategory
	};
	
}();

module.exports = categoryService;