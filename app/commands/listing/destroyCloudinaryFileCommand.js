'use strict';
var cloudinary = require('cloudinary');

let destroyImageCommand = function () {
    let destroyCloudinaryImagePromise = (publicId) => {
         return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (result) => {
                if (result.error !== undefined)
                {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true });
            });
         });
    }

    return {
        destroy: destroyCloudinaryImagePromise
    }
}();

module.exports = destroyImageCommand;