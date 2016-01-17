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
        parentCategoryId: "1"
    };

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