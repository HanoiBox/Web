'use strict';
module.exports = function (router) {
	
	router.get('/api', function(req, res) {
		res.json({ message: 'Welcome to the hanoibox.com api' });	
	});
	
	router.get('/api/adverts/:id', function (req, res, next) {
		
	});
	
	return router;
};