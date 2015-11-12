import angular from 'angular';
import 'angular-route';

// see https://github.com/jackfranklin/jspm-es6-angular-example/blob/master/app/routes/repositories/repositories.controller.js
import repoServiceModule from 'app/services/repo.service';

export default angular.module('categoriesControllerModule', [
  'ngRoute',
  repoServiceModule.name
]).controller('RepositoriesController', function($routeParams, Repos) {
  this.name = $routeParams.name;

  Repos.getRepos(this.name).then((repos) => {
    this.repos = repos.data;
  });
});