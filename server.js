var http = require('http');
var express = require('express');
var validator = require('express-validator');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
//require("babel-core/register");
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
var dev = false;
try {
	if (app.get('env') !== null && app.get('env') === 'development')
	{
		dev = true;
	}
} catch(err)
{
}
var allRoutes = require("./app/routing/appRoutes.js")(apiRoutes, dev);
app.use('/', allRoutes);

// static dirs
app.use('/sysadmin', express.static(__dirname + '/sysadmin'));
app.use('/jspm_packages', express.static(__dirname + '/jspm_packages'));
app.use('/config.js', express.static(__dirname + '/config.js'));
app.use('/views/public', express.static(__dirname + '/views/public'));

// *** listen (start app with 'node server.js') ***
var port = process.env.port || 8080;
http.createServer(app).listen(port);