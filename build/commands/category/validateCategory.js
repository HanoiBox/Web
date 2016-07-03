'use strict';

var httpStatus = require('../../httpStatus');

var validateCategoryCommand = function () {

	var validate = function validate(categoryData) {
		if (categoryData === null) {
			return { status: httpStatus.EXPECTATION_FAILED, message: "Expected a category object" };
		}
		if (categoryData.description === undefined || categoryData.description === "") {
			return { status: httpStatus.BAD_REQUEST, message: "No English category description was given" };
		}
		if (categoryData.vietDescription === undefined || categoryData.vietDescription === "") {
			return { status: httpStatus.BAD_REQUEST, message: "No Vietnamese category description was given" };
		}
		return null;
	};

	return {
		validate: validate
	};
}();

module.exports = validateCategoryCommand;