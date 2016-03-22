'use strict';

module.exports = function (router, devEnvironment) {

	var home = function home(res) {
		var data = { title: 'Hanoi Box', dev: devEnvironment };
		res.render('public/home', data);
	};

	router.get('/', function (req, res) {
		home(res);
	});

	router.get('/category', function (req, res) {
		home(res);
	});

	router.get('/home', function (req, res) {
		home(res);
	});

	var getIdInRequest = function getIdInRequest(req, res) {
		if (req.params === undefined || req.params.id === null || req.params.id === "") {
			res.render("public/categoryNotFound", { title: 'No params', info: "no params data" });
		}

		var id = req.params.id.replace("id:", "");

		if (parseInt(id, 10) === NaN) {
			res.render("public/categoryNotFound", { title: 'Not found', id: id });
		}

		return id;
	};

	router.get('/category/:id', function (req, res) {
		var categoryId = getIdInRequest(req, res);
		home(res);
	});

	router.get('/sysadmin/', function (req, res) {
		var data = { title: 'Hanoi Box Admin', dev: devEnvironment };
		res.render('sysadmin/adminhome', data);
	});

	return router;
};