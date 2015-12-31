import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

describe('saveNewCategory', function() {
    let saveCategoriesFactory,
        httpBackend,
        templateCache,
        testCategory;
    
    beforeEach(() => {
        angular.mock.module(categoryCommandModule.name);
        angular.mock.module(categoriesCacheModule.name, ($provide) => {
            $provide.factory('categoriesCacheFactory', function () {
                return {
                        put: function (category) {
                            },
                        get: function (name) {
                                return [];
                            },
                        info: function () {
                                return { id: 'categories'};
                            }
                        };
            });
        }); 
    });
    
    beforeEach(inject(function($httpBackend, $templateCache, SaveCategoriesFactory) {
        saveCategoriesFactory = SaveCategoriesFactory;
        httpBackend = $httpBackend;
        templateCache = $templateCache;
    }));
    
    beforeEach(() => {
        testCategory = {
            description: 'Bikes'
        };
    });
    
    it("shouldAddNewCategoryToCache", function () {
        httpBackend.whenPOST('/api/category/').respond({ status: 200 });
                
        saveCategoriesFactory.saveCategory(testCategory, (result) => {
            console.log(result);
            expect(result.category.description).toEqual('Bikes');    
        });
        httpBackend.flush();
    });
    
});

describe('editExistingCategory', function() {
    
});