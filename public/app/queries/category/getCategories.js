import angular from 'angular';
// import categoriesCacheModule from 'sysadmin/app/categoriesCache';

export default angular.module('categoryQueryModule', [
]
).factory('GetCategoriesFactory', function($http) {
  
  //let categoriesCacheName = categoriesCacheFactory.info().id;
  
  let allCats = () => {
    // if (categoriesCacheFactory.info().size === 0)
    // {
        let url = "/api/category/";
        return $http.get(url).then(function successCallback(response) { 
           //categoriesCacheFactory.put(categoriesCacheName, response.data.categories);
           return response.data.categories;
        });
    // }
    // return categoriesCacheFactory.get(categoriesCacheName);
  }
  
  let byId = (id) => {
    let categories = null;
    //categoriesCacheFactory.get(categoriesCacheName);
    if (categories === null || categories === undefined)
    {
        let url = `/api/category/${id}`;
        return $http.get(url);
    }
    let category = null;
    category = categories.filter(cat => cat._id === id).pop();
    return new Promise(function(resolve, reject) {
        resolve({ "status": 200, data: { category } });
    });
  }

  return {
    allCats,
    byId
  }
});