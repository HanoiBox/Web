import angular from 'angular';
import 'angular-route';

import categoryQueryModule from 'sysadmin/app/queries/getCategories';

var mystuff = angular.module('categoriesControllerModule', [
  'ngRoute',
  categoryQueryModule.name
]).controller('CategoriesController', function(GetCategories) {
    var categories = GetCategories.all().then((result) => {
      for (var category in result.categories) {
         console.log("Category: ", element);
      }
    });
    
    this.categories = categories;
});

export default mystuff;