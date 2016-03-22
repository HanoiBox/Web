import angular from "angular";
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module("CategoryControllerModule", [
    categoryQueryModule.name,
    categoryCommandModule.name,
    navbarAppModule.name
]).controller("CategoryController", function($scope, allCategories, $location, $routeParams, GenerateCategoryTree) {
    $scope.currentCategoryId = null;
    
    if ($routeParams.id !== undefined)
    {
        $scope.currentCategoryId = $routeParams.id.replace(":", "").replace("id", "");
        $scope.currentCategoryId = parseInt($scope.currentCategoryId);
        $scope.category = allCategories.find(cat => cat._id === $scope.currentCategoryId);
    }
    
   $scope.topCats = GenerateCategoryTree.generate(allCategories, $scope.currentCategoryId);
});