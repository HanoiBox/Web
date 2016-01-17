'use strict';

var mockRequire = require("../../node_modules/mock-require/index.js");
mockRequire('../../app/repositories/categoryRepository', { findCategories: function findCategories(callback) {
		return callback(null);
	} });

mockRequire('../../app/repositories/advertRepository', { saveAdvert: function saveAdvert(callback) {
		return callback(null);
	} });
var advertService = require("../../app/services/advertService.js");
var advertRepository = require("../../app/repositories/advertRepository");
var categoryRepository = require("../../app/repositories/categoryRepository");

describe("When there is no advert data sent", function () {
	var result = null;
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert");

		advertService.saveAdvert(null, function (res) {
			result = res;
			done();
		});
	});

	it("should give an error message in the result", function () {
		expect(result).toBe("This advert was completely empty");
	});

	it("should not call save advert", function () {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there is no information in the advert", function () {
	var result = null;
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert");
		advertService.saveAdvert({ information: "" }, function (res) {
			result = res;
			done();
		});
	});

	it("should give an error message in the result", function () {
		expect(result).toBe("This advert did not have any information to save");
	});

	it("should not call save advert", function () {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are no categories in the advert", function () {
	it("should give an error message in the result", function (done) {
		var result = null;
		advertService.saveAdvert({ information: "test info", categories: null }, function (res) {
			result = res;
			done();
		});
		expect(result).toBe("This advert did not have any categories, there must be at least one category given");
	});

	it("should give an error message in the result", function (done) {
		var result = null;
		advertService.saveAdvert({ information: "test info", categories: "" }, function (res) {
			result = res;
			done();
		});
		expect(result).toBe("This advert did not have any categories, there must be at least one category given");
	});
});

describe("When there is an invalid category sent as a string", function () {
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({ error: "", categories: [{ _id: 2 }] });
		});

		advertService.saveAdvert({ information: "test info", categories: "1" }, function (res) {
			result = res;
			done();
		});
	});

	it("should return a not saved message", function () {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});

	it("should call save advert", function () {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent but one invalid", function () {
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({
				categories: [{ _id: 2 }] });
		});

		advertService.saveAdvert({ information: "test info", categories: "1, 2" }, function (res) {
			result = res;
			done();
		});
	});

	it("should return a not saved message", function () {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});

	it("should call save advert", function () {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent but two invalid", function () {
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({
				message: "",
				categories: [{ _id: 2 }, { _id: 3 }] });
		});

		advertService.saveAdvert({ information: "test info", categories: "1, 2, 3, 4" }, function (res) {
			result = res;
			done();
		});
	});

	it("should return a not saved message", function () {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});

	it("should call save advert", function () {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent and are valid", function () {
	beforeEach(function (done) {
		spyOn(advertRepository, "saveAdvert").and.returnValue(true);
		spyOn(categoryRepository, "findCategories").and.callFake(function (callback) {
			return callback({
				message: "",
				categories: [{ _id: 2 }, { _id: 3 }] });
		});

		advertService.saveAdvert({ information: "test info", categories: "2, 3" }, function (res) {
			result = res;
			done();
		});
	});

	it("should return a not saved message", function () {
		expect(result).toBe("");
	});

	it("should call save advert", function () {
		expect(advertRepository.saveAdvert).toHaveBeenCalled();
	});
});