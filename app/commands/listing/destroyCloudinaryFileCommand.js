'use strict';
var cloudinary = require('cloudinary');

module.exports = {
    destroy: (publicId) => {
         return new Promise((resolve, reject) => {
            cloudinary.uploader.destroy(publicId, (result) => {
                console.log(result);
                if (result.error !== undefined)
                {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true });
            });
         });
    }
};