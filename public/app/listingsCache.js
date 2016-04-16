import angular from 'angular';
import LocalStorageModule from 'angular-local-storage';

export default angular.module('advertsCacheModule', [
   'LocalStorageModule'
]).factory('advertCacheFactory', function(localStorageService) {
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