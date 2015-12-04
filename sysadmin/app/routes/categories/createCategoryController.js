import angular from 'angular';
import 'angular-route';

import categoryCommandModule from 'sysadmin/app/commands/saveCategories';

export default angular.module('createCategoryControllerModule', [
  'ngRoute',
  categoryCommandModule.name
]).controller('CreateCategoryController', function($location, $scope, SaveCategoriesFactory) {
   
   $scope.save = (category) => {
     $location.path("/categories");
     SaveCategoriesFactory.saveCategory(category, (response) => {
       console.log("epic win? ", response);
     });
   }
   
   $scope.back = () => {
	   $location.path("/categories");
   }
});