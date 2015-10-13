'use strict';
var advertRepository = require("../repositories/advertRepository");
var Advert = require("../models/advert").advert;
module.exports = function (router) {
	
	router.get('/api', function(req, res) {
		res.json({ message: 'Welcome to the hanoibox.com api' });		
	});
	
	router.post('/api/advert/', function (req, res) {
		advertRepository.saveAdvert(req.body, function(err) {
			if (err)
				res.json({ status: 500, message: err });
			
			res.json({ status: 200, message: 'Advert created!' });	
		});
	});
	
	router.get('/api/advert/:id', function (req, res, next) {
  		req.assert('id', 'Id param must be an integer').isInt();
		
		var errors = req.validationErrors();
		if (errors)
			res.json(errors);
		
		// sanitize input
  		var id = req.sanitize('id').toInt();
		  
		return advertRepository.getAdvert(id);
	});
	
	router.get('/api/advert/', function (req, res, next) {
		console.log("repo", advertRepository.findAdverts);
  		advertRepository.findAdverts(function(result) {
			res.json(result);
		});
	});
	
	return router;
};