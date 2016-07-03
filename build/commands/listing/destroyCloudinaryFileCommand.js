'use strict';

var cloudinary = require('cloudinary');

module.exports = {
    destroy: function destroy(publicId) {
        return new Promise(function (resolve, reject) {
            cloudinary.uploader.destroy(publicId, function (result) {
                console.log(result);
                if (result.error !== undefined) {
                    reject({ success: false, error: result.error });
                }
                resolve({ success: true });
            });
        });
    }
};