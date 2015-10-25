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
		defaultLayout:'main'
	}));

app.set('view engine', 'hbs');

// ** routes ***
var advertApiRoutes = require('./app/routing/advertApiRoutes.js')(express.Router());
var apiRoutes = require("./app/routing/categoryApiRoutes.js")(advertApiRoutes);
var allRoutes = require("./app/routing/appRoutes.js")(apiRoutes);
app.use('/', allRoutes);

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);