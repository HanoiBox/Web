import angular from 'angular';
import 'angular-mocks';

import categoryCommandModule from './saveCategory';
import categoriesCacheFactory from 'sysadmin/app/categoriesCache';

describe('saveNewCategory', function() {
    let testResult;
    
    beforeEach(function(done){
        angular.mock.module(function($provide){
            $provide.service('$http', function(){
                this.post = function() {
                    debugger;
                    return 'OK';
                }
            });
            $provide.service('categoriesCacheFactory', function(){
                
            });
        });
        angular.mock.module(categoryCommandModule.name);
        categoryCommandModule.saveCategory({
            _id: undefined,
            description: "Bikes"
        }, function(result) {
            testResult = result;
            done();
        });        
    });
    
    it("shouldAddNewCategoryToCache", function () {
        expect(testResult.description).toEqual('Bikes');
    });
    
});

describe('editExistingCategory', function() {
    
});