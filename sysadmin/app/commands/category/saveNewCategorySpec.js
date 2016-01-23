import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

let saveCategoriesFactory,
        httpBackend,
        templateCache,
        testCategory,
        theCategoriesCacheFactory,
        cache = [];
        
beforeEach(() => {
    testCategory = {
        description: 'Bikes',
        parentCategoryId: "1"
    };
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
    beforeEach(inject(($httpBackend, $templateCache, SaveCategoriesFactory, categoriesCacheFactory) => {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
        theCategoriesCacheFactory = categoriesCacheFactory;
    }));

    it("should have saved the new category", function () {
        let categoryFromServer = { description: 'Bikes', parentCategoryId: 1, _id: 1 };
        httpBackend.whenPOST('/api/category/').respond(200, { status: 200, category: categoryFromServer });
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            expect(result.success).toBe(true);
            expect(result.category.description).toEqual('Bikes');
            expect(result.category.parentCategoryId).toEqual(1);
        });
        httpBackend.flush();
    });
    
    it("shouldHaveSavedToCache", () => {
       expect(theCategoriesCacheFactory.get()).toContain({ description: 'Bikes', parentCategoryId: 1, _id: 1 }); 
    });
});