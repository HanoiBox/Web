'use strict';

var categoryService = require("../services/categoryService");
module.exports = router => {
	router.route('/api/category/').post((req, res) => {
		categoryService.saveCategory(req.body, function (result) {
			res.json(result);
		});
	}).get((req, res, next) => {
		categoryService.findCategories(function (result) {
			res.json(result);
		});
	});

	function getIdInRequest(req, res) {
		req.assert('categoryId', 'Id param must be an integer').isInt();

		var errors = req.validationErrors();
		if (errors) res.json({ status: 500, message: errors });

		// sanitize input
		return req.sanitize('categoryId').toInt();
	}

	router.route('/api/category/:categoryId').get((req, res) => {
		var id = getIdInRequest(req, res);
		categoryService.getCategory(id, result => {
			res.json(result);
		});
	}).put((req, res) => {
		var id = getIdInRequest(req, res);
		categoryService.updateCategory(id, req.body, result => {
			res.json(result);
		});
	}).delete((req, res) => {
		var id = getIdInRequest(req, res);
		categoryService.deleteCategory(id, result => {
			res.json(result);
		});
	});

	return router;
};