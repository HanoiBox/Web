'use strict';
let dataCleaner = function () {
    let guaranteeNumber = (value) => {
        if (Number.isNaN(value) || typeof value === 'string') {
            return parseInt(value, 10);
        }
    } 
    
    return {
        cleanseCategory: (data) => {
            data._id = guaranteeNumber(data._id);
            data.parentCategoryId = guaranteeNumber(data.parentCategoryId);
            return data;
        }
    }
}();


module.exports = dataCleaner;