'use strict';

var advertService = require("../services/advertService");
module.exports = function (router) {

	router.get('/api', function (req, res) {
		res.json({ message: 'Welcome to the hanoibox.com api' });
	});

	router.route('/api/advert/').get(function (req, res) {
		advertService.findAdverts(function (result) {
			res.json(result);
		});
	}).post(function (req, res) {
		advertService.saveAdvert(req.body, function (error) {
			if (error) res.json({ status: 500, message: error });

			res.json({ status: 200, message: 'Advert created!' });
		});
	});

	function getIdInRequest(req, res) {
		req.assert('advertId', 'Id param must be an integer').isInt();

		var errors = req.validationErrors();
		if (errors) res.json({ status: 500, message: errors });

		// sanitize input
		return req.sanitize('advertId').toInt();
	}

	router.route('/api/advert/:advertId').get(function (req, res) {
		var id = getIdInRequest(req, res);
		advertService.getAdvert(id, function (result) {
			res.json(result);
		});
	}).put(function (req, res) {
		var id = getIdInRequest(req, res);
		advertService.updateAdvert(id, function (result) {
			res.json(result);
		});
	}).delete(function (req, res) {
		var id = getIdInRequest(req, res);
		advertService.deleteAdvert(id, function (result) {
			res.json(result);
		});
	});

	return router;
};