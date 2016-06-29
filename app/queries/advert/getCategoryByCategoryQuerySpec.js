'use strict';
var mockRequire = require("../../../node_modules/mock-require/index.js");
mockRequire.stopAll();
mockRequire('../../httpStatus', {
	   OK : 200
});
mockRequire('../../repositories/advertRepository', {
    findAdverts: function() {}
});
let getAdvertsByCategoryQuery = require("./getAdvertsByCategoryQuery"),
    advertRepository = require("../../repositories/advertRepository"),
    result;

// describe("When there are two adverts it returns them both", () => {
//     beforeEach((done) => {
//         spyOn(advertRepository, "findAdverts").and.callFake((callback) => {
// 			return callback({ status: 200, listings: [ 
//                 { 
//                     _id: 1
//                 }, {
//                     _id: 2
//                 }]
//             });
// 		});
//         getAdvertsByCategoryQuery.get(null, (res) => {
//             result = res;
//             done(); 
//         });
//     });
    
//     it("Should return listings with two advert objects", () => {
//         expect(result.listings.length).toEqual(2);
//         expect(result.listings[0]._id).toEqual(1);
//         expect(result.listings[1]._id).toEqual(2);
//     });
// });

describe("When there are two adverts and one is not in the requested category", () => {
    beforeEach((done) => {
        spyOn(advertRepository, "findAdverts").and.callFake((callback) => {
			return callback({ status: 200, listings: [ 
                { 
                    _id: 1,
                    categories: [1]
                }, {
                    _id: 2,
                    categories: [2]
                }]
            });
		});
        getAdvertsByCategoryQuery.get(1, (res) => {
            result = res;
            done(); 
        });
    });
    
    it("Should return listings with two advert objects", () => {
        expect(result.listings.length).toEqual(1);
        expect(result.listings[0]._id).toEqual(1);
    });
});

// describe("When there are four adverts and two are not in the requested categories", () => {
//     beforeEach((done) => {
//         spyOn(advertRepository, "findAdverts").and.callFake((callback) => {
// 			return callback({ status: 200, listings: [ 
//                 { 
//                     _id: 1,
//                     categories: [1, 2, 7]
//                 }, {
//                     _id: 2,
//                     categories: [1]
//                 },
//                 {
//                     _id: 3,
//                     categories: [2]
//                 },
//                 {
//                     _id: 4,
//                     categories: [7, 3, 2]
//                 },]
//             });
// 		});
//         getAdvertsByCategoryQuery.get(1, (res) => {
//             result = res;
//             done(); 
//         });
//     });
    
//     it("Should return listings with four objects", () => {
//         expect(result.listings.length).toEqual(2);
//         expect(result.listings[0]._id).toEqual(1);
//         expect(result.listings[1]._id).toEqual(2);
//     });
// });