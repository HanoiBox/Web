import angular from 'angular';

export default angular.module('indexControllerModule', [])
.controller('IndexController', function($location, $scope) {
  this.foo = 2;
  
  $scope.toCategories = () => {
    $location.path("/categories");
  }
});