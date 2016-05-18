import angular from 'angular';
import 'angular-mocks';
import categoryUtilitiesCommandModule from './findAllBottomLevelCategories';

beforeEach(() => {
    angular.mock.module(categoryUtilitiesCommandModule.name);
});

describe('when there are two top level categories only', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ { _id: 1, description: "top 1", level: 0 }, { _id: 2, description: "top 2", level: 0 } ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return nothing as these have been excluded", () => {
        console.log(theResult);
        expect(theResult.length).toBe(0);
        expect(theResult[0]).toBeUndefined();
    });
});

describe('when there are two categories, one lower than the other', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ { _id: 1, description: "top 1", level: 0 }, { _id: 2, description: "top 2", level: 1 } ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        console.log(theResult);
        expect(theResult.length).toBe(1);
        expect(theResult[0]._id).toBe(2);
    });
});

describe('when there are three categories, one lower than the other', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ { _id: 1, description: "top 1", level: 0 }, { _id: 2, description: "top 2", level: 1 } ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        console.log(theResult);
        expect(theResult.length).toBe(1);
        expect(theResult[0]._id).toBe(2);
    });
});