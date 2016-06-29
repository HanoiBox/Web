var http = require('http');
var express = require('express');
var validator = require('express-validator');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
var appDirectory = "./build";
var app = express();
var dev = process.env.Node_env === undefined || process.env.Node_env === null || process.env.Node_env === "dev";
var db = require('./build/db');
if (dev)
{
	appDirectory = "./app";
	require("babel-core/register");
	require("babel-polyfill");
    db = require('./app/db');
}
db.connect(dev, process.env);

var cloudinaryImageSetup = require('./app/cloudinaryImageSetup');
cloudinaryImageSetup.setup(process.env);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(validator());

app.engine('hbs', expressHbs(
	{ 
		extname:'hbs', 
		defaultLayout:'main',
		partialsDir: [
			'views/public/templates/',
			'views/sysadmin/templates/']
	}));

app.set('view engine', 'hbs');

// ** routes ***
var advertApiRoutes = require(appDirectory + '/routing/advertApiRoutes.js')(express.Router());
var apiRoutes = require(appDirectory + '/routing/categoryApiRoutes.js')(advertApiRoutes);
var allRoutes = require(appDirectory + '/routing/appRoutes.js')(apiRoutes, dev);
app.use('/', allRoutes);

// static dirs
if (dev) {
	app.use('/sysadmin', express.static(__dirname + '/sysadmin'));
    app.use('/public', express.static(__dirname + '/public'));
	app.use('/jspm_packages', express.static(__dirname + '/jspm_packages'));
	app.use('/node_modules', express.static(__dirname + '/node_modules'));
} else {
	app.use('/sysadmin/dist', express.static(__dirname + '/sysadmin/dist'));
    app.use('/public/dist', express.static(__dirname + '/public/dist'));
}

app.use('/sysadmin/app/tinymce/skins', express.static(__dirname + '/sysadmin/app/tinymce/skins'));
app.use('/config.js', express.static(__dirname + '/config.js'));
app.use('/views/public', express.static(__dirname + '/views/public'));
app.use('/uib/template', express.static(__dirname + '/public/template'));
app.use('/public/images', express.static(__dirname + '/public/images'));
app.use('/uploads', express.static(__dirname + '/uploads'));

var favicon = require('serve-favicon');
app.use(favicon(__dirname + '/public/images/favicon.ico'));

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);