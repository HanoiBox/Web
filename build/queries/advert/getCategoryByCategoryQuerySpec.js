'use strict';

var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
    OK: 200
});
mockRequire('../../repositories/advertRepository', {
    findAdverts: function findAdverts() {}
});
var getAdvertsByCategoryQuery = require("./getAdvertsByCategoryQuery"),
    advertRepository = require("../../repositories/advertRepository"),
    result = undefined;

describe("When there are two adverts it returns them both", function () {
    beforeEach(function (done) {
        spyOn(advertRepository, "findAdverts").and.callFake(function (callback) {
            return callback({ status: 200, adverts: [{
                    _id: 1
                }, {
                    _id: 2
                }]
            });
        });
        getAdvertsByCategoryQuery.get(null, function (res) {
            result = res;
            done();
        });
    });

    it("Should return adverts with two advert objects", function () {
        expect(result.adverts.length).toEqual(2);
        expect(result.adverts[0]._id).toEqual(1);
        expect(result.adverts[1]._id).toEqual(2);
    });
});

describe("When there are two adverts and one is not in the requested category", function () {
    beforeEach(function (done) {
        spyOn(advertRepository, "findAdverts").and.callFake(function (callback) {
            return callback({ status: 200, adverts: [{
                    _id: 1,
                    categories: [1]
                }, {
                    _id: 2,
                    categories: [2]
                }]
            });
        });
        getAdvertsByCategoryQuery.get(1, function (res) {
            result = res;
            done();
        });
    });

    it("Should return adverts with two advert objects", function () {
        expect(result.adverts.length).toEqual(1);
        expect(result.adverts[0]._id).toEqual(1);
    });
});

describe("When there are four adverts and two are not in the requested categories", function () {
    beforeEach(function (done) {
        spyOn(advertRepository, "findAdverts").and.callFake(function (callback) {
            return callback({ status: 200, adverts: [{
                    _id: 1,
                    categories: [1, 2, 7]
                }, {
                    _id: 2,
                    categories: [1]
                }, {
                    _id: 3,
                    categories: [2]
                }, {
                    _id: 4,
                    categories: [7, 3, 2]
                }]
            });
        });
        getAdvertsByCategoryQuery.get(1, function (res) {
            result = res;
            done();
        });
    });

    it("Should return adverts with four objects", function () {
        expect(result.adverts.length).toEqual(2);
        expect(result.adverts[0]._id).toEqual(1);
        expect(result.adverts[1]._id).toEqual(2);
    });
});