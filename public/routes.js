import angular from 'angular';
import loadingBar from 'angular-loading-bar';
import 'angular-route';
import 'angular-bootstrap-dropdownandtab';

import homeControllerModule from 'public/app/routes/home/homeController';
import homeTemplate from 'public/app/routes/home/home.html!text';

export default angular.module('appRoutesModule', [
  'ngRoute',
  'angular-loading-bar',
  'ui.bootstrap.dropdown',
  'ui.bootstrap.tabs',
  'ui.bootstrap.collapse',
  homeControllerModule.name
]).config(function($routeProvider, $locationProvider) {
  
  $routeProvider.when('/', {
      template: homeTemplate,
      controller: 'HomeController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  }).otherwise({
      redirectTo: '/'
  });
  
  // use the HTML5 History API
  $locationProvider.html5Mode(true);
  
});