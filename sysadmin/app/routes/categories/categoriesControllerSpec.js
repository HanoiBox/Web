import angular from 'angular';
import 'angular-mocks';

import repositoriesControllerModule from './categoriesController';

describe('CategoriesController', function() {
  beforeEach(angular.mock.module(repositoriesControllerModule.name));

  var scope, $httpBackend;
  
  beforeEach(inject(function($injector, $controller) {
    scope = $injector.get('$rootScope').$new();
    $httpBackend = $injector.get('$httpBackend');

    $controller('CategoriesController as ctrl', {
      $scope: scope
    });
  }));
  
  describe('fetching all categories', function() {
    beforeEach(function() {
      $httpBackend.
        expectGET('/api/category/').respond(200, { categories: [ { id: 1, name: 'foo' } ] });
    });

    it('gets us categories', function() {
      $httpBackend.flush();
      expect(scope.ctrl.categories).toEqual([{ id: 1, name: 'foo' }]);
    });
  });
});