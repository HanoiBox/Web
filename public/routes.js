import angular from 'angular';
import 'angular-route';
import 'angular-bootstrap-dropdownandtab';

import homeControllerModule from 'public/app/routes/home/homeController';
import homeTemplate from 'public/app/routes/home/index.html!text';

import categoryControllerModule from 'public/app/routes/category/categoryController';
import categoryTemplate from 'public/app/routes/category/index.html!text';
// import advertTemplate from 'public/app/routes/advert/index.html!text';

import createListingControllerModule from 'public/app/routes/listing/createListingController';
import listingTemplate from 'public/app/routes/listing/create.html!text';

export default angular.module('appRoutesModule', [
  'ngRoute',
  'ui.bootstrap.dropdown',
  'ui.bootstrap.tabs',
  'ui.bootstrap.collapse',
  homeControllerModule.name,
  categoryControllerModule.name,
  createListingControllerModule.name,
  'LocalStorageModule'
]).config(function($routeProvider, $locationProvider, localStorageServiceProvider) {
  
  localStorageServiceProvider
        .setPrefix('public')
        .setStorageType('sessionStorage');
  
  $routeProvider.when('/', {
      template: homeTemplate,
      controller: 'HomeController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  })
  .when('/category/:id', {
      template: categoryTemplate,
      controller: 'CategoryController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  })
  // .when('/listing/:id', {
  //     template: advertTemplate,
  //     controller: 'AdvertController',
  //     controllerAs: 'ctrl',
  //     resolve: {
  //        allCategories: (GetCategoriesFactory) => {
  //          return GetCategoriesFactory.allCats();
  //        }
  //     }
  // })
  .when('/listing/createlisting', {
      template: listingTemplate,
      controller: 'CreateListingController',
      controllerAs: 'ctrl',
      resolve: {
         allCategories: (GetCategoriesFactory) => {
           return GetCategoriesFactory.allCats();
         }
      }
  })
  .otherwise({
      redirectTo: '/'
  });
  
  // use the HTML5 History API
  $locationProvider.html5Mode(true);
  
});