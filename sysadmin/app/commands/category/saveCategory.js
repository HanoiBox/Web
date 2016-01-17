import angular from 'angular';
import categoriesCacheModule from 'sysadmin/app/categoriesCache';

export default angular.module('categoryCommandModule', [
   categoriesCacheModule.name
]).factory('SaveCategoriesFactory', function($http, $templateCache, categoriesCacheFactory) {
    let url = "/api/category/";
    
    let categoriesCacheName = categoriesCacheFactory.info().id;
    
    let addCategoryToCache = (category) => {
        let categories = categoriesCacheFactory.get(categoriesCacheName);
        categories.push(category);
        categoriesCacheFactory.put(categoriesCacheName, categories);
    }
    
    let removeCategoryFromCache = (id) => {
        let categories = categoriesCacheFactory.get(categoriesCacheName);
        categoriesCacheFactory.remove(categoriesCacheName);
        categoriesCacheFactory.put(categoriesCacheName, categories.filter(cat => cat._id !== id));
    }
    
    let populateParentCategory = (category) => {
        let categories = categoriesCacheFactory.get(categoriesCacheName);
        category.parentCategory = categories.filter(cat => cat._id === category.parentCategoryId)[0];
        return category;
    }
  
    let stringToNumber = (value) => {
        if (typeof value === 'string') {
            return parseInt(value, 10);
        } else {
            return value;
        }
    } 
  
    this.edit = (category, callback) => {
        if (category.parentCategoryId === "null")
        {
            category.parentCategoryId = null;
            category.parentCategory = null;
            category._id = stringToNumber(category._id);
        } else {
            category.parentCategoryId = stringToNumber(category.parentCategoryId)
            category._id = stringToNumber(category._id);
            category = populateParentCategory(category);
        }
        let putUrl = url + category._id;
        $http.put(putUrl, category, $templateCache).then((response) => {
            removeCategoryFromCache(category._id);
            addCategoryToCache(response.data.category);
            callback({ success : true, category: response.data.category });
        }, (response) => {
            callback({ success: false, error: response.data.message });
        }); 
    }

    this.save = (category, callback) => {
        $http.post(url, category, $templateCache).then((response) => {
            var category = response.data.category;
            addCategoryToCache(category);
            callback({ success: true, category });
        }, (response) => {
            callback({ success: false, error: response.data.message });
        });
    }

    let saveCategory = (category, callback) => {
        if (category === null || category === undefined) {
            callback({ success: false, error: "no data" });
            return;
        }
        if (category._id === undefined || category._id === null) {
            this.save(category, (result) => {
                callback(result);
            }); 
        } else {
            this.edit(category, (result) => {
                callback(result);
            }); 
        }
    }

    return {
        saveCategory
    }
});