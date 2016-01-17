'use strict';

module.exports = function (router, devEnvironment) {

	var home = function home(res) {
		var data = { title: 'Hanoi Box', dev: devEnvironment };
		res.render('public/home', data);
	};

	router.get('/', function (req, res) {
		home(res);
	});

	router.get('/home', function (req, res) {
		home(res);
	});

	router.get('/sysadmin/', function (req, res) {
		var data = { title: 'Hanoi Box Admin', dev: devEnvironment };
		res.render('sysadmin/adminhome', data);
	});

	return router;
};