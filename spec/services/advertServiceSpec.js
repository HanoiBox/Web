var mockRequire = require("../../node_modules/mock-require/index.js");
mockRequire('../../app/repositories/categoryRepository', { find: function() {
	console.log('categoryRepository.find called');
}});

mockRequire('../../app/repositories/advertRepository', { saveAdvert: function() {
	console.log('advertRepository.saveAdvert called');
}});
var advertService = require("../../app/services/advertService.js");
var advertRepository = require("../../app/repositories/advertRepository");

describe("When something", () => {
	beforeEach( () => {
		console.log("yar 1");
		//spyOn(advertRepository, "saveAdvert").and.returnValue(true);
		//spyOn(categoryRepository
		
	});
	
	it("should", () => { 
		console.log("yar");
		expect(advertRepository.saveAdvert()).toHaveBeenCalled();
	});
});