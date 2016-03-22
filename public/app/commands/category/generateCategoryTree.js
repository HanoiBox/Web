import angular from 'angular';

export default angular.module('categoryCommandModule', [])
.factory('GenerateCategoryTree', function() {
    
    var generateCategoryTree = (categories, currentCategoryId) => {
        
        var topCats = categories.filter(cat => cat.level === 0);
        
        return topCats.map(topCat => {
                let firstSubCategories = categories.filter(cat => cat.parentCategoryId === topCat._id && cat.level === 1);
                let tree = firstSubCategories.map(firstCat => {
                    let subCategories = categories.filter(cat => cat.parentCategoryId === firstCat._id);
                    let subCatsConvertedToSubTree = null;
                    if (subCategories.length > 0)
                    {
                        subCatsConvertedToSubTree = subCategories.map(subCat => {
                            let linkUrl = `/category/id:${subCat._id}`;
                            return { name: subCat.description, link: linkUrl, id: subCat._id, currentCategoryId: currentCategoryId, subtree: null };
                        });     
                    }
                    
                    let topLinkUrl = `/category/id:${firstCat._id}`;
                    return { name: firstCat.description, link: topLinkUrl, id: firstCat._id, currentCategoryId: currentCategoryId, subtree: subCatsConvertedToSubTree };
                });
            
            return {
                description: topCat.description,
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