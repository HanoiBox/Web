import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

let saveCategoriesFactory,
        httpBackend,
        templateCache,
        testCategory,
        categoriesCacheFactory;

    var cache = [];
        
beforeEach(() => {
    testCategory = {
        description: 'Bikes',
        parentCategoryId: "1"
    };
    
    angular.mock.module(categoryCommandModule.name);
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

describe('save new category fails', () => {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
    }));
    
    it('should fail with server error', () => {
         httpBackend.whenPOST('/api/category/').respond(500, { status: 500, message: "Something went wrong" });
         saveCategoriesFactory.saveCategory(testCategory, (result) => {
             expect(result.success).toBe(false);
             expect(result.error).toEqual("Something went wrong");
         });
         httpBackend.flush();
    });
})

describe('save new category', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
    }));

    it("should have saved the new category", function () {
        let categoryFromServer = { description: 'Bikes', parentCategory: [1], _id: 1 };
        httpBackend.whenPOST('/api/category/').respond(200, { status: 200, category: categoryFromServer });
                
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(result.success).toBe(true);
            expect(result.category.description).toEqual('Bikes');
            expect(result.category.parentCategory).toEqual([1]);
        });
        httpBackend.flush();
    });
    
    it("shouldHaveSavedToCache", () => {
       expect(categoriesCacheFactory.get()).toContain({ description: 'Bikes', parentCategory: [1], _id: 1 }); 
    });
});

describe('when edit Existing Category with no level', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        // pre populate cache with test category
        testCategory._id = 1;
        cache = [ testCategory ];
    }));
    
    it("should not return a true success flag", function () {
        httpBackend.whenPUT('/api/category/1').respond(400, { status: 400 });
        saveCategoriesFactory.saveCategory({ _id: 1, description: "my category" }, (result) => {
            expect(result.success).toEqual(false);
        });
        httpBackend.flush();
    });
});

describe('When Editing an existing category', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
    }));
    
    it("Should send updated Category to web API successfully", function () {
        // pre populate cache with test category
        cache = [ { _id: 1, description: "Bikes", parentCategoryId: 2 } ];
        httpBackend.whenPUT('/api/category/1').respond({ status: 200, category: { _id: 1, description: "Bikes 2", parentCategoryId: 1 } });
        saveCategoriesFactory.saveCategory({ _id: "1", description: "Bikes 2", parentCategoryId: 1 }, (result) => {
            expect(result.category._id).toEqual(1);
            expect(result.category.description).toEqual('Bikes 2');
            expect(result.category.parentCategoryId).toEqual(1);
        });
        httpBackend.flush();
    });
    
    it("Should add updated Category to cache", () => {
        expect(categoriesCacheFactory.info().size).toEqual(1);
        expect(categoriesCacheFactory.get("categoriesCache")).toContain({ _id: 1, description: 'Bikes 2', parentCategoryId: 1 });
    });
});

describe('When Category is null', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        // pre populate cache with test category
        cache = [{ _id: 1, description: "Bikes", parentCategoryId: 2 }];
        testCategory = null;
    }));
    
    it('should not do anything', function () {
        saveCategoriesFactory.saveCategory(null, (result) => {
            expect(result.success).toBe(false);
        });
    });
    
    it('should not update the cache', () => { 
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(categoriesCacheFactory.info().size).toEqual(1);
            expect(categoriesCacheFactory.get("categoriesCache")).toContain({ _id: 1, description: 'Bikes', parentCategoryId: 2 });
        });
    });
});