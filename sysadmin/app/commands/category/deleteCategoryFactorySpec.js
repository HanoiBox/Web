import angular from 'angular';
import 'angular-mocks';

import deleteCategoryCommandModule from './deleteCategory';

let deleteCategoryFactory, theResult, httpBackend;

beforeEach(() => {
    angular.mock.module(deleteCategoryCommandModule.name);
});

describe('when nothing to delete', () => {
    beforeEach(inject(($httpBackend, DeleteCategoryFactory) => {
        httpBackend = $httpBackend;
        deleteCategoryFactory = DeleteCategoryFactory;
    }));
    
    beforeEach((done) => {
        httpBackend.whenDELETE('/api/category/1').respond((method, url, data, headers) => { 
            return [404, 'NOT-FOUND!!'];
        });
        
        deleteCategoryFactory.execute(1, (result) => {
            theResult = result;
            done(); 
        });
        httpBackend.flush();    
    });
    
    it("Should fail to delete", function () {
        expect(theResult.success).toBe(false);
    });
    
});