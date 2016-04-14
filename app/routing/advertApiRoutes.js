'use strict';

let advertService = require("../services/advertService");
module.exports = (router) => {

	router.get('/api', (req, res) => {
		res.json({ message: 'Welcome to the hanoibox.com api' });
	});

	router.route('/api/listing/').get((req, res) => {
		advertService.findAdverts((result) => {
			res.json(result);
		});
	}).post((req, res) => {
		advertService.saveAdvert(req.body, (error) => {
			if (error) res.json({ status: 500, message: error });

			res.json({ status: 200, message: 'Advert created!' });
		});
	});

	 let getIdInRequest = (req, res) => {
		req.assert('listingId', 'Id param must be an integer').isInt();

		let errors = req.validationErrors();
		if (errors) {
            res.json({ status: 500, message: errors });
        }

		// sanitize input
		return req.sanitize('listingId').toInt();
	}

	router.route('/api/listing/:listingId').get((req, res) => {
		let id = getIdInRequest(req, res);
		advertService.getAdvert(id, (result) => {
			res.json(result);
		});
	}).put((req, res) => {
		let id = getIdInRequest(req, res);
		advertService.updateAdvert(id, (result) => {
			res.json(result);
		});
	}).delete((req, res) => {
		let id = getIdInRequest(req, res);
		advertService.deleteAdvert(id, (result) => {
			res.json(result);
		});
	});

	return router;
};