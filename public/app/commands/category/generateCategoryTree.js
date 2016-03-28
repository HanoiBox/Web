import angular from 'angular';

export default angular.module('categoryTreeCommandModule', [])
.factory('GenerateCategoryTree', function() {
    
    let createLeafCategory = (id, currentCategoryId, englishDescription, vietnameseDescription, subtree) => {
        return { id: id, currentCategoryId: currentCategoryId, title: englishDescription, name: vietnameseDescription, link: `/category/id:${id}`, subtree: subtree };
    };
    
    let generateCategoryTree = (categories, currentCategoryId) => {
        
        var topCats = categories.filter(cat => cat.level === 0);
        
        return topCats.map(topCat => {
                let firstSubCategories = categories.filter(cat => cat.parentCategoryId === topCat._id && cat.level === 1);
                let tree = firstSubCategories.map(firstCat => {
                    let subCategories = categories.filter(cat => cat.parentCategoryId === firstCat._id);
                    let subCatsConvertedToSubTree = null;
                    if (subCategories.length > 0)
                    {
                        subCatsConvertedToSubTree = subCategories.map(subCat => {
                            return createLeafCategory(subCat._id, currentCategoryId, subCat.description, subCat.vietDescription, null);
                        });
                    }
                    
                    return createLeafCategory(firstCat._id, currentCategoryId, firstCat.description, firstCat.vietDescription, subCatsConvertedToSubTree);
                });
            
            return {
                name: topCat.vietDescription,
                title: topCat.description,
                link: `/category/id:${topCat._id}`,
                id: topCat._id,
                tree
            };
        });
    };
    
    return {
        generate: generateCategoryTree
    }
});