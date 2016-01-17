'use strict';

var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../repositories/categoryRepository', {
	findCategories: function findCategories(callback) {
		console.log('categoryRepository.find called');
		return callback(null);
	},
	saveCategory: function saveCategory(callback) {
		console.log('categoryRepository.save called');
		return callback(null);
	}
});
mockRequire('./validateCategory', {
	validate: function validate(categoryData) {
		return null;
	}
});
mockRequire('../../httpStatus', {
	OK: 200,
	CREATED: 201,
	NOT_FOUND: 404
});
mockRequire('./dataCleaner', {
	cleanseCategory: function cleanseCategory(data) {
		return data;
	}
});
var categoryValidation = require("./validateCategory");
var categoryCommand = require("./saveCategoryCommand");
var categoryRepository = require("../../repositories/categoryRepository");
describe("When the find Categories method returns an error", function () {
	var result = null;
	beforeEach(function (done) {
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({ status: 404, error: "no categories found" });
		});

		categoryCommand.saveCategory({
			description: "my category",
			vietDescription: "xin chao",
			level: 0 }, function (res) {
			result = res;
			done();
		});
	});

	it("should give an error message in the result", function () {
		expect(result.message).toBe("Handler rejected because : no categories found");
		expect(result.status).toBe(404);
	});
});

describe("When the find Categories method returns a duplicate category", function () {
	var result;

	beforeEach(function (done) {
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({
				categories: [{
					_id: 1,
					description: "my category"
				}]
			});
		});

		categoryCommand.saveCategory({
			description: "my category",
			vietDescription: "xin chao",
			level: 0 }, function (res) {
			result = res;
			done();
		});
	});

	it("should give an error message in the result", function () {
		expect(result.message).toBe("Duplicate description");
		expect(result.status).toBe(400);
	});
});

describe("When everything is OK", function () {
	var result,
	    testCategory = {
		description: "my category",
		vietDescription: "xin chao",
		level: 0
	};

	beforeEach(function (done) {
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({ categories: [{ _id: 1, description: "other category" }] });
		});

		spyOn(categoryRepository, "saveCategory").and.callFake(function (categoryData, callback) {
			return callback({ status: 201, category: testCategory });
		});

		categoryCommand.saveCategory(testCategory, function (res) {
			result = res;
			done();
		});
	});

	it("should call the save category to db function", function () {
		expect(categoryRepository.saveCategory).toHaveBeenCalled();
	});

	it("should have saved the information", function () {
		expect(result.category).toEqual(testCategory);
		expect(result.status).toEqual(201);
	});
});

describe("When there is a parent category", function () {
	var result,
	    testCategory = {
		description: "my category",
		vietDescription: "xin chao",
		level: 1,
		parentCategoryId: "11"
	},
	    parentCategory = {
		_id: 11,
		description: "parent category",
		vietDescription: "fddfx",
		level: 0
	},
	    parentCategoryId = 11;

	beforeEach(function (done) {
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({ categories: [parentCategory] });
		});

		spyOn(categoryRepository, "saveCategory").and.callFake(function (categoryData, callback) {
			return callback({ status: 201, category: testCategory });
		});

		categoryCommand.saveCategory(testCategory, function (res) {
			result = res;
			done();
		});
	});

	it("should call the save category to db function", function () {
		expect(categoryRepository.saveCategory).toHaveBeenCalled();
	});

	it("should have saved the information", function () {
		expect(result.category.parentCategoryId).toEqual(parentCategoryId);
		expect(result.status).toEqual(201);
	});
});