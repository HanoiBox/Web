import angular from 'angular';
import loadingBar from 'angular-loading-bar';
import 'angular-route';
import 'angular-bootstrap';

// import categoriesControllerModule from 'sysadmin/app/routes/categories/categoriesController';
// import createEditCategoryControllerModule from 'sysadmin/app/routes/categories/createEditCategoryController';
import indexControllerModule from 'public/app/routes/index/indexController';
import indexTemplate from 'public/app/routes/index/index.html!text';
// import categoriesTemplate from 'sysadmin/app/routes/categories/categories.html!text';
// import createEditCategoryTemplate from 'sysadmin/app/routes/categories/createEdit.html!text';

export default angular.module('appRoutesModule', [
  'ngRoute',
  'angular-loading-bar',
  'ui.bootstrap.dropdown',
  'ui.bootstrap.tabs',
  indexControllerModule.name
]).config(function($routeProvider) {
  
  $routeProvider.when('/', {
      template: indexTemplate,
      controller: 'IndexController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  }).otherwise({
      redirectTo: '/'
  });
  
});