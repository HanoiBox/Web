import angular from 'angular';
import 'angular-route';

import categoryCommandModule from 'sysadmin/app/commands/categories/saveCategories';
import categoryQueryModule from 'sysadmin/app/queries/getCategories';

export default angular.module('createEditCategoryControllerModule', [
  'ngRoute',
  categoryCommandModule.name,
  categoryQueryModule.name
]).controller('CreateEditCategoryController', function($location, $scope, GetCategoriesFactory, SaveCategoriesFactory, $routeParams) {
   this.id = $routeParams.id.replace(':', '');
   this.id = parseInt(this.id);
   
   if (this.id !== undefined && this.id !== null && !isNaN(this.id))
   {
      let existingCategory = GetCategoriesFactory.byId(this.id).then((result) => {
        let existingCategory = result.data.category;
        if (existingCategory != null && result.status === 200)
        {
          $scope.category = existingCategory;
        }
      }); 
   }
   
   $scope.save = (category) => {
     SaveCategoriesFactory.saveCategory(category, (response) => {
       console.log("epic win? ", response);
       $location.path("/categories");
     });
   }
   
   $scope.back = () => {
	   $location.path("/categories");
   }
});