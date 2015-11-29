import angular from 'angular';
import 'angular-mocks';

import categoriesControllerModule from './categoriesController';

describe('CategoriesController', function() {
  var scope, $httpBackend, $controller, createController;
  
  beforeEach(angular.mock.module(categoriesControllerModule.name));
  
  beforeEach(inject(function($injector) {
    scope = $injector.get('$rootScope').$new;
    $httpBackend = $injector.get('$httpBackend');
    $controller = $injector.get('$controller');

    createController = function() {
      return $controller('CategoriesController', {
        $scope: scope
      });  
    }
    
  }));
  
  describe('fetching all categories', function() {
    beforeEach(function() {
      $httpBackend.
        when('GET', '/api/category/').respond({ categories: [ { id: 1, name: 'foo' } ] });
    });

    it('gets us categories', function() {
      let controller = createController();
      $httpBackend.flush();
      $httpBackend.expectGET('/api/category/');
      console.debug("this is the scope", controller);
      expect(scope.ctrl).toEqual(1);
    });
  });
});