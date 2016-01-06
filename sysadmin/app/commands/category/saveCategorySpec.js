import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

let saveCategoriesFactory,
        httpBackend,
        templateCache,
        testCategory,
        categoriesCacheFactory,
        cache = [];
        
beforeEach(() => {
    testCategory = {
        description: 'Bikes',
        parentCategory: [1]
    };
    
    angular.mock.module(categoryCommandModule.name);
    angular.mock.module(categoriesCacheModule.name, ($provide) => {
        categoriesCacheFactory = {
            put: function (name, categories) {
                cache = categories;
            },
            get: function (name) {
                return cache;
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
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(result.success).toEqual(false);
        });
        httpBackend.flush();
    });
});

describe('editExistingCategory', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        // pre populate cache with test category
        testCategory._id = 1;
        cache = [ testCategory ];
    }));
    
    it("shouldAddUpdatedCategoryToCache", function () {
        httpBackend.whenPUT('/api/category/1').respond({ status: 200 });
        testCategory.description = "Bikes 2";
        
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(result.category.description).toEqual('Bikes 2');
            expect(result.category.parentCategory).toEqual([1]);
        });
        httpBackend.flush();
    });
    
    it("shouldHaveUpdatedTheCache", () => {
        expect(categoriesCacheFactory.info().size).toEqual(1);
        expect(categoriesCacheFactory.get()).toContain(testCategory);
    });
});

describe('When Category Is Null', function() {
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        // pre populate cache with test category
        cache = [testCategory];
        testCategory = null;
    }));
    
    it('should not do anything', function () {
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(result.success).toBe(false);
        });
    });
    
    it('should not update the cache', () => { 
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(categoriesCacheFactory.info().size).toEqual(1);
            expect(categoriesCacheFactory.get()).toContain({ description: 'Bikes', parentCategory: [ 1 ] });
        });
    });
});