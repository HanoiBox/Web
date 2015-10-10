var http = require('http');
var express = require('express');
var validator = require('express-validator');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
var app = express();

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
var apiRoutes = require('./app/routing/apiRoutes.js')(express.Router());
var allRoutes = require("./app/routing/appRoutes.js")(apiRoutes);
app.use('/', allRoutes);

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);