import angular from 'angular';
// import categoriesCacheModule from 'sysadmin/app/categoriesCache';

export default angular.module('categoryQueryModule', [])
.factory('GetCategoriesFactory', function($http) {
  
  let allCats = () => {
        let url = "/api/category/";
        return $http.get(url).then(function successCallback(response) {
           return response.data.categories;
        });
  }
  
  let byId = (id) => {
    let categories = null;
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