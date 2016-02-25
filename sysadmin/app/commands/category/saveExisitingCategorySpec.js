import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

let saveCategoriesFactory,
        httpBackend,
        templateCache,
        existingTestCategory,
        parentCategory,
        testCategory,
        updatedCategory,
        theCategoriesCacheFactory,
        testCachedCategory,
        cache = [],
        theResult;
        
beforeEach(() => {
    angular.mock.module(categoryCommandModule.name, ($provide) => {
        let categoriesCacheFactory = {
            put: (categories) => {
                cache = [];
                // console.log("putting to the cache", categories);
                cache = categories;
            },
            get: () => {
                // console.log("getting", cache);
                return cache;
            },
            removeAll: () => {
                cache = [];
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
        
        existingTestCategory = {
            _id: 1,
            description: 'Bikes'
        };
        testCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: "1"
        };
    }));
    
    beforeEach((done) => {
        httpBackend.whenPUT('/api/category/1').respond(400, { status: 400 });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            theResult = result;
            done();
        });
        httpBackend.flush();
    });
    
    it("should not return a true success flag", function () {
        expect(theResult.success).toEqual(false);
    });
});

describe("Editing a category without a parent category", function () {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory, categoriesCacheFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        theCategoriesCacheFactory = categoriesCacheFactory;
        
        existingTestCategory = {
            _id: 1,
            description: 'Bikes',
            parentCategoryId: null
        };
        testCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: "null"
        };
        updatedCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: null
        };
        theCategoriesCacheFactory.put([ existingTestCategory ]);
    }));
    
    beforeEach((done) => {
        httpBackend.whenPUT('/api/category/1').respond({ status: 200, category: updatedCategory });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            theResult = result;
            done();
        });
        httpBackend.flush();
    });
    
    it("Should update the category", function () {
        expect(theResult.success).toBe(true);
        expect(theResult.category.description).toEqual('My sub Category');
        expect(theResult.category.parentCategoryId).toBeNull();
    });
});

describe('When adding a parent category to an existing category', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory, categoriesCacheFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        theCategoriesCacheFactory = categoriesCacheFactory;
        
        parentCategory = {
            _id: 2,
            description: 'My parent Category',
            parentCategoryId: null
        }
        existingTestCategory = {
            _id: 1,
            description: 'Bikes'
        };
        testCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: "2"
        };
        updatedCategory = {
            _id: 1,
            description: 'My sub Category',
            parentCategoryId: 2
        };
        theCategoriesCacheFactory.put([ existingTestCategory, parentCategory ]);
    }));
    
    beforeEach((done) => {
        httpBackend.whenPUT('/api/category/1').respond({ status: 200, category: updatedCategory });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            theResult = result;
            done();
        });
        httpBackend.flush();
    });
    
    it("Should update the Category with a parent category", function () {
        expect(theResult.success).toBe(true);
        expect(theResult.category.description).toEqual('My sub Category');
        expect(theResult.category.parentCategoryId).toEqual(2);
    });
    
    it("Should add updated Category to cache", () => {
        var theCachedCategories = theCategoriesCacheFactory.get();
            testCachedCategory = theCachedCategories.find(cat => cat._id === 1);
        expect(theCategoriesCacheFactory.get().length).toEqual(2);
        expect(testCachedCategory.description).toEqual('My sub Category');
        expect(testCachedCategory.parentCategoryId).toBe(parentCategory._id);
    });
});

describe('When editing an existing category removing the parent category', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory, categoriesCacheFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        theCategoriesCacheFactory = categoriesCacheFactory;
        
        existingTestCategory = {
            _id: 2,
            description: 'My sub Category',
            parentCategoryId: 1
        };
        testCategory = {
            _id: 2,
            description: 'My sub Category',
            parentCategoryId: "undefined"
        };
        updatedCategory = {
            _id: 2,
            description: 'My sub Category',
            parentCategoryId: undefined
        };
        theCategoriesCacheFactory.put([ existingTestCategory ]);
    }));
    
    beforeEach((done) => {
        httpBackend.whenPUT('/api/category/2').respond({ status: 200, category: updatedCategory });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            theResult = result;
            done();
        });
        httpBackend.flush();
    });
    
    it("Should send updated Category to web API successfully", function () {
        expect(theResult.category._id).toEqual(2);
        expect(theResult.category.description).toEqual('My sub Category');
        expect(theResult.category.parentCategoryId).toBeUndefined();
    });
    
    it("Should add updated Category to cache", () => {
        expect(theCategoriesCacheFactory.get().length).toEqual(1);
        var theCachedCategory = theCategoriesCacheFactory.get("categoriesCache")[0];
        expect(theCachedCategory._id).toEqual(2);
        expect(theCachedCategory.description).toEqual('My sub Category');
        expect(theCachedCategory.parentCategoryId).toBeUndefined();
    });
});