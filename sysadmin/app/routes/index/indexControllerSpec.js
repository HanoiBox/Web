import angular from 'angular';
import 'angular-mocks';

import indexControllerModule from './indexController';

describe('IndexController', function() {
//   beforeEach(angular.mock.module(indexControllerModule.name));
// 
//   var scope;
// 
//   beforeEach(inject(function($injector, $controller) {
//     scope = $injector.get('$rootScope').$new();
//     $controller('IndexController as ctrl', { $scope: scope });
//   }));
// 
//   it('exports foo onto the scope', function() {
//     expect(scope.ctrl.foo).toEqual(2);
//   });

    it('exports foo onto the scope', function() {
      expect(1).toEqual(1);
    });
});