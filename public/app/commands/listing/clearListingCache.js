import angular from 'angular';
import listingsCacheModule from 'public/app/listingsCache';

export default angular.module('clearCacheCommandModule', [
    listingsCacheModule.name
]).factory('clearListingCacheFactory', ['listingCacheFactory', function(listingCacheFactory) {
   
   return {
       clearAll: () => {
           listingCacheFactory.removeAll();
       }
   }
    
}]);