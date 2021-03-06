'use strict';

var multer = require('multer');
var upload = multer({ dest: 'uploads/' });
var listingService = require('../services/advertService');
var deleteImageOnFileCommand = require('../commands/listing/deleteImageOnFileCommand');

module.exports = function (router, devEnvironment) {

	var home = function home(res) {
		var data = { title: 'Hanoi Box', dev: devEnvironment };
		res.render('public/home', data);
	};

	router.post('/listing/upload', upload.single("file"), function (req, res) {
		res.setHeader('Content-Type', 'application/json');
		listingService.uploadAdvert(req.file).then(function (result) {
			deleteImageOnFileCommand.deleteImage(result.originalPath).then(function (deletionResult) {
				if (deletionResult.success) {
					//console.log(`deleted ${result.originalPath} ok`);
					res.send(JSON.stringify(result));
				} else {
					res.send(JSON.stringify(deletionResult.error));
				}
			}).catch(function (deleteFailReason) {
				res.send(JSON.stringify(deleteFailReason));
			});
		}).catch(function (reason) {
			//console.log("no cigar", reason);
			res.send(JSON.stringify({ error: { message: reason } }));
		});
	});

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

	router.get('/listing/createlisting', function (req, res) {
		home(res);
	});

	router.get('/sysadmin/', function (req, res) {
		var data = { title: 'Hanoi Box Admin', dev: devEnvironment };
		res.render('sysadmin/adminhome', data);
	});

	return router;
};