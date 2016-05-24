import angular from "angular";
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import advertQueryModule from '../../queries/listing/getListings';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module("CategoryControllerModule", [
    categoryQueryModule.name,
    advertQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name
]).controller("CategoryController", function($scope, allCategories, $location, $routeParams, GenerateCategoryTree, GetListingsFactory) {
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
    
    GetListingsFactory.listingsByCategoryId($scope.currentCategoryId).then((listings) => {
        $scope.allListings = listings.adverts;
    });
});