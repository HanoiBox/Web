import angular from 'angular';
import 'angular-route';

import categoryCommandModule from 'sysadmin/app/commands/category/saveCategory';
import categoryQueryModule from 'sysadmin/app/queries/category/getCategories';

export default angular.module('createEditCategoryControllerModule', [
  'ngRoute',
  categoryCommandModule.name,
  categoryQueryModule.name
]).controller('CreateEditCategoryController', function($location, $scope, GetCategoriesFactory, SaveCategoriesFactory, $routeParams) {
    this.id = null;
    if ($routeParams.id !== undefined)
    {
        this.id = $routeParams.id.replace(':', '');
        this.id = parseInt(this.id);  
    }
   
    if (this.id !== undefined && this.id !== null && !isNaN(this.id))
    {
        GetCategoriesFactory.byId(this.id).then((result) => {
            if (result.status === 200) {
                $scope.category = result.data.category;   
            } else {
                // failure msg
            }
        });
    }
    
    $scope.save = (category) => {
      SaveCategoriesFactory.saveCategory(category, (response) => {
        if (response.success) {
            $location.path("/categories");  
        } else {
            alert("unable to edit category");
        }
      });
    }
    
    $scope.back = () => {
	    $location.path("/categories");
    }
});