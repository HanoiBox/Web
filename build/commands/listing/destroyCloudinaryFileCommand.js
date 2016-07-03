'use strict';

var cloudinary = require('cloudinary');

var destroyImageCommand = function () {
    var destroyCloudinaryImagePromise = function destroyCloudinaryImagePromise(publicId) {
        return new Promise(function (resolve, reject) {
            cloudinary.uploader.destroy(publicId, function (result) {
                if (result.error !== undefined) {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true });
            });
        });
    };

    return {
        destroy: destroyCloudinaryImagePromise
    };
}();

module.exports = destroyImageCommand;