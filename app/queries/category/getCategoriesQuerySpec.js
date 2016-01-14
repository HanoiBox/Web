'use strict';
var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
	   OK : 200
});
mockRequire('../../repositories/categoryRepository', {
    findCategories: function() {}
});
let categoryRepository = require("../../repositories/categoryRepository");
let categoriesQuery = require("./getCategoriesQuery");
let testCategory = { 
    _id: 1, 
    description: "other category", 
    parentCategoryId: 11    
}, parentCategory = {
    _id: 11,
    description: "parent category"
};

describe("When there is one category with a parent", () => {
    beforeEach(() => {
        spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({ status: 200, categories: [ testCategory, parentCategory ] });
		});
    });
    
    it("Should return a category with a parent category object", () => {
        categoriesQuery.getCategories((result) => {
            expect(result.categories[0].parentCategory).toEqual(parentCategory);
        })
    });
});

let testCategory2 = {
    _id: 2, 
    description: "other category", 
    parentCategoryId: 11 
}, result = null;
describe("When there are two categories with the same parent", () => {
    beforeEach((done) => {
        spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({ status: 200, categories: [ testCategory, testCategory2, parentCategory ] });
		});
        categoriesQuery.getCategories((res) => {
            result = res;
            done(); 
        });
    });
    
    it("Should return a category with a parent category object", () => {
        expect(result.categories[0].parentCategory).toEqual(parentCategory);
        expect(result.categories[1].parentCategory).toEqual(parentCategory);
    });
});

let testCategory3 = {
    _id: 3, 
    description: "other category", 
    parentCategoryId: 2 
}, testCategory4 = {
    _id: 4, 
    description: "other category" 
}
describe("When there are four categories", () => {
    beforeEach((done) => {
        spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({ status: 200, categories: [ testCategory, testCategory2, testCategory3, testCategory4, parentCategory ] });
		});
        categoriesQuery.getCategories((res) => {
            result = res;
            done(); 
        });
    });
    
    it("Should return a category with a parent category object", () => {
        expect(result.categories[0].parentCategory).toEqual(parentCategory);
        expect(result.categories[1].parentCategory).toEqual(parentCategory);
    });
    
    it("Should have 5 categories", () => {
        expect(result.categories.length).toBe(5);
    });
});