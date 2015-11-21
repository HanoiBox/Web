import angular from 'angular';
import _ from 'lodash';
import routesModule from './routes'

export function bootstrap() {
	// bootstrap code here
	// sort out angular
	
	var myApp = angular.module('myApp', [
		routesModule.name
	]);
	
	console.log("app is alive : ", myApp.name);
	
	angular.element(document).ready(function() {
		angular.bootstrap(document.querySelector('[data-sys-app]'), [
			myApp.name
		]);
	});
}