import angular from 'angular';

export default angular.module('categoryQueryModule', [
]).factory('GetCategoriesFactory', function($http) {
  
  let allCats = () => {
    let url = "/api/category/";
    return $http.get(url);
  }
  
  let byId = (id) => {
    let url = "/api/category/${id}";
    return $http.get(url);
  }

  return {
    allCats,
    byId
  }
});