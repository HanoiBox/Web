import angular from 'angular';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

export default angular.module('deleteCategoryCommandModule', [
   categoriesCacheModule.name
]).factory('DeleteCategoryFactory', function($http, $templateCache, categoriesCacheFactory) {
    let url = "/api/category/";
  
    let execute = (id, callback) => {
        let deleteUrl = url + id;
        //test
        let categories = categoriesCacheFactory.get();
        let random = categories.find(cat => cat._id === id);
        
        $http.delete(deleteUrl).then(() => {
            let categories = categoriesCacheFactory.get();
            categories.filter(cat => cat._id !== id);
            
            categoriesCacheFactory.put(categories);
            callback({ success : true });
        }, (response) => {
            callback({ success: false, response });
        });
    }

    return {
        execute
    }
});