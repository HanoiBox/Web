var http = require('http');
var express = require('express');
var validator = require('express-validator');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
var app = express();

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
var advertApiRoutes = require('./app/routing/advertApiRoutes.js')(express.Router());
var apiRoutes = require("./app/routing/categoryApiRoutes.js")(advertApiRoutes);
var allRoutes = require("./app/routing/appRoutes.js")(apiRoutes);
app.use('/', allRoutes);

// static dirs
app.use('/scripts', express.static(__dirname + '/scripts'));
app.use('/packages', express.static(__dirname + '/jspm_packages'));
app.use('/jspm_packages/npm', express.static(__dirname + '/jspm_packages/npm'));

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);


// notes on jspm for production
// jspm bundle-sfx --minify scripts/main
// remember to include the babel runtime, which is a dependency