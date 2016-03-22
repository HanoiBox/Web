import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import categoryCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    categoryCommandModule.name,
    navbarAppModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http, GenerateCategoryTree) {
    $scope.topCats = GenerateCategoryTree.generate(allCategories, null);
});