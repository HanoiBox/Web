'use strict';

var fs = require('fs');

module.exports = {
    deleteImage: function deleteImage(path) {
        return new Promise(function (resolve, reject) {
            fs.unlink(path, function (err) {
                if (err) {
                    reject({
                        success: false,
                        error: err
                    });
                }
                resolve({
                    success: true
                });
            });
        });
    }
};