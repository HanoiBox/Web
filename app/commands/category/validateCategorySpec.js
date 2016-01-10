var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
	   BAD_REQUEST: 400,
       EXPECTATION_FAILED : 417
});
var validateCategory = require("./validateCategory");
var result = null;
    
describe("When there is no category data", () => {
	beforeEach(() => {
		result = validateCategory.validate(null);
	});
	
	it("should give an error message in the result", () => { 
		expect(result.message).toBe("Expected a category object");
        expect(result.status).toBe(417);
	});
});

describe("When there is no category vietnamese description", () => {
	beforeEach(() => {
		result = validateCategory.validate({ vietDescription: "", description: "cat 1" });
	});
	
	it("should give an error message in the result", () => { 
		expect(result.message).toBe("No Vietnamese category description was given");
        expect(result.status).toBe(400);
	});
});

describe("When there is no category English description", () => {
	beforeEach(() => {
		result = validateCategory.validate({ description: "", vietDescription: "cat 1" });
	});
	
	it("should give an error message in the result", () => { 
		expect(result.message).toBe("No English category description was given");
        expect(result.status).toBe(400);
	});
});