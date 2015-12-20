import angular from 'angular';
import loadingBar from 'angular-loading-bar';
import 'angular-route';

// import categoriesControllerModule from 'sysadmin/app/routes/categories/categoriesController';
// import createEditCategoryControllerModule from 'sysadmin/app/routes/categories/createEditCategoryController';
import indexControllerModule from 'public/app/routes/index/indexController';
import indexTemplate from 'public/app/routes/index/index.html!text';
// import categoriesTemplate from 'sysadmin/app/routes/categories/categories.html!text';
// import createEditCategoryTemplate from 'sysadmin/app/routes/categories/createEdit.html!text';

export default  angular.module('appRoutesModule', [
  'ngRoute',
  'angular-loading-bar',
  indexControllerModule.name
]).config(function($routeProvider) {
  
  $routeProvider.when('/', {
      template: indexTemplate,
      controller: 'IndexController',
      controllerAs: 'ctrl'
  }).otherwise({
      redirectTo: '/'
  });
  
});