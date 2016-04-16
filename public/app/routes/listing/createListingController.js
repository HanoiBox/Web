import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module('CreateListingControllerModule', [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name
]).controller('CreateListingController', function($scope, allCategories, $location, $http, GenerateCategoryTree) {
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    $scope.doNotShowCreateListingButton = true;
    
    $scope.back = () => {
        //$location.
    };
});