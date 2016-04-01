import angular from 'angular';
import 'angular-mocks';
import categoryTreeCommandModule from './generateCategoryTree';


beforeEach(() => {
    angular.mock.module(categoryTreeCommandModule.name);
});

describe('when there are two top level categories only', function() {
    let theResult, generateCategoryTreeFactory;
    
    beforeEach(inject((GenerateCategoryTree) => {
        generateCategoryTreeFactory = GenerateCategoryTree;
    }));
    
    beforeEach((done) => {
        let categories = [ { _id: 1, description: "top 1", level: 0 }, { _id: 2, description: "top 2", level: 0 } ];
        generateCategoryTreeFactory.generate(categories, 1, (result) => {
            theResult = result;
            done();
        });
    });
    
    it("Should return the two categories with no branches", () => {
        console.log(theResult.length);
        expect(theResult.length).toBe(2);
        expect(theResult[0]).not.toBeNull();
        expect(theResult[0].title).toBe("top 1");
        expect(theResult[0].tree).toBeNull();
        expect(theResult[1]).not.toBeNull();
        expect(theResult[1].title).toBe("top 2");
        expect(theResult[1].tree).toBeNull();
    });
});

describe('when there is one top level category with one subcategory', function() {
    let theResult, generateCategoryTreeFactory;
    
    beforeEach(inject((GenerateCategoryTree) => {
        generateCategoryTreeFactory = GenerateCategoryTree;
    }));
    
    beforeEach((done) => {
        let categories = [ 
            { _id: 1, level: 0 }, 
            { _id: 2, level: 1, parentCategoryId: 1 }
        ];
        
        generateCategoryTreeFactory.generate(categories, 1, (result) =>
        {
           theResult = result;
           done(); 
        });
    });
    
    it("Should return the top item with the corresponding tree", () => {
        console.log("result", theResult);
        expect(theResult[0].tree).not.toBeUndefined();
        expect(theResult[0].tree).not.toBeNull();
        expect(theResult[0].tree[0].id).toBe(2);
    });
});

describe('when there is one top level category with two subcategories', function() {
    let theResult, generateCategoryTreeFactory;
    
    beforeEach(inject((GenerateCategoryTree) => {
        generateCategoryTreeFactory = GenerateCategoryTree;
    }));
    
    beforeEach((done) => {
        let categories = [ 
            { _id: 1, level: 0 }, 
            { _id: 2, level: 1, parentCategoryId: 1 }, 
            { _id: 3, level: 1, parentCategoryId: 1 } 
        ];
        
        generateCategoryTreeFactory.generate(categories, 1, (result) =>
        {
           theResult = result;
           done(); 
        });
    })
    
    it("Should return the top item with the corresponding tree", () => {
        expect(theResult[0]).not.toBeUndefined();
        expect(theResult.length).toBe(1);
    });
    
    it("Should return the two subcategories", () => {
        expect(theResult[0].tree.length).toBe(2);
        expect(theResult[0].tree[0].id).toBe(2);
        expect(theResult[0].tree[1].id).toBe(3);
    });
});

describe('when there is a top level category with a subcategory which has a further subcategory belonging to it', function() {
    let theResult, generateCategoryTreeFactory;
    
    beforeEach(inject((GenerateCategoryTree) => {
        generateCategoryTreeFactory = GenerateCategoryTree;
    }));
    
    beforeEach((done) => {
        let categories = [ 
            { _id: 1, level: 0 }, 
            { _id: 2, level: 1, parentCategoryId: 1 }, 
            { _id: 3, level: 2, parentCategoryId: 2, description: "SubSubCategory" } 
        ];
        
        generateCategoryTreeFactory.generate(categories, 1, (result) =>
        {
           theResult = result;
           done(); 
        });
    })
    
    it("Should return the top item with the corresponding tree", () => {
        expect(theResult[0]).not.toBeUndefined();
        expect(theResult.length).toBe(1);
    });
    
    it("Should return the sub, subcategory", () => {
        expect(theResult[0].tree[0].tree).not.toBeUndefined();
        expect(theResult[0].tree[0].tree).not.toBeNull();
        expect(theResult[0].tree[0].tree[0].id).toBe(3);
    });
});

// describe('when there are two top level category one of which has two subcategories, one of which has a further subcategory belonging to it', function() {
//     let theResult, generateCategoryTreeFactory;
    
//     beforeEach(inject((GenerateCategoryTree) => {
//         generateCategoryTreeFactory = GenerateCategoryTree;
//     }));
    
//     beforeEach((done) => {
//         let categories = [ 
//             { _id: 1, level: 0 },
//             { _id: 2, level: 0 },
//             { _id: 3, level: 1, parentCategoryId: 1 },
//             { _id: 4, level: 1, parentCategoryId: 1 },
//             { _id: 5, level: 2, parentCategoryId: 3, description: "SubSubCategory" } 
//         ];
        
//         generateCategoryTreeFactory.generate(categories, 1, (result) =>
//         {
//            theResult = result;
//            done(); 
//         });
//     })
    
    // it("Should return the top items", () => {
    //     console.log(theResult);
    //     expect(theResult.length).toBe(2);
    //     expect(theResult[0]).not.toBeUndefined();
    //     expect(theResult[0]).not.toBeNull();
    //     expect(theResult[1]).not.toBeUndefined();
    //     expect(theResult[1]).not.toBeNull();
    // });
    
    // it("Should return an empty tree for the second top item", () => {
    //     expect(theResult[0].tree).not.toBeNull();
    //     expect(theResult[1].tree).toBeNull();
    // });
    
    // it("Should return the subcategories", () => {
    //     expect(theResult[0].tree[0]).not.toBeUndefined();
    //     expect(theResult[0].tree[0]).not.toBeNull();
    //     expect(theResult[0].tree[0].id).toBe(3);
        
    //     expect(theResult[0].tree[1].tree).not.toBeUndefined();
    //     expect(theResult[0].tree[1].tree).not.toBeNull();
    //     expect(theResult[0].tree[1].id).toBe(4);
    // });
    
    // it("Should return the sub, subcategory", () => {
    //     expect(theResult[0].tree[0].tree).not.toBeUndefined();
    //     expect(theResult[0].tree[0].tree).not.toBeNull();
    //     expect(theResult[0].tree[0].tree[0].id).toBe(5);
    // });
// });