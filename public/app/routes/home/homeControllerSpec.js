import angular from 'angular';
import 'angular-mocks';

import homeControllerModule from './homeController';

describe('when test tab 1 is chosen', function() {
    var scope, $httpBackend, $location, $controller, createController, allCategoriesMock,
        level0Category = { 
            _id: 1,
            description: 'top level category',
            level: 0
        }, 
        level1Category = {
                _id: 2,
                description: 'bottom level category',
                level: 1,
                parentCategoryId: 1 
        };

    beforeEach(angular.mock.module(homeControllerModule.name));

    beforeEach(function() {
        allCategoriesMock = [ level0Category, level1Category ];
    });

    beforeEach(inject(function($injector) {
        scope = $injector.get('$rootScope').$new;
        $httpBackend = $injector.get('$httpBackend');
        $location = $injector.get('$location');
        $controller = $injector.get('$controller');
        
        createController = () => {
            $controller('HomeController', {
                $scope: scope,
                allCategories: allCategoriesMock,
                $location: $location,
                $http: $httpBackend
            });
        }
        
        createController();
    }));
    
    it("Should hold only top category in category tab", () => {
        expect(scope.categoryTabs.length).toBe(1);
        expect(scope.categoryTabs[0].id).toBe(level0Category._id);
        expect(scope.categoryTabs[0].categories.find(cat => cat.id === level1Category._id)).not.toBeNull();
    });
    
});

// describe('when test tab 2 is chosen', function() {
//     var scope, $httpBackend, $location, $controller, createController, allCategoriesMock,
//         testCategory = { 
//             _id: 2,
//             description: 'test category 2',
//             parentCategoryId: 1 
//     };
// 
//     beforeEach(angular.mock.module(homeControllerModule.name));
// 
//     beforeEach(function() {
//         allCategoriesMock = [{
//                 _id: 1,
//                 description: 'test category 1',
//                 level: 1
//             }, testCategory ];
//     });
// 
//     beforeEach(inject(function($injector) {
//         scope = $injector.get('$rootScope').$new;
//         $httpBackend = $injector.get('$httpBackend');
//         $location = $injector.get('$location');
//         $controller = $injector.get('$controller');
//         
//         createController = () => {
//             return $controller('HomeController', {
//                 $scope: scope,
//                 allCategories: allCategoriesMock,
//                 $location: $location,
//                 $http: $httpBackend
//             });
//         }
//     }));
//     
//     it("Should filter the category list for the tab", () => {
//         let homeController = createController();
//         homeController.loadSubCategories(1);
//         console.log("scope: ", scope.categoryTabs.categories);
//         expect(scope.categoryTabs.categories).toContain(testCategory);
//     });
//     
// });