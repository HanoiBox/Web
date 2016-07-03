'use strict';
var cloudinary = require('cloudinary');

let uploadImageCommand = function () {

    let cloudinaryPromise = (imageData) => {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(imageData.path, function(result) {
                if (result.error !== undefined)
                {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true, publicId: result.public_id, url: result.secure_url, originalPath: imageData.path, name: `${result.original_filename}.${result.format}` });
            });
        });
    }

    return {
        upload: cloudinaryPromise
    }
}();

module.exports = uploadImageCommand;