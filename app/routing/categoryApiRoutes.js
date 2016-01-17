'use strict';
let categoryService = require("../services/categoryService");
let categoryQuery = require("../queries/category/getCategoryQuery");
let categoriesQuery = require("../queries/category/getCategoriesQuery");
let categorySaveCommand = require("../commands/category/saveCategoryCommand");
let updateCategoryCommand = require("../commands/category/updateCategoryCommand");

module.exports = (router) => {
	router.route('/api/category/').post((req, res) => {
		categorySaveCommand.saveCategory(req.body, (result) => {
			res.status(result.status).json(result);
		});
	}).get((req, res, next) => {
		categoryService.findCategories((result) => {
			res.status(result.status).json(result);
		});
	});
    
    router.route('/api/backend/category/').get((req, res) => {
		categoriesQuery.getCategories((result) => {
			res.status(result.status).json(result);
		});
	});

	let getIdInRequest = (req, res) => {
		req.assert('categoryId', 'Id param must be an integer').isInt();

		let errors = req.validationErrors();
		if (errors) {
            res.status(500).json({ status: 500, message: errors });
        }

		// sanitize input
		return req.sanitize('categoryId').toInt();
	}

	router.route('/api/category/:categoryId').get( (req, res) => {
		let id = getIdInRequest(req, res);
		categoryQuery.getCategory(id, (result) => {
			res.status(result.status).json(result);
		});
	}).put( (req, res) => {
		let id = getIdInRequest(req, res);
		updateCategoryCommand.updateCategory(id, req.body, (result) => {
			res.status(result.status).json(result);
		});
	}).delete( (req, res) => {
		let id = getIdInRequest(req, res);
		categoryService.deleteCategory(id, (result) => {
			res.status(result.status).json(result);
		});
	});

	return router;
};