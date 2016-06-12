var mockRequire = require("../../../node_modules/mock-require/index.js");
//mockRequire.stopAll();
mockRequire('cloudinary', {
	uploader: {
        upload: function() {}
    }
});
var cloudinary = require('cloudinary');
var uploadImageCommand = require("./uploadImageToCloudinaryCommand");
var result = null;

describe("When something goes wrong at cludinary", () => {

    beforeEach((done) => {
        var testImageData = {
            fieldname: 'file',
            originalname: 'Me1.jpg',
            mimetype: 'image/jpeg',
            destination: 'uploads/',
            filename: '761676199e4fd75ebcf0ada7b7cf75ac'
        }

        spyOn(cloudinary.uploader, "upload").and.callFake(function(id, callback) {
			return callback({ 
                error: { 
                    message: "Resource not found - strange_name" 
                } 
            });
		});

		uploadImageCommand.upload(testImageData).then((uploadResult) => {
            result = uploadResult;
            done();
        }).catch((reason) => {
            result = reason;
            done();
        });
	});
	
	it("should give an error message in the result", () => { 
		expect(result).not.toBe(null);
        expect(result.error).not.toBe(null);
        expect(result.error.message).toBe("Resource not found - strange_name");
	});

});

describe("When the file is uploaded", () => {
	beforeEach((done) => {
        var testImageData = {
            fieldname: 'file',
            originalname: 'Me1.jpg',
            mimetype: 'image/jpeg',
            destination: 'uploads/',
            filename: '761676199e4fd75ebcf0ada7b7cf75ac',
            path: 'uploads\\6e0bfe1d8753add579a563e723c0ad96'
        }

        spyOn(cloudinary.uploader, "upload").and.callFake(function(id, callback) {
			return callback({ 
                url: 'http://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                secure_url: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
                public_id: 'sample',
                version: '1312461204',
                width: 864,
                height: 564,
                format: 'png',
                created_at: '2016-06-07T09:55:32Z',
                resource_type: 'image',
                tags: [], 
                bytes: 9597, 
                type: 'upload', 
                etag: 'd1ac0ee70a9a36b14887aca7f7211737', 
                signature: 'abcdefgc024acceb1c1baa8dca46717137fa5ae0c3',
                original_filename: 'sample' 
            });
		});

		uploadImageCommand.upload(testImageData).then((uploadResult) => {
            result = uploadResult;
            done();
        }).catch((reason) => {
            result = reason;
            done();
        });
	});
	
	it("should be all good in the result", () => { 
		expect(result).not.toBe(null);
        expect(result.success).toBe(true);
        expect(result.url).toBe("https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg");
	});
});