import angular from 'angular';
import 'angular-mocks';
import lowestCategoriesCommandModule from './findAllBottomLevelCategories';

beforeEach(() => {
    angular.mock.module(lowestCategoriesCommandModule.name);
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
    
    it("Should return both top level categories as they are considered to be the lowest", () => {
        //console.log("Two top level categories:", theResult);
        expect(theResult.length).toBe(2);
        expect(theResult[0].description).toBe("top 1");
        expect(theResult[1].description).toBe("top 2");
    });
});

describe('when there are two categories, one lower than the other', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ 
            { _id: 1, description: "top 1", level: 0 }, 
            { _id: 2, description: "top 2", level: 1, parentCategoryId: 1 } 
        ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        //console.log("Just lower category from 2:", theResult);
        expect(theResult.length).toBe(1);
        expect(theResult[0]._id).toBe(2);
    });
});

describe('when there are three categories on different levels', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ 
            { _id: 1, description: "top 1", level: 0 }, 
            { _id: 2, description: "upper", level: 1, parentCategoryId: 1 },
            { _id: 3, description: "lower", level: 2, parentCategoryId: 2 } 
        ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        //console.log("Just lower category from 3:", theResult);
        expect(theResult.length).toBe(1);
        expect(theResult[0]._id).toBe(3);
    });
});

describe('when there are two lowest categories', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ 
            { _id: 1, description: "top 1", level: 0 }, 
            { _id: 2, description: "upper", level: 1, parentCategoryId: 1 },
            { _id: 3, description: "lower", level: 2, parentCategoryId: 2 },
            { _id: 4, description: "lower 2", level: 2, parentCategoryId: 2 }
        ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        //console.log("Lower 2 categories from 4:", theResult);
        expect(theResult.length).toBe(2);
        expect(theResult[0]._id).toBe(3);
        expect(theResult[1]._id).toBe(4);
    });
});

describe('when there are three lowest categories and a lower top level category', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ 
            { _id: 1, description: "top 1", level: 0 },
            { _id: 6, description: "top 2 no children", level: 0 }, 
            { _id: 2, description: "upper", level: 1, parentCategoryId: 1 },
            { _id: 3, description: "lower", level: 2, parentCategoryId: 2 },
            { _id: 4, description: "lower 2", level: 2, parentCategoryId: 2 },
            { _id: 5, description: "lower 3", level: 2, parentCategoryId: 2 }
        ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        //console.log("Lower 3 + top 1 category from 6:", theResult);
        expect(theResult.length).toBe(4);
        expect(theResult[0]._id).toBe(3);
        expect(theResult[1]._id).toBe(4);
        expect(theResult[2]._id).toBe(5);
        expect(theResult[3]._id).toBe(6);
    });
});

describe('when there are two lowest categories and a lower upper level category', () => {
    let theResult, bottomLevelCategoriesFactory;
    
    beforeEach(inject((BottomLevelCategories) => {
        bottomLevelCategoriesFactory = BottomLevelCategories;
    }));
    
    beforeEach(() => {
        let categories = [ 
            { _id: 1, description: "top 1", level: 0 }, 
            { _id: 2, description: "upper", level: 1, parentCategoryId: 1 },
            { _id: 3, description: "upper", level: 1, parentCategoryId: 1 },
            { _id: 4, description: "lower", level: 2, parentCategoryId: 2 },
            { _id: 5, description: "lower 2", level: 2, parentCategoryId: 2 }
        ];
        theResult = bottomLevelCategoriesFactory.findAll(categories);
    });
    
    it("Should return just the lowest level category", () => {
        //console.log("Lower 2 + upper 1 category from 5:", theResult);
        expect(theResult.length).toBe(3);
        expect(theResult[0]._id).toBe(4);
        expect(theResult[1]._id).toBe(5);
        expect(theResult[2]._id).toBe(3);
    });
});