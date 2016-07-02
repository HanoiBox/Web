'use strict';

var cloudinary = require('cloudinary');

module.exports = {
    setup: function setup(envVariables, dev) {

        if (dev) {
            // use test account
            cloudinary.config({
                cloud_name: 'dfq0ukg7d',
                api_key: '714147532926127',
                api_secret: 'C4zBSWC9fwQqMik91no3LZEJMiY'
            });
        } else {
            cloudinary.config({
                cloud_name: envVariables.cloudinaryname,
                api_key: envVariables.cloudinaryapikey,
                api_secret: envVariables.cloudinaryapisecret
            });
        }
    }
};