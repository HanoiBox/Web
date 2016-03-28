import angular from 'angular';
import 'angular-mocks';
import categoryTreeCommandModule from './generateCategoryTree';


beforeEach(() => {
    angular.mock.module(categoryTreeCommandModule.name);
});
    


describe('when test tab 1 is chosen', function() {
    let result, generateCategoryTreeFactory;
    
    beforeEach(inject((GenerateCategoryTree) => {
        
        generateCategoryTreeFactory = GenerateCategoryTree;
    }));
    
    beforeEach((done) => {
        let categories = [ { _id: 1 }, { _id: 1 } ];
        console.log('GenerateCategoryTree: ', generateCategoryTreeFactory.generate);
        result = generateCategoryTreeFactory.generate(categories, 1);
        done();
    })
    
    it("Should hold only top category in category tab", () => {
        console.log('result', result);
        expect(result.length).toBe(2);
        // expect(scope[0]).not.toBeNull();
    });
});

describe('test this works at all', function() {
    it("Should say it passed", function() {
        expect(0).toBe(0);
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