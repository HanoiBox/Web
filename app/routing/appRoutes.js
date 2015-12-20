'use strict';
module.exports = function(router, devEnvironment) {

	let home = (res) => {
	    let data = { title: 'Hanoi Box', dev: devEnvironment };
		res.render('public/home', data);	
	}

	router.get('/', function(req, res) {
		home(res);
	});
	
	router.get('/home', function(req, res) {
		home(res);
	});
	
	router.get('/sysadmin/', function(req, res) {
		let data = { title: 'Hanoi Box Admin', dev: devEnvironment };
		res.render('sysadmin/adminhome', data);
	});

	return router;
};