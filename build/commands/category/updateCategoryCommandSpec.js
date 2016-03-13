'use strict';

var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../repositories/categoryRepository', {
    getCategory: function getCategory() {},
    updateCategory: function updateCategory() {}
});
mockRequire('./validateCategory', {
    validate: function validate(categoryData) {
        return null;
    }
});
mockRequire('../../httpStatus', {
    OK: 200,
    NOT_FOUND: 404
});
mockRequire('./dataCleaner', {
    cleanseCategory: function cleanseCategory(data) {
        return data;
    }
});
var categoryValidation = require("./validateCategory");
var categoryCommand = require("./updateCategoryCommand");
var categoryRepository = require("../../repositories/categoryRepository");
var result = null,
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

describe("When the there is no category", function () {
    beforeEach(function (done) {
        spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
            return callback({ status: 404, message: "Unable to find category: " + id });
        });

        categoryCommand.updateCategory(1, testCategory, function (res) {
            result = res;
            done();
        });
    });

    it("should give a 404 message in the result", function () {
        expect(result.message).toBe("Unable to find category: 1");
        expect(result.status).toBe(404);
    });
});

describe("When everything is OK", function () {
    beforeEach(function (done) {
        spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
            return callback({ status: 200, category: testCategory });
        });

        spyOn(categoryRepository, "updateCategory").and.callFake(function (categoryData, updateCategory, callback) {
            return callback({ status: 200, category: updateCategory });
        });

        categoryCommand.updateCategory(1, updateCategory, function (res) {
            result = res;
            done();
        });
    });

    it("should call update category", function () {
        expect(categoryRepository.updateCategory).toHaveBeenCalled();
    });

    it("should have saved the information", function () {
        expect(result.category).toEqual(updateCategory);
    });
});

describe("When there is a parent category", function () {
    var result = undefined,
        parentCategory = {
        _id: 11,
        description: "parent category",
        vietDescription: "fddfx",
        level: 0
    },
        parentCategoryId = 11;

    beforeEach(function (done) {
        spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
            if (id === 1) {
                return callback({ status: 200, category: testCategory });
            }
            if (id === 11) {
                return callback({ status: 200, category: parentCategory });
            }
        });

        spyOn(categoryRepository, "updateCategory").and.callFake(function (categoryData, updateCategory, callback) {
            return callback({ status: 200, category: updateCategory });
        });

        categoryCommand.updateCategory(1, updateCategory, function (res) {
            result = res;
            done();
        });
    });

    it("should call update category", function () {
        expect(categoryRepository.updateCategory).toHaveBeenCalled();
    });

    it("should have saved and returned the parent categorys", function () {
        expect(result.category.parentCategoryId).toEqual(parentCategoryId);
        expect(result.category.parentCategory).toEqual(parentCategory);
    });
});

describe("When removing a parent category", function () {
    var result = undefined,
        parentCategory = {
        _id: 11,
        description: "parent category",
        vietDescription: "fddfx",
        level: 0
    },
        parentCategoryId = 11,
        updateCategory = {
        _id: 11,
        description: "parent category",
        vietDescription: "fddfx",
        level: 0,
        parentCategoryId: undefined,
        parentCategory: undefined
    };

    beforeEach(function (done) {
        // parent category is already present
        testCategory.parentCategoryId = parentCategoryId;
        testCategory.parentCategory = parentCategory;

        spyOn(categoryRepository, "getCategory").and.callFake(function (id, callback) {
            if (id === 1) {
                return callback({ status: 200, category: testCategory });
            }
            if (id === 11) {
                return callback({ status: 200, category: parentCategory });
            }
        });

        spyOn(categoryRepository, "updateCategory").and.callFake(function (categoryData, updateCategory, callback) {
            return callback({ status: 200, category: updateCategory });
        });

        categoryCommand.updateCategory(1, updateCategory, function (res) {
            result = res;
            done();
        });
    });

    it("should call update category", function () {
        expect(categoryRepository.updateCategory).toHaveBeenCalled();
    });

    it("should have saved and returned empty parent category", function () {
        expect(result.category.parentCategoryId).toEqual(undefined);
        expect(result.category.parentCategory).toEqual(undefined);
    });
});