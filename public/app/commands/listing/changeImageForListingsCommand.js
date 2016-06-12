import angular from 'angular';

export default angular.module('changeImageForListingsCommandModule',[])
.factory('changeImageForListingsFactory', function() {
    return {
        change: (listings) => {
            let changedListings = listings.map((listing) => {
                if (listing.image1 !== undefined) {
                    listing.image1 = listing.image1.replace('upload', 'upload/w_100');    
                }
                if (listing.image2 !== undefined) {
                    listing.image2 = listing.image2.replace('upload', 'upload/w_100');
                }
                
                return listing;
            });

            return changedListings;
        }
    }
});