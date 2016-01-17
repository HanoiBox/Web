import angular from 'angular';
import 'angular-cache';

export default angular.module('categoriesCacheModule', [
    'angular-cache'
]).config(function(CacheFactoryProvider) {
  angular.extend(CacheFactoryProvider.defaults, { maxAge: 15 * 60 * 1000 });
}).factory('categoriesCacheFactory', function($cacheFactory) {
        var categoryCache;

        // Check to make sure the cache doesn't already exist
        if (!$cacheFactory.get('categories')) {
            categoryCache = $cacheFactory('categories');
        }
        return categoryCache;
  });