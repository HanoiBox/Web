import angular from 'angular';
import loadingBar from 'angular-loading-bar';

import categoriesControllerModule from 'sysadmin/app/routes/categories/categoriesController';
import createEditCategoryControllerModule from 'sysadmin/app/routes/categories/createEditCategoryController';
import indexControllerModule from 'sysadmin/app/routes/index/indexController';
import indexTemplate from 'sysadmin/app/routes/index/index.html!text';
import categoriesTemplate from 'sysadmin/app/routes/categories/categories.html!text';
import createEditCategoryTemplate from 'sysadmin/app/routes/categories/createEdit.html!text';

var mystuff = angular.module('appRoutesModule', [
  'ngRoute',
  'angular-loading-bar',
  indexControllerModule.name,
  categoriesControllerModule.name,
  createEditCategoryControllerModule.name,
  'LocalStorageModule'
]).config(function($routeProvider, localStorageServiceProvider) {
    //angular.extend(CacheFactoryProvider.defaults, { maxAge: 15 * 60 * 1000 });
    console.log("setting up local storage");
        localStorageServiceProvider
            .setPrefix('sysadmin')
            .setStorageType('sessionStorage');
            
  $routeProvider.when('/', {
      template: indexTemplate,
      controller: 'IndexController',
      controllerAs: 'ctrl'
  }).when('/categories', {
      template: categoriesTemplate,
      controller: 'CategoriesController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  }).when('/categories/create', {
      template: createEditCategoryTemplate,
      controller: 'CreateEditCategoryController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  }).when('/categories/edit:id', {
      template: createEditCategoryTemplate,
      controller: 'CreateEditCategoryController',
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

export default mystuff;