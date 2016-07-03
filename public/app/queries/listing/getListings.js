import angular from 'angular';
import listingsCacheModule from 'public/app/listingsCache';

export default angular.module('ListingQueryModule', [
   listingsCacheModule.name
]).factory('GetListingsFactory', function($http, listingCacheFactory) {
  
  let allListings = () => {
    let adverts = listingCacheFactory.get();
    if (adverts == null || adverts.length === 0)
    {
      let url = "/api/listing/";
      return $http.get(url).then(function successCallback(response) { 
          listingCacheFactory.put(response.data.listings);
          return listingCacheFactory.get();
      });
    }
    return listingCacheFactory.get();
  };
  
  let listingsByCategoryId = (categoryId) => {
    let url = `/api/listing/category/${categoryId}`;
    return $http.get(url).then(function successCallback(response) { 
        listingCacheFactory.put(response.data.listings);
        return listingCacheFactory.get();
    });
  };
  
  let byId = (id) => {
    let adverts = listingCacheFactory.get();
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
    allListings,
    listingsByCategoryId,
    byId
  };
});