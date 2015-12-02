var http = require('http');
var express = require('express');
var validator = require('express-validator');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
var appDirectory = "./build";
var app = express();
var dev = process.env.Node_env === undefined;
if (dev)
{
	appDirectory = "./app";
	require("babel-core/register");
}
var db = require('./app/db');	
db.connect();

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
app.use('/sysadmin', express.static(__dirname + '/sysadmin'));
app.use('/jspm_packages', express.static(__dirname + '/jspm_packages'));
app.use('/config.js', express.static(__dirname + '/config.js'));
app.use('/views/public', express.static(__dirname + '/views/public'));

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);