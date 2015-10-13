'use strict';
var categoryRepository = require("../repositories/categoryRepository");
var Category = require("../models/advert").category;
module.exports = function (router) {
	
	router.post('/api/category/', function (req, res) {
		
		categoryRepository.saveCategory(req.body, function(err) {
			if (err)
			{
				res.json({ status: 500, message: err });
			} else {
				res.json({ status: 200, message: 'Category created!' });	
			}	
		});
		
	});
	
	router.get('/api/category/', function (req, res, next) {
  		categoryRepository.findCategories(function(result) {
			res.json(result);
		});
	});
	
	return router;
}