import angular from 'angular';

export default angular.module('categoryCommandModule', [
]).factory('SaveCategoriesFactory', function($http, $templateCache) {
  let url = "/api/category/";
  
  this.edit = (category, callback) => {
    let putUrl = url + category._id;
    $http.put(putUrl, category, $templateCache).then(() => {
      callback({ success : true });
    }, (response) => {
      callback({ success: false, response });
    }); 
  }
  
  this.save = (category, callback) => {
    return $http.post(url, category, $templateCache).then(() => {
      callback({ success: true });
    }, (response) => {
      callback({ success: false, response });
    });
  }
  
  let saveCategory = (category, callback) => {
    if (category._id === undefined || category._id === null) {
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