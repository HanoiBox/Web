import angular from "angular";
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module("CategoryControllerModule", [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name
]).controller("CategoryController", function($scope, allCategories, $location, $routeParams, GenerateCategoryTree) {
    $scope.currentCategoryId = null;
    
    if ($routeParams.id !== undefined)
    {
        $scope.currentCategoryId = $routeParams.id.replace(":", "").replace("id", "");
        $scope.currentCategoryId = parseInt($scope.currentCategoryId);
        $scope.category = allCategories.find(cat => cat._id === $scope.currentCategoryId);
    }
    
    GenerateCategoryTree.generate(allCategories, $scope.currentCategoryId, (categories) => {
        $scope.topCats = categories;
    });
});