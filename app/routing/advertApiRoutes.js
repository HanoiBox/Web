'use strict';
let advertService = require("../services/advertService");
let getAdvertsByCategoryQuery = require("../queries/advert/getAdvertsByCategoryQuery");

module.exports = (router) => {

	router.get('/api', (req, res) => {
		res.json({ message: 'Welcome to the hanoibox.com api' });
	});

	router.route('/api/listing/').get((req, res) => {
		advertService.findAdverts((result) => {
			res.json(result);
		});
	}).post((req, res) => {
		advertService.saveAdvert(req.body.data, (error) => {
			if (error === "") {
				res.status(200).json({ message: 'Advert created!' });
			} else {
				res.status(500).json({ message: error });
			}
		});
	});
	
	let getIdInRequest = (name, req, res) => {
		req.assert(name, 'Id param must be an integer').isInt();

		let errors = req.validationErrors();
		if (errors) {
			res.json({ status: 500, message: errors });
		}

		// sanitize input
		return req.sanitize(name).toInt();
	}

	router.route('/api/listing/:listingId').get((req, res) => {
		let id = getIdInRequest("listingId", req, res);
		advertService.getAdvert(id, (result) => {
			res.json(result);
		});
	}).put((req, res) => {
		let id = getIdInRequest(req, res);
		advertService.updateAdvert("listingId", id, (result) => {
			res.json(result);
		});
	}).delete((req, res) => {
		let id = getIdInRequest(req, res);
		advertService.deleteAdvert("listingId", id, (result) => {
			res.json(result);
		});
	});
	
	router.route('/api/listing/category/:categoryId').get((req, res) => {
		let id = getIdInRequest("categoryId", req, res);
		getAdvertsByCategoryQuery.get(id, (result) => {
			res.json(result);
		});
	});

	return router;
};