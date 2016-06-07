var cloudinary = require('cloudinary');

module.exports = { 
    setup: function(envVariables) {
        
        //TODO: setup env variables e.g. envVariables.imagecloudname imageapikey imageapisecret
        cloudinary.config({ 
                cloud_name: 'HNB_ListingImages', 
                api_key: '934938854166124', 
                api_secret: 'hVsnN3N1xjplFYNKds-3NBWILSk' 
            });
    }    
}