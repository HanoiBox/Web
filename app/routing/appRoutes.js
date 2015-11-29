'use strict';
module.exports = function(router, devEnvironment) {

	router.get('/', function(req, res) {
		var data = { title: 'Hanoi Box' };
		res.render('public/home', data);
	});
	
	router.get('/home', function(req, res) {
		var data = { title: 'Hanoi Box' };
		res.render('public/home', data);
	});

	router.get('/sysadmin', function(req, res) {
		var data = { title: 'Hanoi Box Admin', dev: devEnvironment };
		res.render('sysadmin/adminhome', data);
	});

	return router;
};