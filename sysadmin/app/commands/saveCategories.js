import angular from 'angular';

export default angular.module('categoryCommandModule', [
]).factory('SaveCategoriesFactory', function($http, $templateCache) {
  let url = "/api/category/";
  
  this.edit = (category, callback) => {
    $http.put(url, category, $templateCache).then(() => {
      callback(true);
    }, (response) => {
      callback(false);
    }); 
  }
  
  this.save = (category, callback) => {
    return $http.post(url, category, $templateCache).then(() => {
      callback(true);
    }, (response) => {
      callback(false);
    });
  }
  
  let saveCategory = (category, callback) => {
    if (category.id === undefined || category.id === null) {
      this.save(category, (result) => {
        callback(result);
      }); 
    } else {
      this.edit(category, (result) => {
        callback(result);
      }); 
    }
  }

  return {
    saveCategory
  }
});