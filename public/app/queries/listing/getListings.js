import angular from 'angular';
import advertsCacheModule from 'public/app/listingsCache';

export default angular.module('advertQueryModule', [
   advertsCacheModule.name
]).factory('GetAdvertsFactory', function($http, advertCacheFactory) {
  
  let allAdverts = (callback) => {
    let adverts = advertCacheFactory.get();
    if (adverts == null || adverts.length === 0)
    {
      let url = "/api/listing/";
      $http.get(url).then(function successCallback(response) { 
          advertCacheFactory.put(response.data);
          return callback(advertCacheFactory.get());
      });
    } else {
      return callback(advertCacheFactory.get());
    }
  };
  
  let advertsByCategoryId = (categoryId, callback) => {
    let url = `/api/listing/category/${categoryId}`;
    $http.get(url).then(function successCallback(response) { 
        advertCacheFactory.put(response.data);
        return callback(advertCacheFactory.get());
    });
  };
  
  let byId = (id) => {
    let adverts = advertCacheFactory.get();
    if (adverts === null || adverts === undefined)
    {
        let url = `/api/listing/${id}`;
        return $http.get(url);
    }
    let advert = null;
    advert = adverts.filter(cat => cat._id === id).pop();
    return new Promise(function(resolve, reject) {
        resolve({ "status": 200, data: { advert } });
    });
  };

  return {
    allAdverts,
    advertsByCategoryId,
    byId
  };
});