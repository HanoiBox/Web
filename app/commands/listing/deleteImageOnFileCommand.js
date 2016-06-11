'use strict';
var fs = require('fs');

module.exports = {
    deleteImage: (path) => {
        return new Promise((resolve, reject) => {
            fs.unlink(path, (err) => {
                if (err) {
                reject({ 
                    success: false, 
                    error: err 
                    });  
                } 
                console.log('successfully deleted ' + path);
                resolve({ 
                    success: true 
                });
            });
        });
    }
};