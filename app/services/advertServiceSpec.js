var mockRequire = require("../../node_modules/mock-require/index.js");
mockRequire('../../app/repositories/categoryRepository', { findCategories: function(callback) {
	return callback(null);
}});

mockRequire('../../app/repositories/advertRepository', { saveAdvert: function(callback) {
	return callback(null);
}});
var advertService = require("../../app/services/advertService.js");
var advertRepository = require("../../app/repositories/advertRepository");
var categoryRepository = require("../../app/repositories/categoryRepository");

describe("When there is no advert data sent", () => {
	var result = null;
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert");
		
		advertService.saveAdvert(null, (res) => {
			result = res;
			done();
		});
	});
	
	it("should give an error message in the result", () => { 
		expect(result).toBe("This advert was completely empty");
	});
	
	it("should not call save advert", () => { 
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there is no information in the advert", () => {
	var result = null;
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert");
		advertService.saveAdvert({ information : "" }, (res) => {
			result = res;
			done();
		});
	});
	
	it("should give an error message in the result", () => { 
		expect(result).toBe("This advert did not have any information to save");
	});
	
	it("should not call save advert", () => { 
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are no categories in the advert", () => {
	it("should give an error message in the result", (done) => {
		var result = null;
		advertService.saveAdvert({ information : "test info", categories : null }, (res) => {
			result = res;
			done();
		}); 
		expect(result).toBe("This advert did not have any categories, there must be at least one category given");
	});
	
	it("should give an error message in the result", (done) => {
		var result = null;
		advertService.saveAdvert({ information : "test info", categories : "" }, (res) => {
			result = res;
			done();
		}); 	
		expect(result).toBe("This advert did not have any categories, there must be at least one category given");
	});
});

describe("When there is an invalid category sent as a string", () => {
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({ error: "", categories: [ { _id : 2 } ] });
		});
		
		advertService.saveAdvert({ information : "test info", categories : "1" }, (res) => {
			result = res;
			done();
		}); 
	});
	
	it("should return a not saved message", () => {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});
	
	it("should call save advert", () => {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent but one invalid", () => {
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({
					categories : [ 
						{ _id : 2 }
					]});
		});
		
		advertService.saveAdvert({ information : "test info", categories : "1, 2" }, (res) => {
			result = res;
			done();
		}); 
	});
	
	it("should return a not saved message", () => {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});
	
	it("should call save advert", () => {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent but two invalid", () => {
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert");
		spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({
					message: "", 
					categories : [ 
						{ _id : 2 }, 
						{ _id : 3 }
					]});
		});
		
		advertService.saveAdvert({ information : "test info", categories : "1, 2, 3, 4" }, (res) => {
			result = res;
			done();
		}); 
	});
	
	it("should return a not saved message", () => {
		expect(result).toBe("This advert had some invalid categories, please check and try again");
	});
	
	it("should call save advert", () => {
		expect(advertRepository.saveAdvert).not.toHaveBeenCalled();
	});
});

describe("When there are multiple categories sent and are valid", () => {
	beforeEach((done) => {
		spyOn(advertRepository, "saveAdvert").and.returnValue(true);
		spyOn(categoryRepository, "findCategories").and.callFake((callback) => {
			return callback({
					message: "", 
					categories : [ 
						{ _id : 2 }, 
						{ _id : 3 }
					]});
		});
		
		advertService.saveAdvert({ information : "test info", categories : "2, 3" }, (res) => {
			result = res;
			done();
		}); 
	});
	
	it("should return a not saved message", () => {
		expect(result).toBe("");
	});
	
	it("should call save advert", () => {
		expect(advertRepository.saveAdvert).toHaveBeenCalled();
	});
});