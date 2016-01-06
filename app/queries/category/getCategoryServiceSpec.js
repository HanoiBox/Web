var httpStatus = require("../../httpStatus");
var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire('../../repositories/categoryRepository', {
	getCategory: function(id, callback) {
        if (id === 1) {
            return callback({ status: httpStatus.OK, category: { _id: 1 }});
        }
        if (id === 2) {
            return callback({ status: httpStatus.OK, category: { _id: 2, description: 'child category', parentCategoryId: 3 }});
        }
        if (id === 3) {
            return callback({ status: httpStatus.OK, category: { _id: 3, description: 'parent category' }});
        }
	},
});
var categoryQuery = require("./getCategoryQuery.js");

describe("When there is category data without parent id", () => {
	var result = null;
	beforeEach((done) => {
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
	var result = null;
	beforeEach((done) => {
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