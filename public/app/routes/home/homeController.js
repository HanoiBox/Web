import angular from 'angular';
import 'angular-route';

import categoryQueryModule from '../../queries/category/getCategories';
import advertQueryModule from '../../queries/listing/getListings';
import categoryTreeCommandModule from '../../commands/category/generateCategoryTree';
import clearCacheCommandModule from '../../commands/listing/clearListingCache';
import changeImageForListingsCommandModule from '../../commands/listing/changeImageForListingsCommand';
import navbarAppModule from '../../navbar/navbar';
import listingCacheModule from '../../../app/listingsCache';

export default angular.module('HomeControllerModule', [
    categoryQueryModule.name,
    advertQueryModule.name,
    categoryTreeCommandModule.name,
    navbarAppModule.name,
    listingCacheModule.name,
    clearCacheCommandModule.name,
    changeImageForListingsCommandModule.name
]).controller('HomeController', function($scope, allCategories, $location, $http, GenerateCategoryTree, allListings, clearListingCacheFactory, changeImageForListingsFactory) {
    GenerateCategoryTree.generate(allCategories, null, (categories) => {
        $scope.topCats = categories;
    });
    
    $scope.allListings = changeImageForListingsFactory.change(allListings);
    
    $scope.clearAdvertCache = () => {
        clearListingCacheFactory.clearAll();
    };
    
});