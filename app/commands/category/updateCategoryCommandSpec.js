'use strict';
let mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../repositories/categoryRepository', {
	getCategory: function() {},
	updateCategory: function() {}
});
mockRequire('./validateCategory', {
    validate: (categoryData) => {
        return null;
    }
});
mockRequire('../../httpStatus', {
	   OK: 200,
       NOT_FOUND: 404
});
mockRequire('./dataCleaner', {
    cleanseCategory: (data) => {
	   return data;
    }
});
let categoryValidation = require("./validateCategory");
let categoryCommand = require("./updateCategoryCommand");
let categoryRepository = require("../../repositories/categoryRepository");
let result = null,
    testCategory = {   
        _id: 1,
        description: "my category", 
        vietDescription: "xin chao",
        level: 0 
    }, 
    updateCategory = {
        _id: 1,
        description: "my category", 
        vietDescription: "xin chao",
        level: 0,
        parentCategoryId: 11
    };;

describe("When the there is no category", () => {
	beforeEach((done) => {
		spyOn(categoryRepository, "getCategory").and.callFake(function(id, callback) {
			return callback({ status: 404, message: "Unable to find category: " + id });
		});
		
		categoryCommand.updateCategory(1, testCategory, function(res) {
			result = res;
			done();
		});
	});
	
	it("should give a 404 message in the result", () => { 
		expect(result.message).toBe("Unable to find category: 1");
		expect(result.status).toBe(404);
	});
});

describe("When everything is OK", () => {
    beforeEach((done) => {
		spyOn(categoryRepository, "getCategory").and.callFake(function(id, callback) {
			return callback({ status: 200, category: testCategory });
		});
		
		spyOn(categoryRepository, "updateCategory").and.callFake((categoryData, updateCategory, callback) => {
			return callback({ status: 200, category: updateCategory });
		});
		
        categoryCommand.updateCategory(1, updateCategory, function(res) {
            result = res;
            done();
        });
	});
	
	it("should call update category", () => {
        expect(categoryRepository.updateCategory).toHaveBeenCalled();
	});
    
    it("should have saved the information", () => {
        expect(result.category).toEqual(updateCategory);
    });
});

describe("When there is a parent category", () => {
	let result,
        parentCategory = {
            _id : 11,
            description: "parent category", 
            vietDescription: "fddfx",
            level: 0
        },
        parentCategoryId = 11;
    
    beforeEach((done) => {
		spyOn(categoryRepository, "getCategory").and.callFake(function(id, callback) {
            if (id === 1) {
                return callback({ status: 200, category: testCategory });
            }
			if (id === 11) {
                return callback({ status: 200, category: parentCategory });
            }
		});
		
		spyOn(categoryRepository, "updateCategory").and.callFake(function(categoryData, updateCategory, callback){
			return callback({ status: 200, category: updateCategory });
		});
		
        categoryCommand.updateCategory(1, updateCategory, function(res) {
            result = res;
            done();
        });
	});
	
	it("should call update category", () => {
        expect(categoryRepository.updateCategory).toHaveBeenCalled();
	});
    
    it("should have saved and returned the parent categorys", () => {
        expect(result.category.parentCategoryId).toEqual(parentCategoryId);
        expect(result.category.parentCategory).toEqual(parentCategory);
    });
});