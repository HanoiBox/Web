import angular from 'angular';
import 'angular-route';

//import repoServiceModule from 'app/services/repo.service';

var mystuff = angular.module('categoriesControllerModule', [
  'ngRoute'
  //repoServiceModule.name
]).controller('CategoriesController', function($routeParams, Repos) {
    var categories = [ "bike", "lunch" ];
    this.repos = categories;
});

export default mystuff;