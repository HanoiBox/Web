import angular from 'angular';
import categoriesCacheModule from '../../categoriesCache';

export default angular.module('categoryQueryModule', [
   categoriesCacheModule.name
]
).factory('GetCategoriesFactory', function($http, categoriesCacheFactory) {
  
  let allCats = () => {
      var categories = categoriesCacheFactory.get();
    if (categories == null || categories.length === 0)
    {
        let url = "/api/backend/category/";
        return $http.get(url).then(function successCallback(response) { 
           categoriesCacheFactory.put(response.data.categories);
           return categoriesCacheFactory.get();
        });
    }
    return categoriesCacheFactory.get();
  }
  
  let byId = (id) => {
    let categories = categoriesCacheFactory.get();
    if (categories === null || categories === undefined)
    {
        let url = `/api/category/${id}`;
        return $http.get(url);
    }
    let category = null;
    category = categories.filter(cat => cat._id === id).pop();
    console.log("from cache", category);
    return new Promise(function(resolve, reject) {
        resolve({ "status": 200, data: { category } });
    });
  }

  return {
    allCats,
    byId
  }
});