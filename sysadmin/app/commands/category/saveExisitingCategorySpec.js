import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

let saveCategoriesFactory,
        httpBackend,
        templateCache,
        existingCategory,
        testCategory,
        categoriesCacheFactory,
        cache = [],
        result;
        
beforeEach(() => {
    angular.mock.module(categoriesCacheModule.name, ($provide) => {
        categoriesCacheFactory = {
            put: function (name, categories) {
                cache = [];
                cache = categories;
            },
            get: function (name) {
                return cache;
            },
            remove: function(name) {
                cache = [];
            },
            info: function () {
                return { id: 'categories', size: cache.length};
            }
        };
        $provide.factory('categoriesCacheFactory', function () {
            return categoriesCacheFactory;
        });
    }); 
});

describe('when edit Existing Category with no level', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        
        existingCategory = {
            _id: 1,
            description: 'Bikes'
        };
        testCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: "1"
        };
        // pre populate cache with pre exsiting category
        cache = [ existingCategory ];
    }));
    
    beforeEach((done) => {
        httpBackend.whenPUT('/api/category/1').respond(400, { status: 400 });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            result = result;
            done();
        });
        httpBackend.flush();
    });
    
    it("should not return a true success flag", function () {
        expect(result.success).toEqual(false);
    });
});

// describe('When editing an existing category adding a parent category', function() {
//     beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
//         saveCategoriesFactory = SaveCategoriesFactory;
//         httpBackend = $httpBackend;
//         templateCache = $templateCache;
//         
//         existingCategory = {
//             _id: 1,
//             description: 'Bikes'
//         };
//         testCategory = {
//             _id: 2,
//             description: 'My sub Category',
//             parentCategoryId: "1"
//         };
//         cache = [ existingCategory ];
//     }));
//     
//     beforeEach((done) => {
//         httpBackend.whenPUT('/api/category/1').respond({ status: 200, category: testCategory });
//         saveCategoriesFactory.saveCategory(testCategory, (result) => {
//             result = result;
//             done();
//         });
//         httpBackend.flush();
//     });
//     
//     it("Should send updated Category to web API successfully", function () {
//         expect(result.category._id).toEqual(2);
//         expect(result.category.description).toEqual('My sub Category');
//         expect(result.category.parentCategoryId).toEqual(1);
//     });
//     
//     it("Should add updated Category to cache", () => {
//         expect(categoriesCacheFactory.info().size).toEqual(1);
//         var theCachedCategory = categoriesCacheFactory.get("categoriesCache")[0];
//         expect(theCachedCategory._id).toEqual(2);
//         expect(theCachedCategory.description).toEqual('My sub Category');
//         expect(theCachedCategory.parentCategoryId).toEqual(1);
//     });
// });
// 
// describe('When editing an existing category removing the parent category', function() {
//     beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
//         saveCategoriesFactory = SaveCategoriesFactory;
//         httpBackend = $httpBackend;
//         templateCache = $templateCache;
//         existingCategory = {
//             _id: 1,
//             description: 'Bikes',
//             parentCategoryId: 1
//         };
//         testCategory = {
//             _id: 2,
//             description: 'My sub Category',
//             parentCategoryId: "null"
//         };
//         cache = [ existingCategory ];
//     }));
//     
//     beforeEach((done) => {
//         httpBackend.whenPUT('/api/category/1').respond({ status: 200, category: testCategory });
//         saveCategoriesFactory.saveCategory(testCategory, (result) => {
//             result = result;
//             done();
//         });
//         httpBackend.flush();
//     });
//     
//     it("Should send updated Category to web API successfully", function () {
//         expect(result.category._id).toEqual(2);
//         expect(result.category.description).toEqual('My sub Category');
//         expect(result.category.parentCategoryId).toBeUndefined();
//     });
//     
//     it("Should add updated Category to cache", () => {
//         expect(categoriesCacheFactory.info().size).toEqual(1);
//         var theCachedCategory = categoriesCacheFactory.get("categoriesCache")[0];
//         expect(theCachedCategory._id).toEqual(2);
//         expect(theCachedCategory.description).toEqual('My sub Category');
//         expect(theCachedCategory.parentCategoryId).toBeUndefined();
//     });
// });