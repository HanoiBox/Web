import angular from 'angular';
import LocalStorageModule from 'angular-local-storage';

export default angular.module('listingCacheModule', [
   'LocalStorageModule'
]).factory('listingCacheFactory', function(localStorageService) {
    let listingsCacheName = "adverts";
        
    return {
        put: (listings) => {
            localStorageService.set(listingsCacheName, listings);
        },
        get: () => {
            let listings = localStorageService.get(listingsCacheName);

            return listings;
        },
        removeAll: () => {
            localStorageService.clearAll();
        }
    };
  });