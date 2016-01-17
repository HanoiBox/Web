'use strict';

var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
	OK: 200
});
mockRequire('../../repositories/categoryRepository', {
	getCategories: function getCategories() {},
	findCategories: function findCategories() {},
	getCategory: function getCategory() {}
});
var categoryQuery = require("./getCategoryQuery.js");
var result = null;
var categoryRepository = require("../../repositories/categoryRepository");
var httpStatus = { OK: 200 };

describe("When there is category data without parent id", function () {
	beforeEach(function (done) {
		spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
			return callback({ status: httpStatus.OK, category: { _id: 1 } });
		});

		categoryQuery.getCategory(1, function (res) {
			result = res;
			done();
		});
	});

	it("should give a category", function () {
		expect(result.category._id).toBe(1);
		expect(result.status).toBe(200);
	});
});

describe("When there is category data with parent id", function () {
	beforeEach(function (done) {
		var returnValues = {
			2: { status: httpStatus.OK, category: { _id: 2, description: 'child category', parentCategoryId: 3 } },
			3: { status: httpStatus.OK, category: { _id: 3, description: 'parent category' } }
		};

		spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
			return callback(returnValues[id]);
		});

		categoryQuery.getCategory(2, function (res) {
			result = res;
			done();
		});
	});

	it("should give a category", function () {
		expect(result.category._id).toBe(2);
		expect(result.category.description).toBe("child category");
	});

	it("should give a parent category", function () {
		expect(result.category.parentCategoryId).toBe(3);
		expect(result.category.parentCategory.description).toBe("parent category");
		expect(result.category.parentCategory._id).toBe(3);
	});
});