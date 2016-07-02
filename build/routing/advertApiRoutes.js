'use strict';

var advertService = require("../services/advertService");
var getAdvertsByCategoryQuery = require("../queries/advert/getAdvertsByCategoryQuery");

module.exports = function (router) {

	router.get('/api', function (req, res) {
		res.json({ message: 'Welcome to the hanoibox.com api' });
	});

	router.route('/api/listing/').get(function (req, res) {
		advertService.findAdverts(function (result) {
			res.json(result);
		});
	}).post(function (req, res) {
		advertService.saveAdvert(req.body.data, function (error) {
			if (error === "") {
				res.status(200).json({ message: 'Advert created!' });
			} else {
				res.status(500).json({ message: error });
			}
		});
	});

	var getIdInRequest = function getIdInRequest(name, req, res) {
		req.assert(name, 'Id param must be an integer').isInt();

		var errors = req.validationErrors();
		if (errors) {
			res.json({ status: 500, message: errors });
		}

		// sanitize input
		return req.sanitize(name).toInt();
	};

	router.route('/api/listing/:listingId').get(function (req, res) {
		var id = getIdInRequest("listingId", req, res);
		advertService.getAdvert(id, function (result) {
			res.json(result);
		});
	}).put(function (req, res) {
		var id = getIdInRequest(req, res);
		advertService.updateAdvert("listingId", id, function (result) {
			res.json(result);
		});
	}).delete(function (req, res) {
		var id = getIdInRequest(req, res);
		advertService.deleteAdvert("listingId", id, function (result) {
			res.json(result);
		});
	});

	router.route('/api/listing/category/:categoryId').get(function (req, res) {
		var id = getIdInRequest("categoryId", req, res);
		getAdvertsByCategoryQuery.get(id, function (result) {
			res.json(result);
		});
	});

	return router;
};