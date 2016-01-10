var dataCleaner = require("./dataCleaner");
var result = null;

describe("When the parentId and the id are strings", () => {
	beforeEach(() => {
		result = dataCleaner.cleanseCategory({ _id: "1", parentCategoryId: "2", description: "", vietDescription: "cat 1" });
	});
	
	it("should convert to integers", () => { 
		expect(result._id).toEqual(jasmine.any(Number));
        expect(result.parentCategoryId).toEqual(jasmine.any(Number));
	});
});