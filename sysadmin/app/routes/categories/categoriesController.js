import angular from 'angular';
import 'angular-route';

import categoryQueryModule from 'sysadmin/app/queries/getCategories';
import deleteCategoryCommandModule from 'sysadmin/app/commands/category/deleteCategory';

var mystuff = angular.module('categoriesControllerModule', [
  'ngRoute',
  categoryQueryModule.name,
  deleteCategoryCommandModule.name
]).controller('CategoriesController', function(allCategories, $location, $scope, DeleteCategoryFactory) {
   this.allCategories = allCategories.data.categories;
   this.categories = allCategories.data.categories;
   
   this.level = null;
   
   $scope.edit = (id) => {
     let toPath = `/categories/edit:${id}`;
     $location.path(toPath);
   }
   
   $scope.create = () => {
     $location.path("/categories/create");
   }
   
   $scope.delete = (id) => {
     DeleteCategoryFactory.execute(id, (result) => {
       if (result.success) {
        this.categories = this.categories.filter((cat) => {
          if (cat._id !== id) {
            return true;
          } else {
            return false;
          }
        });
       } else {
         console.error(result);
       }
     });
   }
   
   $scope.filter = (level) => {
     if (level == null) {
       this.categories = this.allCategories;
     } else {
       this.categories = this.categories.filter((cat) => {
          if (cat.level === level) {
            return true;
          } else {
            return false;
          }
        });
     }
   }
   
   $scope.reset = () => {
     this.level = null;
     this.categories = this.allCategories;
   }
   
   $scope.back = () => {
     $location.path("/");
   }
});

export default mystuff;