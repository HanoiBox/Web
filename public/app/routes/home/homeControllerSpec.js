import angular from 'angular';
import 'angular-mocks';

import homeControllerModule from './homeController';

describe('basic', function() {
    it("Should check", function () {
        expect(1).toEqual(1);
    });
});

describe('when tab 1 is chosen', function() {
    var scope, $httpBackend, $location, $controller, createController, allCategoriesMock,
        testCategory = { 
            _id: 2,
            description: 'test category 2',
            parentCategoryId: 1 
    };

    beforeEach(angular.mock.module(homeControllerModule.name));

    beforeEach(function() {
        allCategoriesMock = [{
                _id: 1,
                description: 'test category 1',
                level: 1
            }, testCategory ];
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
    }));
    
    it("Should filter the category list for the tab", () => {
        let homeController = createController();
        console.log("ctrl: ", homeController);
        homeController.selectSubCategories(1);
        expect(homeControllerModule.categoryTabs.categories[0]).toBe(testCategory);
    });
    
});