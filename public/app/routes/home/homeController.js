import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import advertQueryModule from '../../queries/listing/getListings';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import clearCacheCommandModule from '../../commands/listing/clearListingCache';
import navbarAppModule from '../../navbar/navbar';
import listingCacheModule from 'public/app/listingsCache';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    advertQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name,
    listingCacheModule.name,
    clearCacheCommandModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http, GenerateCategoryTree, allListings, clearListingCacheFactory) {
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    $scope.allListings = allListings;
    
    $scope.clearAdvertCache = () => {
        clearListingCacheFactory.clearAll();
    };
    
});