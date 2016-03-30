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
        let categories = [ { _id: 1, level: 0 }, { _id: 2, level: 0 } ];
        generateCategoryTreeFactory.generate(categories, 1, (result) => {
            theResult = result;
            done();
        });
    });
    
    it("Should return the two categories with no branches", () => {
        expect(theResult.length).toBe(2);
        expect(theResult[0]).not.toBeNull();
        expect(theResult[0].tree).toBeNull();
        expect(theResult[1]).not.toBeNull();
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

// describe('when there is one top level category with two subcategories', function() {
//     let theResult, generateCategoryTreeFactory;
    
//     beforeEach(inject((GenerateCategoryTree) => {
//         generateCategoryTreeFactory = GenerateCategoryTree;
//     }));
    
//     beforeEach((done) => {
//         let categories = [ 
//             { _id: 1, level: 0 }, 
//             { _id: 2, level: 1, parentCategoryId: 1 }, 
//             { _id: 3, level: 1, parentCategoryId: 1 } 
//         ];
        
//         generateCategoryTreeFactory.generate(categories, 1, (result) =>
//         {
//            theResult = result;
//            done(); 
//         });
//     })
    
//     it("Should return the top item with the corresponding tree", () => {
//         expect(theResult[0]).not.toBeUndefined();
//         console.log("tree", theResult[0]);
//     });
    
//     it("Should return the two subcategories", () => {
//         // let subCats = theResult.filter(res => res.level === 1);
//         // expect(subCats.length).toBe(2);
//         // expect(subCats[0].id).toBe(2);
//     });
// });