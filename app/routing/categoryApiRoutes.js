'use strict';

var categoryService = require("../services/categoryService");
module.exports = function (router) {
	router.route('/api/category/').post(function (req, res) {
		categoryService.saveCategory(req.body, function (result) {
			res.json(result);
		});
	}).get(function (req, res, next) {
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

	router.route('/api/category/:categoryId').get(function (req, res) {
		var id = getIdInRequest(req, res);
		categoryService.getCategory(id, function (result) {
			res.json(result);
		});
	}).put(function (req, res) {
		var id = getIdInRequest(req, res);
		categoryService.updateCategory(id, req.body, function (result) {
			res.json(result);
		});
	}).delete(function (req, res) {
		var id = getIdInRequest(req, res);
		categoryService.deleteCategory(id, function (result) {
			res.json(result);
		});
	});

	return router;
};