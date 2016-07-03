'use strict';

require('babel-polyfill');
var advertRepository = require("../../repositories/advertRepository");

var getAdvertsByCategoryQuery = function () {

    return {
        get: function get(categoryId, callback) {
            advertRepository.findAdverts(function (result) {
                if (categoryId !== undefined && categoryId !== null) {
                    result.listings = result.listings.filter(function (advert) {
                        return advert.categories !== null && advert.categories !== undefined && advert.categories.includes(categoryId);
                    });
                    return callback(result);
                } else {
                    return callback(result);
                }
            });
        }
    };
}();

module.exports = getAdvertsByCategoryQuery;