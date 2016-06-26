import angular from 'angular';
import 'angular-route';

import categoryCommandModule from 'sysadmin/app/commands/category/saveCategory';
import categoryQueryModule from 'sysadmin/app/queries/category/getCategories';
import 'angular-ui/ui-tinymce';
import 'tinymce';
import '../../tinymce/themes/modern/theme';
import '../../tinymce/plugins/code/plugin';
import '../../tinymce/plugins/image/plugin';
import '../../tinymce/plugins/link/plugin';

export default angular.module('createEditCategoryControllerModule', [
  'ngRoute',
  categoryCommandModule.name,
  categoryQueryModule.name,
  'ui.tinymce'
]).config(function() {
    tinyMCE.baseURL = '/sysadmin/app/tinymce';
    //tinyMCE.suffix = '.min';
}).controller('CreateEditCategoryController', function($location, $scope, GetCategoriesFactory, SaveCategoriesFactory, $routeParams, allCategories) {
    this.id = null;
    $scope.errors = false;
    $scope.data = { categories: allCategories };
    
    $scope.tinymceModel = 'Initial content';
    $scope.getContent = function() {
        console.log('Editor content:', $scope.tinymceModel);
    };

    $scope.setContent = function() {
        $scope.tinymceModel = 'Time: ' + (new Date());
    };

    $scope.tinymceOptions = {
        plugins: 'link image code',
        toolbar: 'undo redo | bold italic | alignleft aligncenter alignright | code'
    };

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
            // I should only see categories from the level above
            $scope.data.categories = allCategories.filter(cat => cat.level === Math.abs((value - 1)));    
        } else {
            $scope.data.categories = allCategories;
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