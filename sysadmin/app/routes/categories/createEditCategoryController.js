import angular from 'angular';
import 'angular-route';

import categoryCommandModule from 'sysadmin/app/commands/category/saveCategory';
import categoryQueryModule from 'sysadmin/app/queries/category/getCategories';

export default angular.module('createEditCategoryControllerModule', [
  'ngRoute',
  categoryCommandModule.name,
  categoryQueryModule.name
]).controller('CreateEditCategoryController', function($location, $scope, GetCategoriesFactory, SaveCategoriesFactory, $routeParams, allCategories) {
    this.id = null;
    $scope.errors = false;
    $scope.data = { categories: allCategories };
    $scope.levelFilter = 0;
    
    
    if ($routeParams.id !== undefined)
    {
        this.id = $routeParams.id.replace(':', '');
        this.id = parseInt(this.id);  
    }
   
    if (this.id !== undefined && this.id !== null && !isNaN(this.id))
    {
        GetCategoriesFactory.byId(this.id).then((response) => {
            if (response.status === 200) {
                let category = response.data.category;
                $scope.category = category;
            } else {
                // failure msg
            }
        });
    }
    
    $scope.levelFilterUpdate = (value) => {
        if (value > 0 && value < 10)
        {
            $scope.data.categories = allCategories.filter(cat => cat.level === value);    
        } else {
            $scope.levelFilter = 0;
        }
    }
    
    $scope.save = (category) => {
      SaveCategoriesFactory.saveCategory(category, (response) => {
        if (response.success) {
            $scope.errors = false;
            $location.path("/categories");
        } else {
            alert("unable to edit category: " + response.error);
            $scope.errors = true;
            this.errorMessage = response.error;
        }
      });
    }
    
    $scope.back = () => {
	    $location.path("/categories");
    }
});