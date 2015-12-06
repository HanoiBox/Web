import angular from 'angular';

export default angular.module('deleteCategoryCommandModule', [
]).factory('DeleteCategoryFactory', function($http, $templateCache) {
  let url = "/api/category/";
  
  let execute = (id, callback) => {
    let deleteUrl = url + id;
    $http.delete(deleteUrl).then(() => {
      callback({ success : true });
    }, (response) => {
      callback({ success: false, response });
    }); 
  }

  return {
    execute
  }
});