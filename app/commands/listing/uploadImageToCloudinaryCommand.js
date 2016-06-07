'use strict';
var cloudinary = require('cloudinary');

let uploadImageCommand = function () {

    let cloudinaryPromise = (imageData) => {
        return new Promise((resolve, reject) => {
            cloudinary.uploader.upload(imageData.filename, function(result) {
                if (result.error !== undefined)
                {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true, url: result.secure_url });
            });
        });
    }

    return {
        upload: cloudinaryPromise
    }
}();

module.exports = uploadImageCommand;