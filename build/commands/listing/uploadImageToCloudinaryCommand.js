'use strict';

var cloudinary = require('cloudinary');

var uploadImageCommand = function () {

    var cloudinaryPromise = function cloudinaryPromise(imageData) {
        return new Promise(function (resolve, reject) {
            cloudinary.uploader.upload(imageData.path, function (result) {
                if (result.error !== undefined) {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true, publicId: result.public_id, url: result.secure_url, originalPath: imageData.path, name: result.original_filename + '.' + result.format });
            });
        });
    };

    return {
        upload: cloudinaryPromise
    };
}();

module.exports = uploadImageCommand;