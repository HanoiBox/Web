import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import advertQueryModule from '../../queries/listing/getListings';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import navbarAppModule from '../../navbar/navbar';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    advertQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http, GenerateCategoryTree, GetAdvertsFactory) {
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    GetAdvertsFactory.allAdverts((adverts) => {
        $scope.allAdverts = adverts;
    });
});