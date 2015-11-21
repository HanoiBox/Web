import angular from 'angular';

import indexControllerModule from '/sysadmin/app/routes/index/indexController';
import categoriesControllerModule from '/sysadmin/app/routes/categories/categoriesController';

import indexTemplate from '/sysadmin/app/routes/index/index.html!text';
import categoriesTemplate from '/sysadmin/app/routes/categories/categories.html!text';

var mystuff = angular.module('appRoutesModule', [
  'ngRoute',
  indexControllerModule.name,
  categoriesControllerModule.name
]).config(function($routeProvider) {
  
  $routeProvider.when('/', {
      template: indexTemplate,
      controller: 'IndexController',
      controllerAs: 'ctrl'
  }).when('/categories', {
      template: categoriesTemplate,
      controller: 'CategoriesController',
      controllerAs: 'ctrl'
  }).otherwise({
      redirectTo: '/'
  });
  
});

export default mystuff;