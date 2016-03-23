import angular from 'angular';
import LocalStorageModule from 'angular-local-storage';

export default angular.module('categoriesCacheModule', ['LocalStorageModule']).factory('categoriesCacheFactory', function(localStorageService) {
        let categoriesCacheName = "categories";
        
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