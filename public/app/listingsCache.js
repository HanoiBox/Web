import angular from 'angular';
import LocalStorageModule from 'angular-local-storage';

export default angular.module('listingCacheModule', [
   'LocalStorageModule'
]).factory('listingCacheFactory', function(localStorageService) {
    let categoriesCacheName = "adverts";
        
    return {
        put: (categories) => {
            localStorageService.set(categoriesCacheName, categories);
        },
        get: () => {
            let categories = localStorageService.get(categoriesCacheName);
            return categories;
        },
        removeAll: () => {
            localStorageService.clearAll();
        }
    };
  });