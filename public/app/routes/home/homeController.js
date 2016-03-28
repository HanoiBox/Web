import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http, GenerateCategoryTree) {
    $scope.topCats = GenerateCategoryTree.generate(allCategories, null);
});