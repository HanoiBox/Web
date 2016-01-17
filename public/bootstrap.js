import angular from 'angular';
import _ from 'lodash';
import routesModule from 'public/routes';

export function bootstrap() {
	// bootstrap code here
	// sort out angular
	
	var myApp = angular.module('pubApp', [
		routesModule.name
	]);
	
	angular.element(document).ready(function() {
		angular.bootstrap(document.querySelector('[data-pub-app]'), [
			myApp.name
		]);
	});
}