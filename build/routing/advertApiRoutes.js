'use strict';

var advertService = require("../services/advertService");
module.exports = function (router) {

	router.get('/api', function (req, res) {
		res.json({ message: 'Welcome to the hanoibox.com api' });
	});

	router.route('/api/advert/').get((req, res) => {
		advertService.findAdverts(function (result) {
			res.json(result);
		});
	}).post((req, res) => {
		advertService.saveAdvert(req.body, error => {
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

	router.route('/api/advert/:advertId').get((req, res) => {
		var id = getIdInRequest(req, res);
		advertService.getAdvert(id, result => {
			res.json(result);
		});
	}).put((req, res) => {
		var id = getIdInRequest(req, res);
		advertService.updateAdvert(id, result => {
			res.json(result);
		});
	}).delete((req, res) => {
		var id = getIdInRequest(req, res);
		advertService.deleteAdvert(id, result => {
			res.json(result);
		});
	});

	return router;
};