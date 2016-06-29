'use strict';
require('babel-polyfill');
let advertRepository = require("../../repositories/advertRepository");

var getAdvertsByCategoryQuery = (function () {
    
    return {
        get: (categoryId, callback) => {
            advertRepository.findAdverts((result) => {
                if (categoryId !== undefined && categoryId !== null) {
                    result.listings = result.listings.filter(advert => 
                        advert.categories !== null &&
                        advert.categories !== undefined && 
                        advert.categories.includes(categoryId));
                    return callback(result);
                } else {
                    return callback(result);
                }
            });
        }
    }
    
})();
    
module.exports = getAdvertsByCategoryQuery;