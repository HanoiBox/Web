'use strict';
var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
	   OK : 200
});
mockRequire('../../repositories/categoryRepository', {
	getCategories: function() {},
    findCategories: function() {},
    getCategory: function() {}
});
let categoryQuery = require("./getCategoryQuery.js");
let	result = null;
let categoryRepository = require("../../repositories/categoryRepository");
let httpStatus = { OK : 200 };

describe("When there is category data without parent id", () => {
	beforeEach((done) => {
        spyOn(categoryRepository, "getCategory").and.callFake((id, callback) => {
			return callback({ status: httpStatus.OK, category: { _id: 1 }});
		});
        
		categoryQuery.getCategory(1, (res) => {
			result = res;
			done();
		});
	});
	
	it("should give a category", () => { 
		expect(result.category._id).toBe(1);
		expect(result.status).toBe(200);
	});
});

describe("When there is category data with parent id", () => {
	beforeEach((done) => {
        let returnValues = {
            2 : { status: httpStatus.OK, category: { _id: 2, description: 'child category', parentCategoryId: 3 }}, 
            3: { status: httpStatus.OK, category: { _id: 3, description: 'parent category' }}
        };
        
        spyOn(categoryRepository, "getCategory").and.callFake((id, callback) => {
			return callback(returnValues[id]);
		});
        
		categoryQuery.getCategory(2, (res) => {
			result = res;
			done();
		});
	});
    
    it("should give a category", () => { 
		expect(result.category._id).toBe(2);
		expect(result.category.description).toBe("child category");
	});
	
	it("should give a parent category", () => { 
		expect(result.category.parentCategoryId).toBe(3);
		expect(result.category.parentCategory.description).toBe("parent category");
        expect(result.category.parentCategory._id).toBe(3);
	});
});