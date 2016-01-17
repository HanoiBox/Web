'use strict';

var categoryService = require("../services/categoryService");
var categoryQuery = require("../queries/category/getCategoryQuery");
var categoriesQuery = require("../queries/category/getCategoriesQuery");
var categorySaveCommand = require("../commands/category/saveCategoryCommand");
var updateCategoryCommand = require("../commands/category/updateCategoryCommand");

module.exports = function (router) {
	router.route('/api/category/').post(function (req, res) {
		categorySaveCommand.saveCategory(req.body, function (result) {
			res.status(result.status).json(result);
		});
	}).get(function (req, res, next) {
		categoryService.findCategories(function (result) {
			res.status(result.status).json(result);
		});
	});

	router.route('/api/backend/category/').get(function (req, res) {
		categoriesQuery.getCategories(function (result) {
			res.status(result.status).json(result);
		});
	});

	var getIdInRequest = function getIdInRequest(req, res) {
		req.assert('categoryId', 'Id param must be an integer').isInt();

		var errors = req.validationErrors();
		if (errors) {
			res.status(500).json({ status: 500, message: errors });
		}

		// sanitize input
		return req.sanitize('categoryId').toInt();
	};

	router.route('/api/category/:categoryId').get(function (req, res) {
		var id = getIdInRequest(req, res);
		categoryQuery.getCategory(id, function (result) {
			res.status(result.status).json(result);
		});
	}).put(function (req, res) {
		var id = getIdInRequest(req, res);
		updateCategoryCommand.updateCategory(id, req.body, function (result) {
			res.status(result.status).json(result);
		});
	}).delete(function (req, res) {
		var id = getIdInRequest(req, res);
		categoryService.deleteCategory(id, function (result) {
			res.status(result.status).json(result);
		});
	});

	return router;
};